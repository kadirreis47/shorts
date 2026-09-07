import { describe, expect, it } from 'vitest';
import {
  createSpatialContinuityEvidenceReport,
  createValidatedVisualPlanningSnapshot,
  createValidatedVisualPlanningSnapshotBundleV1,
  createVisualRhythmEvidenceReport,
  createVisualSpatialEvidenceRecord,
  isTrustedValidatedVisualPlanningSnapshotBundleV1,
  isValidatedVisualPlanningSnapshotCurrent,
  type CreateSpatialContinuityEvidenceReportInput,
  type ValidatedVisualPlanningSnapshotV1,
} from '@/core/visual-intelligence';
import {
  imageFramingBindingFromHistoricalGeometry,
  imageFramingFromAnchor,
} from '@/core/media/imageFraming';
import type { TrustedImageDisplayGeometryV1 } from '@/core/media/imageDisplayGeometry';
import type { Scene } from '@/lib/types';

const PROJECT = 'visual-planning-project';
const OTHER_PROJECT = 'visual-planning-project-other';
const OWNER = '00000000-0000-4000-8000-000000000001';
const NOW = Date.parse('2026-09-06T00:00:00.000Z');
const LIVE_EXPIRY = '2026-09-06T00:00:01.000Z';
const OUTPUT = Object.freeze({ width: 1080, height: 1920 });
const IDS = [
  'visual-scene-00000000-0000-4000-8000-000000000011',
  'visual-scene-00000000-0000-4000-8000-000000000012',
  'visual-scene-00000000-0000-4000-8000-000000000013',
  'visual-scene-00000000-0000-4000-8000-000000000014',
  'visual-scene-00000000-0000-4000-8000-000000000015',
] as const;
const MEDIA_IDS = [
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000102',
  '00000000-0000-4000-8000-000000000103',
  '00000000-0000-4000-8000-000000000104',
  '00000000-0000-4000-8000-000000000105',
] as const;

interface InputOptions {
  readonly projectId?: string;
  readonly scenes?: readonly Scene[];
  readonly unavailableSceneIds?: readonly string[];
  readonly evaluationTimeMs?: number;
  readonly outputDimensions?: Readonly<{ width: number; height: number }>;
  readonly contentDigest?: string;
  readonly focalX?: number;
  readonly focalXByScene?: Readonly<Record<string, number>>;
  readonly authorityReference?: string;
  readonly authorityExpiry?: string;
}

function scene(index: number, overrides: Partial<Scene> = {}): Scene {
  return {
    sceneId: IDS[index],
    text: `Scene ${index + 1}`,
    duration: 5,
    visual: 'image',
    imageStorage: { bucket: 'media', objectPath: path(MEDIA_IDS[index]) },
    ...overrides,
  };
}

function path(mediaId: string): string {
  return `${OWNER}/generated-images/${mediaId}.png`;
}

function mediaIdentity(value: Scene): string {
  return `media:${value.imageStorage!.objectPath}`;
}

function geometry(value: Scene, options: InputOptions): TrustedImageDisplayGeometryV1 {
  return {
    version: 1,
    mediaIdentity: mediaIdentity(value),
    encodedDimensions: { width: 1200, height: 800 },
    displayDimensions: { width: 1200, height: 800 },
    encodedToDisplay: 'identity',
    contentDigest: options.contentDigest ?? 'a'.repeat(64),
    executionAuthority: {
      version: 1,
      reference: options.authorityReference ?? `idga1_${'a'.repeat(43)}`,
      expiresAt: options.authorityExpiry ?? LIVE_EXPIRY,
    },
  };
}

function input(options: InputOptions = {}): CreateSpatialContinuityEvidenceReportInput {
  const projectId = options.projectId ?? PROJECT;
  const scenes = options.scenes ?? [scene(0), scene(1), scene(2)];
  const unavailable = new Set(options.unavailableSceneIds ?? []);
  const appliedSpatialEvidence: Record<string, ReturnType<typeof createVisualSpatialEvidenceRecord>> = {};
  const trustedImageGeometry: Record<string, TrustedImageDisplayGeometryV1> = {};
  scenes.forEach((value, sceneIndex) => {
    if (!value.imageStorage || value.videoStorage || value.videoUrl) return;
    const currentGeometry = geometry(value, options);
    trustedImageGeometry[value.sceneId] = currentGeometry;
    if (unavailable.has(value.sceneId)) return;
    appliedSpatialEvidence[value.sceneId] = createVisualSpatialEvidenceRecord({
      projectId,
      sceneId: value.sceneId,
      sceneIndex,
      scope: 'applied-image',
      mediaIdentity: mediaIdentity(value),
    }, {
      status: 'evaluated',
      contractVersion: 'visual-spatial-v1',
      analyzerVersion: 'openai:test',
      sourceDimensions: { width: 1200, height: 800 },
      focalPoint: { x: options.focalXByScene?.[value.sceneId] ?? options.focalX ?? 0.5, y: 0.5 },
      primarySubjectRegion: { x: 0.4, y: 0.25, width: 0.2, height: 0.5 },
      confidenceBand: 'medium',
    }, {
      mediaIdentity: mediaIdentity(value),
      contentDigest: options.contentDigest ?? 'a'.repeat(64),
      encodedDimensions: { width: 1200, height: 800 },
    });
  });
  return {
    projectId,
    scenes,
    appliedSpatialEvidence,
    trustedImageGeometry,
    evaluationTimeMs: options.evaluationTimeMs ?? NOW,
    outputDimensions: options.outputDimensions ?? OUTPUT,
    compositionDefaults: { motion: 'kenburns', transition: 'crossfade' },
  };
}

describe('Validated Visual Planning Snapshot V1', () => {
  it('derives deterministic compact source bindings from one explicit input boundary', () => {
    const source = input();
    const before = JSON.stringify(source);
    const first = createValidatedVisualPlanningSnapshot(source);
    const second = createValidatedVisualPlanningSnapshot(source);
    const spatial = createSpatialContinuityEvidenceReport(source);
    const rhythm = createVisualRhythmEvidenceReport({
      projectId: source.projectId,
      scenes: source.scenes,
      compositionDefaults: source.compositionDefaults,
      spatialContinuityReport: spatial,
    });

    expect(first).toEqual(second);
    expect(first.semanticFingerprint).toBe(second.semanticFingerprint);
    expect(first.spatialContinuity.freshnessFingerprint).toBe(spatial.freshnessFingerprint);
    expect(first.visualRhythm.freshnessFingerprint).toBe(rhythm.freshnessFingerprint);
    expect(first.visualRhythm.runs).toEqual(rhythm.runs.map(({ kind, sceneIds, boundaryKeys }) => ({ kind, sceneIds, boundaryKeys })));
    expect(isValidatedVisualPlanningSnapshotCurrent(first, source)).toBe(true);
    expect(JSON.stringify(source)).toBe(before);
    expect(Object.isFrozen(first.canonical.orderedScenes)).toBe(true);
    expect(Object.isFrozen(first.spatialContinuity.boundaries[0].findings)).toBe(true);
    expect(Object.isFrozen(first.visualRhythm.runs[0].sceneIds)).toBe(true);
  });

  it('creates an immutable runtime-certified bundle at the same Spatial evaluation boundary', () => {
    const source = input({ unavailableSceneIds: [IDS[1]] });
    const bundle = createValidatedVisualPlanningSnapshotBundleV1(source);
    expect(isTrustedValidatedVisualPlanningSnapshotBundleV1(bundle)).toBe(true);
    expect(Object.keys(bundle)).toEqual(['snapshot']);
    expect(Object.isFrozen(bundle)).toBe(true);
    expect(Object.isFrozen(bundle.snapshot)).toBe(true);
    expect(isTrustedValidatedVisualPlanningSnapshotBundleV1({ ...bundle })).toBe(false);
    expect(JSON.stringify(bundle)).not.toMatch(/analyzedFreshnessCanonical|executionAuthority|expiresAt|idga1_|evaluationTime/u);
  });

  it('preserves canonical order and copies only bounded factual planning material', () => {
    const source = input();
    const actual = createValidatedVisualPlanningSnapshot(source);
    expect(actual.canonical.orderedScenes.map((value) => value.sceneId)).toEqual(IDS.slice(0, 3));
    expect(actual.spatialContinuity.boundaries.map((value) => `${value.fromSceneId}:${value.toSceneId}`)).toEqual([
      `${IDS[0]}:${IDS[1]}`,
      `${IDS[1]}:${IDS[2]}`,
    ]);
    expect(actual.spatialContinuity.outputDimensions).toEqual(OUTPUT);
    expect(actual.visualRhythm.coverage).toEqual({
      structuralSceneCount: 3,
      spatialAnalyzedSceneCount: 3,
      spatialUnavailableSceneCount: 0,
      spatialUnsupportedSceneCount: 0,
    });
    expect(actual.spatialContinuity).not.toHaveProperty('sceneSignatures');
    expect(actual.visualRhythm).not.toHaveProperty('sceneSignatures');
    expect(actual.visualRhythm).not.toHaveProperty('findings');
    expect(JSON.stringify(actual)).not.toMatch(/executionAuthority|expiresAt|idga1_|requestId|recommendation|dismiss|https?:\/\//u);
  });

  it('supports analyzed, unavailable, video, and no-media scenes in one snapshot', () => {
    const scenes = [
      scene(0),
      scene(1),
      scene(2, { imageStorage: undefined, videoStorage: { bucket: 'media', objectPath: `${OWNER}/video/video.mp4` } }),
      scene(3, { imageStorage: undefined }),
    ];
    const actual = createValidatedVisualPlanningSnapshot(input({ scenes, unavailableSceneIds: [IDS[1]] }));
    expect(actual.canonical.orderedScenes.map((value) => value.mediaKind)).toEqual(['image', 'image', 'video', 'none']);
    expect(actual.canonical.orderedScenes.map((value) => Boolean(value.spatial))).toEqual([true, false, false, false]);
    expect(actual.spatialContinuity.coverage).toEqual({
      analyzedSceneIds: [IDS[0]],
      unavailableSceneIds: [IDS[1]],
      unsupportedSceneIds: [IDS[2], IDS[3]],
    });
    expect(actual.visualRhythm.coverage).toEqual({
      structuralSceneCount: 4,
      spatialAnalyzedSceneCount: 1,
      spatialUnavailableSceneCount: 1,
      spatialUnsupportedSceneCount: 2,
    });
  });

  it('regeneration detects canonical structural and composition changes', () => {
    const scenes = [scene(0), scene(1), scene(2)];
    const original = createValidatedVisualPlanningSnapshot(input({ scenes }));
    const variants: CreateSpatialContinuityEvidenceReportInput[] = [
      input({ projectId: OTHER_PROJECT, scenes }),
      input({ scenes: [scenes[1], scenes[0], scenes[2]] }),
      input({ scenes: [...scenes, scene(3)] }),
      input({ scenes: scenes.slice(0, 2) }),
      input({ scenes: [...scenes, scene(3, { imageStorage: scenes[0].imageStorage })] }),
      input({ scenes: [scenes[0], { ...scenes[1], duration: 5.001 }, scenes[2]] }),
      input({ scenes: [scenes[0], { ...scenes[1], imageStorage: { bucket: 'media', objectPath: path(MEDIA_IDS[4]) } }, scenes[2]] }),
      input({ scenes: [scenes[0], { ...scenes[1], compositionOverride: { motion: 'static' } }, scenes[2]] }),
      input({ scenes: [scenes[0], { ...scenes[1], compositionOverride: { transition: 'none' } }, scenes[2]] }),
    ];
    for (const current of variants) expect(isValidatedVisualPlanningSnapshotCurrent(original, current)).toBe(false);
    expect(createValidatedVisualPlanningSnapshot(variants[5]).semanticFingerprint).not.toBe(original.semanticFingerprint);
    expect(createValidatedVisualPlanningSnapshot(variants[7]).visualRhythm.runs).not.toEqual(original.visualRhythm.runs);
  });

  it('regeneration detects framing, digest evidence, availability, rhythm, and output changes', () => {
    const scenes = [scene(0), scene(1), scene(2)];
    const originalInput = input({ scenes });
    const original = createValidatedVisualPlanningSnapshot(originalInput);
    const framing = imageFramingFromAnchor({ x: 0.7, y: 0.5 })!;
    const framedFirst = {
      ...scenes[0],
      imageFraming: framing,
      imageFramingBinding: imageFramingBindingFromHistoricalGeometry(geometry(scenes[0], {}), mediaIdentity(scenes[0])),
    };
    const variants = [
      input({ scenes: [framedFirst, scenes[1], scenes[2]] }),
      input({ scenes, contentDigest: 'b'.repeat(64) }),
      input({ scenes, focalXByScene: { [IDS[1]]: 0.95 } }),
      input({ scenes, unavailableSceneIds: [IDS[1]] }),
      input({ scenes, outputDimensions: { width: 720, height: 1280 } }),
    ];
    for (const current of variants) expect(isValidatedVisualPlanningSnapshotCurrent(original, current)).toBe(false);
    const changed = createValidatedVisualPlanningSnapshot(variants[2]);
    expect(changed.spatialContinuity.freshnessFingerprint).not.toBe(original.spatialContinuity.freshnessFingerprint);
    expect(changed.spatialContinuity.boundaries.map((value) => value.findings))
      .not.toEqual(original.spatialContinuity.boundaries.map((value) => value.findings));
    expect(changed.visualRhythm.freshnessFingerprint).not.toBe(original.visualRhythm.freshnessFingerprint);
  });

  it('stales at authority expiry and restores exact identity after equivalent reauthorization', () => {
    const liveInput = input({ authorityExpiry: LIVE_EXPIRY });
    const live = createValidatedVisualPlanningSnapshot(liveInput);
    const expiredInput = input({ authorityExpiry: LIVE_EXPIRY, evaluationTimeMs: Date.parse(LIVE_EXPIRY) });
    const expired = createValidatedVisualPlanningSnapshot(expiredInput);
    expect(expired.spatialContinuity.coverage.unavailableSceneIds).toEqual(IDS.slice(0, 3));
    expect(expired.semanticFingerprint).not.toBe(live.semanticFingerprint);
    expect(isValidatedVisualPlanningSnapshotCurrent(live, expiredInput)).toBe(false);

    const reauthorizedInput = input({
      authorityReference: `idga1_${'b'.repeat(43)}`,
      authorityExpiry: '2099-01-01T00:00:00.000Z',
    });
    const reauthorized = createValidatedVisualPlanningSnapshot(reauthorizedInput);
    expect(reauthorized).toEqual(live);
    expect(reauthorized.semanticFingerprint).toBe(live.semanticFingerprint);
    expect(isValidatedVisualPlanningSnapshotCurrent(live, reauthorizedInput)).toBe(true);
  });

  it('fails closed for malformed or tampered snapshots', () => {
    const source = input();
    const original = createValidatedVisualPlanningSnapshot(source);
    const malformed = (value: unknown) => isValidatedVisualPlanningSnapshotCurrent(
      value as ValidatedVisualPlanningSnapshotV1,
      source,
    );
    expect(malformed({ ...original, version: 2 })).toBe(false);
    expect(malformed({ ...original, projectId: OTHER_PROJECT })).toBe(false);
    expect(malformed({ ...original, semanticFingerprint: `${original.semanticFingerprint}-tampered` })).toBe(false);
    expect(malformed({
      ...original,
      canonical: {
        orderedScenes: original.canonical.orderedScenes.map((value, index) => index === 0
          ? { ...value, durationMs: value.durationMs + 1 }
          : value),
      },
    })).toBe(false);
    expect(malformed(null)).toBe(false);
  });
});
