import { describe, expect, it } from 'vitest';
import {
  createImageFramingApplicationProposal,
  createSpatialContinuityEvidenceReport,
  createSpatialContinuityFramingRecommendations,
  createVisualSpatialEvidenceRecord,
  isSpatialContinuityFramingRecommendationCurrent,
  type CreateSpatialContinuityFramingRecommendationsInput,
} from '@/core/visual-intelligence';
import { imageFramingBindingFromHistoricalGeometry, imageFramingFromAnchor } from '@/core/media/imageFraming';
import type { TrustedImageDisplayGeometryV1 } from '@/core/media/imageDisplayGeometry';
import type { Scene } from '@/lib/types';

const PROJECT = 'spatial-continuity-framing-project';
const OWNER = '00000000-0000-4000-8000-000000000001';
const FIRST = 'visual-scene-00000000-0000-4000-8000-000000000011';
const SECOND = 'visual-scene-00000000-0000-4000-8000-000000000012';
const THIRD = 'visual-scene-00000000-0000-4000-8000-000000000013';
const MEDIA = [
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000102',
  '00000000-0000-4000-8000-000000000103',
] as const;
const OUTPUT = { width: 1080, height: 1920 } as const;
const NOW = Date.parse('2026-09-06T12:00:00.000Z');

describe('Spatial Continuity Framing Recommendation V1', () => {
  it('wraps only a current ready 13B proposal that changes the later scene final crop', () => {
    const input = recommendationInput();
    const recommendations = createSpatialContinuityFramingRecommendations(input);
    expect(recommendations).toHaveLength(1);
    expect(recommendations[0]).toMatchObject({
      version: 1,
      projectId: PROJECT,
      boundary: { fromSceneId: FIRST, fromSceneIndex: 0, toSceneId: SECOND, toSceneIndex: 1 },
      target: { sceneId: SECOND, sceneIndex: 1 },
      trigger: 'exact-crop-repetition',
      reason: 'alternative-framing-may-reduce-exact-crop-repetition',
      framingProposal: { status: 'ready', sceneId: SECOND, sceneIndex: 1 },
    });
    expect(recommendations[0].current.predecessorCrop).toEqual(recommendations[0].current.targetCrop);
    expect(recommendations[0].predicted.targetCrop).not.toEqual(recommendations[0].current.predecessorCrop);
    expect(isSpatialContinuityFramingRecommendationCurrent(recommendations[0], input)).toBe(true);
  });

  it('emits none without a current ready nested proposal', () => {
    const ready = recommendationInput();
    expect(createSpatialContinuityFramingRecommendations({ ...ready, framingProposals: {} })).toEqual([]);
    const noOp = recommendationInput({ focals: [{ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }] });
    expect(noOp.framingProposals[SECOND]?.status).toBe('no-op');
    expect(createSpatialContinuityFramingRecommendations(noOp)).toEqual([]);
    for (const status of ['unavailable', 'invalid'] as const) {
      const nested = ready.framingProposals[SECOND]!;
      expect(createSpatialContinuityFramingRecommendations({
        ...ready,
        framingProposals: { [SECOND]: { ...nested, status } },
      })).toEqual([]);
    }
  });

  it('does not recommend when a ready anchor change leaves the actual final crop repeated', () => {
    const geometric = geometry(MEDIA[1]);
    const currentFraming = imageFramingFromAnchor({ x: 0.1875, y: 0.1 })!;
    const target = scene(SECOND, MEDIA[1], {
      imageFraming: currentFraming,
      imageFramingBinding: imageFramingBindingFromHistoricalGeometry(geometric, media(MEDIA[1])),
    });
    const predecessor = scene(FIRST, MEDIA[0], {
      imageFraming: currentFraming,
      imageFramingBinding: imageFramingBindingFromHistoricalGeometry(geometry(MEDIA[0]), media(MEDIA[0])),
    });
    const input = recommendationInput({ scenes: [predecessor, target], focals: [{ x: 0.15, y: 0.5 }, { x: 0.15, y: 0.5 }] });
    expect(input.framingProposals[SECOND]).toMatchObject({ status: 'ready', proposedFraming: { anchor: { x: 0.1875, y: 0.5 } } });
    expect(createSpatialContinuityFramingRecommendations(input)).toEqual([]);
  });

  it('keeps every non-exact-crop finding informational only', () => {
    const left = imageFramingFromAnchor({ x: 0.1, y: 0.5 })!;
    const scenes = [
      scene(FIRST, MEDIA[0], { imageFraming: left, imageFramingBinding: imageFramingBindingFromHistoricalGeometry(geometry(MEDIA[0]), media(MEDIA[0])) }),
      scene(SECOND, MEDIA[1]),
    ];
    const input = recommendationInput({
      scenes,
      focals: [{ x: 0.05, y: 0.5 }, { x: 0.68, y: 0.5 }],
      subjects: [{ x: 0, y: 0.2, width: 0.1, height: 0.6 }, { x: 0.8, y: 0.1, width: 0.2, height: 0.8 }],
    });
    const findings = input.continuityReport.boundaries[0].findings;
    expect(findings).not.toContain('exact-crop-repetition');
    expect(findings).toEqual(expect.arrayContaining([
      'large-focal-position-shift',
      'subject-partially-outside-crop',
      'repeated-motion-context',
    ]));
    expect(createSpatialContinuityFramingRecommendations(input)).toEqual([]);

    const unavailable = recommendationInput({ omitSecondEvidence: true });
    expect(unavailable.continuityReport.boundaries[0].findings).toEqual(['insufficient-spatial-evidence']);
    expect(createSpatialContinuityFramingRecommendations(unavailable)).toEqual([]);
  });

  it('does not convert any supported informational finding into a hidden framing signal', () => {
    const left = imageFramingFromAnchor({ x: 0.1, y: 0.5 })!;
    const nonRepeatedScenes = [
      scene(FIRST, MEDIA[0], { imageFraming: left, imageFramingBinding: imageFramingBindingFromHistoricalGeometry(geometry(MEDIA[0]), media(MEDIA[0])) }),
      scene(SECOND, MEDIA[1]),
    ];
    const cases = [
      ['repeated-focal-zone', recommendationInput({ scenes: nonRepeatedScenes, focals: [{ x: 0.2, y: 0.5 }, { x: 0.45, y: 0.5 }] })],
      ['large-focal-position-shift', recommendationInput({ scenes: nonRepeatedScenes, focals: [{ x: 0.07, y: 0.5 }, { x: 0.68, y: 0.5 }] })],
      ['subject-occupancy-shift', recommendationInput({ scenes: nonRepeatedScenes, subjects: [{ x: 0.1, y: 0.2, width: 0.1, height: 0.4 }, { x: 0.35, y: 0.1, width: 0.35, height: 0.8 }] })],
      ['subject-partially-outside-crop', recommendationInput({ scenes: nonRepeatedScenes, subjects: [{ x: 0.3, y: 0.2, width: 0.2, height: 0.6 }, undefined] })],
      ['focal-outside-current-crop', recommendationInput({ scenes: nonRepeatedScenes, focals: [{ x: 0.9, y: 0.5 }, { x: 0.5, y: 0.5 }] })],
      ['repeated-motion-context', recommendationInput({ scenes: nonRepeatedScenes })],
    ] as const;
    for (const [finding, input] of cases) {
      expect(input.continuityReport.boundaries[0].findings).toContain(finding);
      expect(input.continuityReport.boundaries[0].findings).not.toContain('exact-crop-repetition');
      expect(createSpatialContinuityFramingRecommendations(input)).toEqual([]);
    }

    const right = imageFramingFromAnchor({ x: 0.9, y: 0.5 })!;
    const transitionInput = recommendationInput({
      scenes: [
        scene(FIRST, MEDIA[0]),
        scene(SECOND, MEDIA[1], { imageFraming: left, imageFramingBinding: imageFramingBindingFromHistoricalGeometry(geometry(MEDIA[1]), media(MEDIA[1])) }),
        scene(THIRD, MEDIA[2], { imageFraming: right, imageFramingBinding: imageFramingBindingFromHistoricalGeometry(geometry(MEDIA[2]), media(MEDIA[2])) }),
      ],
    });
    expect(transitionInput.continuityReport.boundaries[1].findings).toContain('repeated-transition-context');
    expect(transitionInput.continuityReport.boundaries[1].findings).not.toContain('exact-crop-repetition');
    expect(createSpatialContinuityFramingRecommendations(transitionInput)
      .some((item) => item.boundary.fromSceneIndex === 1)).toBe(false);
  });

  it('targets later scenes independently in canonical boundary order', () => {
    const input = recommendationInput({
      scenes: [scene(FIRST, MEDIA[0]), scene(SECOND, MEDIA[1]), scene(THIRD, MEDIA[2])],
      focals: [{ x: 0.5, y: 0.5 }, { x: 0.15, y: 0.5 }, { x: 0.85, y: 0.5 }],
    });
    const recommendations = createSpatialContinuityFramingRecommendations(input);
    expect(recommendations.map((item) => item.target)).toEqual([
      { sceneId: SECOND, sceneIndex: 1 },
      { sceneId: THIRD, sceneIndex: 2 },
    ]);
    expect(recommendations.some((item) => item.target.sceneId === FIRST)).toBe(false);
  });

  it('fails currentness closed for project, order, source, framing, evidence, report, nested proposal, and output changes', () => {
    const input = recommendationInput();
    const displayed = createSpatialContinuityFramingRecommendations(input)[0];
    expect(displayed).toBeDefined();
    const changedInputs: CreateSpatialContinuityFramingRecommendationsInput[] = [
      recommendationInput({ projectId: 'different-project' }),
      recommendationInput({ scenes: [input.continuityInput.scenes[1], input.continuityInput.scenes[0]] }),
      recommendationInput({ scenes: [input.continuityInput.scenes[0], scene(THIRD, MEDIA[2]), input.continuityInput.scenes[1]] }),
      recommendationInput({ scenes: [input.continuityInput.scenes[1]] }),
      recommendationInput({ scenes: [...input.continuityInput.scenes, scene(THIRD, MEDIA[1])] }),
      recommendationInput({ digest: 'b'.repeat(64) }),
      recommendationInput({ secondFraming: imageFramingFromAnchor({ x: 0.8, y: 0.5 })! }),
      recommendationInput({ focals: [{ x: 0.5, y: 0.5 }, { x: 0.85, y: 0.5 }] }),
      { ...input, continuityReport: { ...input.continuityReport, freshnessFingerprint: `${input.continuityReport.freshnessFingerprint}:stale` } },
      { ...input, framingProposals: { [SECOND]: { ...input.framingProposals[SECOND]!, authority: 'stale' } } },
      recommendationInput({ outputDimensions: { width: 1920, height: 1080 } }),
    ];
    for (const changed of changedInputs) expect(isSpatialContinuityFramingRecommendationCurrent(displayed, changed)).toBe(false);
  });

  it('is deterministic and neutral to equivalent live capability rotation', () => {
    const original = recommendationInput();
    const first = createSpatialContinuityFramingRecommendations(original)[0];
    const repeated = createSpatialContinuityFramingRecommendations(original)[0];
    expect(repeated).toEqual(first);

    const rotated = recommendationInput({ authorityMarker: 'b', expiresAt: '2098-01-01T00:00:00.000Z' });
    const afterRotation = createSpatialContinuityFramingRecommendations(rotated)[0];
    expect(afterRotation).toEqual(first);
    expect(afterRotation.freshnessFingerprint).toBe(first.freshnessFingerprint);
  });

  it('fails closed at expiry and restores the same identity after equivalent reauthorization', () => {
    const expiresAt = new Date(NOW + 1_000).toISOString();
    const live = recommendationInput({ expiresAt, evaluationTimeMs: NOW });
    const displayed = createSpatialContinuityFramingRecommendations(live)[0];
    expect(displayed).toBeDefined();
    const expired = recommendationInput({ expiresAt, evaluationTimeMs: NOW + 1_000 });
    expect(createSpatialContinuityFramingRecommendations(expired)).toEqual([]);
    expect(isSpatialContinuityFramingRecommendationCurrent(displayed, expired)).toBe(false);
    const refreshed = recommendationInput({ authorityMarker: 'c', expiresAt: new Date(NOW + 60_000).toISOString() });
    expect(createSpatialContinuityFramingRecommendations(refreshed)[0].freshnessFingerprint).toBe(displayed.freshnessFingerprint);
  });
});

function recommendationInput(options: {
  projectId?: string;
  scenes?: readonly Scene[];
  focals?: readonly { x: number; y: number }[];
  subjects?: readonly ({ x: number; y: number; width: number; height: number } | undefined)[];
  digest?: string;
  authorityMarker?: string;
  expiresAt?: string;
  evaluationTimeMs?: number;
  outputDimensions?: { width: number; height: number };
  secondFraming?: NonNullable<Scene['imageFraming']>;
  omitSecondEvidence?: boolean;
} = {}): CreateSpatialContinuityFramingRecommendationsInput {
  const projectId = options.projectId ?? PROJECT;
  const digest = options.digest ?? 'a'.repeat(64);
  const evaluationTimeMs = options.evaluationTimeMs ?? NOW;
  const outputDimensions = options.outputDimensions ?? OUTPUT;
  let scenes = options.scenes ?? [scene(FIRST, MEDIA[0]), scene(SECOND, MEDIA[1])];
  if (options.secondFraming) {
    const secondGeometry = geometry(MEDIA[1], digest, options.authorityMarker, options.expiresAt);
    scenes = [scenes[0], {
      ...scenes[1],
      imageFraming: options.secondFraming,
      imageFramingBinding: imageFramingBindingFromHistoricalGeometry(secondGeometry, media(MEDIA[1])),
    }];
  }
  const focals = options.focals ?? scenes.map((_, index) => index === 0 ? { x: 0.5, y: 0.5 } : { x: index === 1 ? 0.15 : 0.85, y: 0.5 });
  const records = Object.fromEntries(scenes.map((item, sceneIndex) => {
    if (sceneIndex === 1 && options.omitSecondEvidence) return [item.sceneId, undefined];
    const id = mediaIdForScene(item);
    return [item.sceneId, evidence(projectId, item.sceneId, sceneIndex, id, focals[sceneIndex], options.subjects?.[sceneIndex], digest)];
  }));
  const geometries = Object.fromEntries(scenes.map((item, sceneIndex) => {
    const id = mediaIdForScene(item);
    return [item.sceneId, geometry(id, digest, options.authorityMarker, options.expiresAt)];
  }));
  const hydratedScenes = scenes.map((item) => ({ ...item, imageDisplayGeometry: geometries[item.sceneId] }));
  const continuityInput = {
    projectId,
    scenes: hydratedScenes,
    appliedSpatialEvidence: records,
    trustedImageGeometry: geometries,
    evaluationTimeMs,
    outputDimensions,
    compositionDefaults: { motion: 'static' as const, transition: 'crossfade' as const },
  };
  const continuityReport = createSpatialContinuityEvidenceReport(continuityInput);
  const framingProposals = Object.fromEntries(hydratedScenes.slice(1).map((item, index) => {
    const sceneIndex = index + 1;
    return [item.sceneId, createImageFramingApplicationProposal({
      projectId,
      scenes: hydratedScenes,
      sceneIndex,
      outputDimensions,
      effectiveMotion: 'static',
      evidence: records[item.sceneId],
      now: evaluationTimeMs,
    })];
  }));
  return { continuityReport, continuityInput, framingProposals };
}

function path(id: string): string { return `${OWNER}/generated-images/${id}.png`; }
function media(id: string): string { return `media:${path(id)}`; }
function mediaIdForScene(value: Scene): string {
  const match = /\/generated-images\/([0-9a-f-]+)\.png$/u.exec(value.imageStorage?.objectPath ?? '');
  if (!match) throw new Error('Test scene media is invalid.');
  return match[1];
}
function scene(sceneId: string, id: string, overrides: Partial<Scene> = {}): Scene {
  return { sceneId, text: sceneId, duration: 5, visual: 'image', imageStorage: { bucket: 'media', objectPath: path(id) }, ...overrides };
}
function geometry(id: string, digest = 'a'.repeat(64), authorityMarker = 'a', expiresAt = '2099-01-01T00:00:00.000Z'): TrustedImageDisplayGeometryV1 {
  return {
    version: 1,
    mediaIdentity: media(id),
    encodedDimensions: { width: 1200, height: 800 },
    displayDimensions: { width: 1200, height: 800 },
    encodedToDisplay: 'identity',
    contentDigest: digest,
    executionAuthority: { version: 1, reference: `idga1_${authorityMarker.repeat(43)}`, expiresAt },
  };
}
function evidence(projectId: string, sceneId: string, sceneIndex: number, id: string, focalPoint: { x: number; y: number }, primarySubjectRegion: { x: number; y: number; width: number; height: number } | undefined, digest: string) {
  return createVisualSpatialEvidenceRecord({ projectId, sceneId, sceneIndex, scope: 'applied-image', mediaIdentity: media(id) }, {
    status: 'evaluated',
    contractVersion: 'visual-spatial-v1',
    analyzerVersion: 'openai:test',
    sourceDimensions: { width: 1200, height: 800 },
    focalPoint,
    ...(primarySubjectRegion ? { primarySubjectRegion } : {}),
    confidenceBand: 'medium',
  }, { mediaIdentity: media(id), contentDigest: digest, encodedDimensions: { width: 1200, height: 800 } });
}
