import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDirectorEngine } from '@/core/director';
import { TypedEventBus, type ApplicationEventMap } from '@/core/events';
import { compileStudioProductionRecipeV1, createMediaEngine, normalizeStudioProductionRecipeV1, type AssetProviderEngine, type RenderManifest } from '@/core/media';
import { createDirectorInput } from '@/services/directorApplicationService';
import {
  assertDirectorManifestMatchesVisualSnapshotV1,
  createDirectorRequestSourceLifetimeV1,
  createDirectorSnapshotRequestSourceV1,
  createDirectorVisualAnalysisRequestV1,
  validateDirectorRequestCompletionV1,
  validateDirectorRequestSourceCurrentV1,
} from '@/services/directorSnapshotRequestAdapter';
import {
  createVisualSpatialEvidenceRecord,
  isTrustedValidatedVisualPlanningSnapshotBundleV1,
  type CreateSpatialContinuityEvidenceReportInput,
} from '@/core/visual-intelligence';
import type { TrustedImageDisplayGeometryV1 } from '@/core/media/imageDisplayGeometry';
import type { Scene } from '@/lib/types';
import { setValidatedOwnerId } from '@/auth/identity';
import { captureValidatedMediaOwnerContext } from '@/lib/mediaStorage';

const PROJECT = 'adapter-project';
const OWNER = '00000000-0000-4000-8000-000000000001';
const SCENES: Scene[] = [
  { sceneId: 'visual-scene-00000000-0000-4000-8000-000000000021', text: 'One', duration: 3, visual: 'One' },
  { sceneId: 'visual-scene-00000000-0000-4000-8000-000000000022', text: 'Two', duration: 4, visual: 'Two' },
];
const assetEngine: AssetProviderEngine = {
  async resolve() {
    return { assets: [], report: { resolutions: [], providerUsage: {}, cacheHits: 0, cacheMisses: 0,
      resolvedCount: 0, unresolvedCount: 2, duplicateCandidatesRejected: 0 } };
  },
  clearCache() {},
};

function visualInput(scenes: readonly Scene[] = SCENES): CreateSpatialContinuityEvidenceReportInput {
  return {
    projectId: PROJECT,
    scenes,
    appliedSpatialEvidence: {},
    trustedImageGeometry: {},
    evaluationTimeMs: 0,
    outputDimensions: { width: 1080, height: 1920 },
    compositionDefaults: { motion: 'pan', transition: 'crossfade' },
  };
}

function source(input = visualInput()) {
  const normalized = normalizeStudioProductionRecipeV1({
    projectId: PROJECT,
    title: 'Adapter',
    scenes: input.scenes,
    captionStyle: 'karaoke',
    transitionStyle: 'crossfade',
    motionStyle: 'pan',
    showSubtitles: true,
    captionTextColor: '',
    captionHighlightColor: '',
    voiceoverMode: 'none',
    narration: null,
    musicId: '',
    musicVolume: 0.25,
    beatSync: false,
    watermarkText: '',
    watermarkPosition: 'bottom-right',
    visualMode: 'auto',
    selectedStyleId: '',
    characterProfileId: '',
    useBroll: false,
    characterName: '',
    characterAppearance: '',
    characterArtStyle: '',
  }, captureValidatedMediaOwnerContext());
  let current = { projectId: PROJECT, studioRecipeIdentity: normalized.identity, visualPlanningInput: input };
  return {
    request: createDirectorSnapshotRequestSourceV1({
      projectId: PROJECT,
      buildInput: compileStudioProductionRecipeV1(normalized),
      studioRecipeIdentity: normalized.identity,
      visualPlanningInput: input,
      readCurrentProjectId: () => current.projectId,
      readCurrentSource: () => current,
    }),
    recipeIdentity: normalized.identity,
    setCurrent: (value: typeof current) => { current = value; },
  };
}

async function manifest() {
  const bus = new TypedEventBus<ApplicationEventMap>();
  const engine = createMediaEngine(bus, assetEngine);
  return (await engine.buildProject(source().request.buildInput)).manifest;
}

describe('Director Snapshot Request Adapter V1', () => {
  beforeAll(() => setValidatedOwnerId(OWNER));
  afterAll(() => setValidatedOwnerId(null));

  it('binds supported request, manifest, Recipe, and visual snapshot versions', async () => {
    const captured = source();
    const built = await manifest();
    const request = createDirectorVisualAnalysisRequestV1(1, captured.request, built, {
      startingMediaProjectId: null,
      startingMediaManifestFingerprint: null,
    });
    const report = await createDirectorEngine().analyze(createDirectorInput(built));
    expect(request).toMatchObject({
      version: 1,
      projectId: PROJECT,
      manifestBinding: { manifestBindingVersion: '1.0', manifestFingerprintVersion: 2 },
      visualPlanningBinding: { snapshotVersion: 1 },
      sourceBinding: { studioRecipeIdentity: captured.recipeIdentity },
    });
    expect(isTrustedValidatedVisualPlanningSnapshotBundleV1(captured.request.visualPlanningBundle)).toBe(true);
    expect(request.visualPlanningBundle).toBe(captured.request.visualPlanningBundle);
    expect(request.snapshot).toBe(request.visualPlanningBundle.snapshot);
    expect(validateDirectorRequestCompletionV1(request, report, built)).toEqual({ accepted: true });
  });

  it('cross-checks order, ids, raw duration, motion, transition, and media kind before submit', async () => {
    const captured = source();
    const built = await manifest();
    expect(() => assertDirectorManifestMatchesVisualSnapshotV1(built, captured.request.snapshot)).not.toThrow();
    const stale = structuredClone(built) as RenderManifest;
    stale.timeline.scenes[1].cameraMotion = 'zoom_in';
    expect(() => assertDirectorManifestMatchesVisualSnapshotV1(stale, captured.request.snapshot)).toThrow(/different canonical source facts/u);
    stale.timeline.scenes[1].cameraMotion = 'pan_left';
    stale.timeline.scenes.reverse();
    expect(() => assertDirectorManifestMatchesVisualSnapshotV1(stale, captured.request.snapshot)).toThrow(/different canonical source facts/u);
    const variants = [
      (value: RenderManifest) => { value.projectId = 'other'; },
      (value: RenderManifest) => { value.timeline.scenes[0].sourceScene.duration += 0.001; },
      (value: RenderManifest) => { value.timeline.scenes[0].sourceScene.videoUrl = 'https://example.com/video.mp4'; },
      (value: RenderManifest) => { value.timeline.scenes[1].transition.type = 'cut'; },
      (value: RenderManifest) => { value.timeline.scenes[1].index = 0; },
    ];
    for (const mutate of variants) {
      const variant = structuredClone(built) as RenderManifest;
      mutate(variant);
      expect(() => assertDirectorManifestMatchesVisualSnapshotV1(variant, captured.request.snapshot)).toThrow();
    }
  });

  it('cross-checks durable private media identity without comparing provider asset ids', async () => {
    const videoScene: Scene = {
      ...SCENES[0],
      videoStorage: { bucket: 'media', objectPath: '00000000-0000-4000-8000-000000000001/videos/00000000-0000-4000-8000-000000000002.mp4' },
    };
    const captured = source(visualInput([videoScene]));
    const engine = createMediaEngine(new TypedEventBus<ApplicationEventMap>(), assetEngine);
    const built = (await engine.buildProject(captured.request.buildInput)).manifest;
    expect(() => assertDirectorManifestMatchesVisualSnapshotV1(built, captured.request.snapshot)).not.toThrow();
    const stale = structuredClone(built) as RenderManifest;
    stale.timeline.scenes[0].sourceScene.videoStorage = { bucket: 'media', objectPath: '00000000-0000-4000-8000-000000000001/videos/00000000-0000-4000-8000-000000000003.mp4' };
    expect(() => assertDirectorManifestMatchesVisualSnapshotV1(stale, captured.request.snapshot)).toThrow();
  });

  it('rejects Recipe, visual semantics, and manifest mutations with distinct runtime outcomes', async () => {
    const captured = source();
    const built = await manifest();
    const request = createDirectorVisualAnalysisRequestV1(2, captured.request, built, {
      startingMediaProjectId: null,
      startingMediaManifestFingerprint: null,
    });
    const report = await createDirectorEngine().analyze(createDirectorInput(built));
    captured.setCurrent({ projectId: PROJECT, studioRecipeIdentity: `${captured.recipeIdentity}-changed`, visualPlanningInput: visualInput() });
    expect(validateDirectorRequestCompletionV1(request, report, built)).toEqual({ accepted: false, reason: 'manifest-stale' });
    captured.setCurrent({
      projectId: PROJECT,
      studioRecipeIdentity: captured.recipeIdentity,
      visualPlanningInput: visualInput([SCENES[1], SCENES[0]]),
    });
    expect(validateDirectorRequestCompletionV1(request, report, built)).toEqual({ accepted: false, reason: 'visual-snapshot-stale' });
    captured.setCurrent({ projectId: PROJECT, studioRecipeIdentity: captured.recipeIdentity, visualPlanningInput: visualInput() });
    const changedManifest = structuredClone(built) as RenderManifest;
    changedManifest.timeline.scenes[0].sourceScene.text = 'Changed';
    expect(validateDirectorRequestCompletionV1(request, report, changedManifest)).toEqual({ accepted: false, reason: 'manifest-stale' });
  });

  it('keeps opaque current-source callbacks outside semantic bindings', () => {
    const captured = source();
    const equivalent = { ...visualInput(), evaluationTimeMs: 99 };
    expect(validateDirectorRequestSourceCurrentV1(captured.request, equivalentSource(equivalent))).toEqual({ accepted: true });
    expect(captured.request.snapshot.semanticFingerprint).not.toContain('requestId');
  });

  it('fails closed for unsupported runtime binding versions', async () => {
    const captured = source();
    const built = await manifest();
    const request = createDirectorVisualAnalysisRequestV1(3, captured.request, built, {
      startingMediaProjectId: null,
      startingMediaManifestFingerprint: null,
    });
    const report = await createDirectorEngine().analyze(createDirectorInput(built));
    const unsupported = { ...request, version: 2 } as unknown as typeof request;
    expect(validateDirectorRequestCompletionV1(unsupported, report, built))
      .toEqual({ accepted: false, reason: 'unsupported-binding' });
  });

  it('rejects a structurally cloned Visual Planning bundle at the request boundary', async () => {
    const captured = source();
    const built = await manifest();
    const clonedBundle = { ...captured.request.visualPlanningBundle } as typeof captured.request.visualPlanningBundle;
    expect(isTrustedValidatedVisualPlanningSnapshotBundleV1(clonedBundle)).toBe(false);
    expect(() => createDirectorVisualAnalysisRequestV1(4, {
      ...captured.request,
      visualPlanningBundle: clonedBundle,
    }, built, { startingMediaProjectId: null, startingMediaManifestFingerprint: null }))
      .toThrow(/unsupported visual planning binding/u);
  });

  it('fails closed after the originating Studio source lifetime ends', async () => {
    const captured = source();
    const built = await manifest();
    const lifetime = createDirectorRequestSourceLifetimeV1();
    const request = createDirectorVisualAnalysisRequestV1(5, {
      ...captured.request,
      readCurrentProjectId: () => lifetime.read(() => PROJECT),
      readCurrentSource: () => lifetime.read(() => equivalentSource(visualInput())),
    }, built, { startingMediaProjectId: null, startingMediaManifestFingerprint: null });
    const report = await createDirectorEngine().analyze(createDirectorInput(built));
    lifetime.invalidate();
    expect(validateDirectorRequestCompletionV1(request, report, built))
      .toEqual({ accepted: false, reason: 'source-unavailable' });
  });

  it('rejects expired geometry authority but accepts equivalent opaque reauthorization', () => {
    const expiry = '2098-09-06T00:00:01.000Z';
    const initial = spatialInput(`idga1_${'a'.repeat(43)}`, expiry, Date.parse('2098-09-06T00:00:00.000Z'));
    const captured = source(initial);
    const expired = spatialInput(`idga1_${'a'.repeat(43)}`, expiry, Date.parse(expiry));
    expect(validateDirectorRequestSourceCurrentV1(captured.request, equivalentSource(expired)))
      .toEqual({ accepted: false, reason: 'visual-snapshot-stale' });
    const reauthorized = spatialInput(`idga1_${'b'.repeat(43)}`, '2099-01-01T00:00:00.000Z', Date.parse('2098-09-06T00:00:00.000Z'));
    expect(validateDirectorRequestSourceCurrentV1(captured.request, equivalentSource(reauthorized)))
      .toEqual({ accepted: true });
  });
});

function equivalentSource(visualPlanningInput: CreateSpatialContinuityEvidenceReportInput) {
  const normalized = normalizeStudioProductionRecipeV1({
    projectId: PROJECT, title: 'Adapter', scenes: visualPlanningInput.scenes, captionStyle: 'karaoke', transitionStyle: 'crossfade', motionStyle: 'pan',
    showSubtitles: true, captionTextColor: '', captionHighlightColor: '', voiceoverMode: 'none', narration: null, musicId: '', musicVolume: 0.25,
    beatSync: false, watermarkText: '', watermarkPosition: 'bottom-right', visualMode: 'auto', selectedStyleId: '', characterProfileId: '', useBroll: false,
    characterName: '', characterAppearance: '', characterArtStyle: '',
  }, captureValidatedMediaOwnerContext());
  return { projectId: PROJECT, studioRecipeIdentity: normalized.identity, visualPlanningInput };
}

function spatialInput(reference: string, expiresAt: string, evaluationTimeMs: number): CreateSpatialContinuityEvidenceReportInput {
  const imageScene: Scene = {
    sceneId: SCENES[0].sceneId,
    text: 'One',
    duration: 3,
    visual: 'One',
    imageStorage: { bucket: 'media', objectPath: '00000000-0000-4000-8000-000000000001/generated-images/00000000-0000-4000-8000-000000000002.png' },
  };
  const mediaIdentity = `media:${imageScene.imageStorage!.objectPath}`;
  const geometry: TrustedImageDisplayGeometryV1 = {
    version: 1,
    mediaIdentity,
    encodedDimensions: { width: 1200, height: 800 },
    displayDimensions: { width: 1200, height: 800 },
    encodedToDisplay: 'identity',
    contentDigest: 'a'.repeat(64),
    executionAuthority: { version: 1, reference, expiresAt },
  };
  imageScene.imageDisplayGeometry = geometry;
  const evidence = createVisualSpatialEvidenceRecord({
    projectId: PROJECT,
    sceneId: imageScene.sceneId,
    sceneIndex: 0,
    scope: 'applied-image',
    mediaIdentity,
  }, {
    status: 'evaluated',
    contractVersion: 'visual-spatial-v1',
    analyzerVersion: 'test',
    sourceDimensions: { width: 1200, height: 800 },
    focalPoint: { x: 0.5, y: 0.5 },
    confidenceBand: 'medium',
  }, {
    mediaIdentity,
    contentDigest: 'a'.repeat(64),
    encodedDimensions: { width: 1200, height: 800 },
  });
  return {
    projectId: PROJECT,
    scenes: [imageScene],
    appliedSpatialEvidence: { [imageScene.sceneId]: evidence },
    trustedImageGeometry: { [imageScene.sceneId]: geometry },
    evaluationTimeMs,
    outputDimensions: { width: 1080, height: 1920 },
    compositionDefaults: { motion: 'pan', transition: 'crossfade' },
  };
}
