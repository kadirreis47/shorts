import { describe, expect, it } from 'vitest';
import {
  DURATION_CADENCE_MAX_DELTA_MS,
  createVisualRhythmEvidenceReport,
  type SpatialContinuityEvidenceReportV1,
} from '@/core/visual-intelligence';
import type { Scene } from '@/lib/types';

const PROJECT = 'visual-rhythm-project';
const IDS = [
  'visual-scene-00000000-0000-4000-8000-000000000011',
  'visual-scene-00000000-0000-4000-8000-000000000012',
  'visual-scene-00000000-0000-4000-8000-000000000013',
  'visual-scene-00000000-0000-4000-8000-000000000014',
] as const;

function scene(index: number, overrides: Partial<Scene> = {}): Scene {
  return {
    sceneId: IDS[index], text: `Scene ${index + 1}`, duration: 5, visual: 'image',
    imageStorage: { bucket: 'media', objectPath: `owner/generated-images/${index + 1}.png` },
    ...overrides,
  };
}

function continuity(scenes: readonly Scene[], analyzed: readonly number[] = scenes.map((_, index) => index), fingerprint = 'spatial-current'): SpatialContinuityEvidenceReportV1 {
  const analyzedSet = new Set(analyzed);
  const signatures = scenes.flatMap((item, index) => analyzedSet.has(index) ? [{
    sceneId: item.sceneId, sceneIndex: index, mediaIdentity: `media:${item.imageStorage?.objectPath ?? `unknown-${index}`}`,
    crop: { x: 0.2, y: 0, width: 0.6, height: 1 }, cropCenter: { x: 0.5, y: 0.5 }, focalInsideCrop: true,
    focalZone: 'middle-center' as const, subjectOccupancyRatio: 0.25,
    effectiveMotion: 'kenburns' as const, incomingTransition: index === 0 ? 'none' as const : 'crossfade' as const, durationMs: Math.round(item.duration * 1_000),
  }] : []);
  return {
    version: 1, freshnessFingerprint: fingerprint,
    coverage: {
      analyzedSceneIds: scenes.filter((_, index) => analyzedSet.has(index)).map((item) => item.sceneId),
      unavailableSceneIds: scenes.filter((item, index) => !analyzedSet.has(index) && Boolean(item.imageStorage) && !item.videoStorage).map((item) => item.sceneId),
      unsupportedSceneIds: scenes.filter((item, index) => !analyzedSet.has(index) && (!item.imageStorage || Boolean(item.videoStorage))).map((item) => item.sceneId),
    },
    sceneSignatures: signatures,
    boundaries: scenes.slice(1).map((item, index) => ({
      fromSceneId: scenes[index].sceneId, fromSceneIndex: index, toSceneId: item.sceneId, toSceneIndex: index + 1,
      availability: analyzedSet.has(index) && analyzedSet.has(index + 1) ? 'compared' as const : 'insufficient-spatial-evidence' as const,
      findings: analyzedSet.has(index) && analyzedSet.has(index + 1) ? ['exact-crop-repetition', 'repeated-focal-zone'] as const : ['insufficient-spatial-evidence'] as const,
    })),
  };
}

function evaluate(scenes: readonly Scene[], report = continuity(scenes)) {
  return createVisualRhythmEvidenceReport({
    projectId: PROJECT, scenes, compositionDefaults: { motion: 'kenburns', transition: 'crossfade' }, spatialContinuityReport: report,
  });
}

describe('Visual Rhythm Evidence V1', () => {
  it('is deterministic, preserves canonical order, and emits maximal deterministic runs', () => {
    const scenes = [scene(0), scene(1), scene(2), scene(3, { compositionOverride: { motion: 'static' } })];
    const first = evaluate(scenes); const second = evaluate(scenes);
    expect(first).toEqual(second);
    expect(first.sceneSignatures.map((item) => item.sceneId)).toEqual(IDS);
    const motion = first.runs.find((run) => run.kind === 'effective-motion');
    expect(motion?.sceneIds).toEqual(IDS.slice(0, 3));
    expect(first.runs.filter((run) => run.kind === 'effective-motion')).toHaveLength(1);
    expect(first.runs.map((run) => run.kind)).toEqual([
      'effective-motion', 'incoming-transition', 'media-kind', 'focal-zone', 'exact-crop', 'duration-cadence',
    ]);
    expect(first.findings.map((finding) => finding.runKey)).toEqual(first.runs.map((run) => run.key));
  });

  it('models only actual incoming boundaries for transition runs', () => {
    const scenes = [scene(0), scene(1), scene(2)];
    const run = evaluate(scenes).runs.find((item) => item.kind === 'incoming-transition');
    expect(run).toMatchObject({ sceneIds: IDS.slice(0, 3), boundaryKeys: [`${IDS[0]}:${IDS[1]}`, `${IDS[1]}:${IDS[2]}`] });
    expect(evaluate([scene(0), scene(1)]).runs.some((item) => item.kind === 'incoming-transition')).toBe(false);
    const changed = [scene(0), scene(1), scene(2, { compositionOverride: { transition: 'none' } }), scene(3)];
    expect(evaluate(changed).runs.some((item) => item.kind === 'incoming-transition')).toBe(false);
  });

  it('keeps structural evidence across mixed spatial coverage while spatial runs stop at gaps', () => {
    const scenes = [scene(0), scene(1), scene(2, { imageStorage: undefined, videoStorage: { bucket: 'media', objectPath: 'owner/video.mp4' } }), scene(3, { imageStorage: undefined })];
    const actual = evaluate(scenes, continuity(scenes, [0, 1]));
    expect(actual.coverage).toEqual({ structuralSceneIds: IDS, spatialAnalyzedSceneIds: IDS.slice(0, 2), spatialUnavailableSceneIds: [], spatialUnsupportedSceneIds: IDS.slice(2) });
    expect(actual.runs.find((item) => item.kind === 'focal-zone')?.sceneIds).toEqual(IDS.slice(0, 2));
    expect(actual.runs.find((item) => item.kind === 'exact-crop')?.sceneIds).toEqual(IDS.slice(0, 2));
    expect(actual.runs.find((item) => item.kind === 'effective-motion')?.sceneIds).toEqual(IDS);
    expect(actual.runs.find((item) => item.kind === 'media-kind')?.sceneIds).toEqual(IDS.slice(0, 2));
    expect(actual.boundaries[1]).toMatchObject({ spatialAvailability: 'insufficient-spatial-evidence' });
  });

  it('does not merge unknown media identities and splits known identities', () => {
    const unknown = [scene(0, { imageStorage: undefined, videoUrl: 'https://temporary.example/a.mp4' }), scene(1, { imageStorage: undefined, videoUrl: 'https://temporary.example/b.mp4' })];
    expect(evaluate(unknown, continuity(unknown, [])).runs.some((item) => item.kind === 'media-identity')).toBe(false);
    const same = [scene(0), scene(1, { imageStorage: { bucket: 'media', objectPath: 'owner/generated-images/1.png' } }), scene(2)];
    const identity = evaluate(same).runs.find((item) => item.kind === 'media-identity');
    expect(identity?.sceneIds).toEqual(IDS.slice(0, 2));
  });

  it('uses the explicit inclusive duration cadence threshold and emits maximal cadence runs', () => {
    const cadence = [scene(0, { duration: 5 }), scene(1, { duration: 5.25 }), scene(2, { duration: 5.5 }), scene(3, { duration: 6 })];
    const first = evaluate(cadence).runs.find((item) => item.kind === 'duration-cadence');
    expect(DURATION_CADENCE_MAX_DELTA_MS).toBe(250);
    expect(first?.sceneIds).toEqual(IDS.slice(0, 3));
    const excluded = [scene(0, { duration: 5 }), scene(1, { duration: 5.251 }), scene(2, { duration: 5.5 })];
    expect(evaluate(excluded).runs.some((item) => item.kind === 'duration-cadence')).toBe(false);
  });

  it('binds fingerprint freshness to project, structural semantics, and current continuity semantics', () => {
    const scenes = [scene(0), scene(1), scene(2)]; const base = evaluate(scenes);
    const differs = (value: ReturnType<typeof evaluate>) => expect(value.freshnessFingerprint).not.toBe(base.freshnessFingerprint);
    differs(evaluate([scenes[1], scenes[0], scenes[2]]));
    differs(evaluate([...scenes, { ...scenes[0], sceneId: IDS[3] }]));
    differs(evaluate(scenes.slice(0, 2)));
    differs(evaluate([scenes[0], { ...scenes[1], duration: 6 }, scenes[2]]));
    differs(evaluate([scenes[0], { ...scenes[1], imageStorage: { bucket: 'media', objectPath: 'owner/replaced.png' } }, scenes[2]]));
    differs(evaluate([scenes[0], { ...scenes[1], compositionOverride: { motion: 'static' } }, scenes[2]]));
    differs(evaluate([scenes[0], { ...scenes[1], compositionOverride: { transition: 'none' } }, scenes[2]]));
    differs(evaluate(scenes, continuity(scenes, [0, 1, 2], 'spatial-digest-or-framing-changed')));
    expect(createVisualRhythmEvidenceReport({ projectId: 'other-project', scenes, compositionDefaults: { motion: 'kenburns', transition: 'crossfade' }, spatialContinuityReport: continuity(scenes) }).freshnessFingerprint).not.toBe(base.freshnessFingerprint);
  });

  it('is neutral to equivalent restored spatial semantics and never needs authority data', () => {
    const scenes = [scene(0), scene(1)];
    const before = evaluate(scenes, continuity(scenes, [0, 1], 'same-immutable-semantics'));
    const restored = evaluate(scenes, continuity(scenes, [0, 1], 'same-immutable-semantics'));
    expect(restored).toEqual(before);
    expect(JSON.stringify(before)).not.toMatch(/reference|expiresAt|authority|https:\/\//u);
  });
});
