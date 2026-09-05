import { describe, expect, it } from 'vitest';
import {
  SPATIAL_CONTINUITY_LARGE_FOCAL_SHIFT,
  SPATIAL_CONTINUITY_SUBJECT_OCCUPANCY_SHIFT,
  createSpatialContinuityEvidenceReport,
  createVisualSpatialEvidenceRecord,
  unavailableVisualSpatialAnalysis,
} from '@/core/visual-intelligence';
import { imageFramingBindingFromHistoricalGeometry, imageFramingFromAnchor } from '@/core/media/imageFraming';
import type { TrustedImageDisplayGeometryV1 } from '@/core/media/imageDisplayGeometry';
import type { Scene } from '@/lib/types';

const PROJECT = 'spatial-continuity-project';
const OWNER = '00000000-0000-4000-8000-000000000001';
const FIRST = 'visual-scene-00000000-0000-4000-8000-000000000011';
const SECOND = 'visual-scene-00000000-0000-4000-8000-000000000012';
const THIRD = 'visual-scene-00000000-0000-4000-8000-000000000013';
const OUTPUT: { readonly width: number; readonly height: number } = { width: 1080, height: 1920 };
const NOW = Date.parse('2026-09-05T00:00:00.000Z');

function path(id: string): string { return `${OWNER}/generated-images/${id}.png`; }
function media(id: string): string { return `media:${path(id)}`; }
function geometry(id: string, overrides: Partial<TrustedImageDisplayGeometryV1> = {}): TrustedImageDisplayGeometryV1 {
  const encodedDimensions = overrides.encodedDimensions ?? { width: 1080, height: 1920 };
  const encodedToDisplay = overrides.encodedToDisplay ?? 'identity';
  const swaps = ['transpose', 'rotate-90-cw', 'transverse', 'rotate-90-ccw'].includes(encodedToDisplay);
  return {
    version: 1,
    mediaIdentity: media(id),
    encodedDimensions,
    displayDimensions: overrides.displayDimensions ?? (swaps ? { width: encodedDimensions.height, height: encodedDimensions.width } : encodedDimensions),
    encodedToDisplay,
    contentDigest: overrides.contentDigest ?? 'a'.repeat(64),
    executionAuthority: overrides.executionAuthority ?? { version: 1, reference: `idga1_${'a'.repeat(43)}`, expiresAt: '2099-01-01T00:00:00.000Z' },
  };
}
function scene(sceneId: string, id: string, overrides: Partial<Scene> = {}): Scene {
  return { sceneId, text: sceneId, duration: 5, visual: 'image', imageStorage: { bucket: 'media', objectPath: path(id) }, ...overrides };
}
function evidence(sceneId: string, sceneIndex: number, id: string, focalPoint = { x: 0.5, y: 0.5 }, primarySubjectRegion?: { x: number; y: number; width: number; height: number }, sourceDimensions = { width: 1080, height: 1920 }, sourceDigest = 'a'.repeat(64), metadata: { analyzerVersion?: string; confidenceBand?: 'low' | 'medium' | 'high' } = {}) {
  return createVisualSpatialEvidenceRecord({ projectId: PROJECT, sceneId, sceneIndex, scope: 'applied-image', mediaIdentity: media(id) }, {
    status: 'evaluated', contractVersion: 'visual-spatial-v1', analyzerVersion: metadata.analyzerVersion ?? 'openai:test',
    sourceDimensions, focalPoint, ...(primarySubjectRegion ? { primarySubjectRegion } : {}), confidenceBand: metadata.confidenceBand ?? 'medium',
  }, { mediaIdentity: media(id), contentDigest: sourceDigest, encodedDimensions: sourceDimensions });
}
function report(scenes: readonly Scene[], records: Record<string, ReturnType<typeof evidence> | undefined>, geometries: Record<string, TrustedImageDisplayGeometryV1 | undefined>, output = OUTPUT) {
  return createSpatialContinuityEvidenceReport({
    projectId: PROJECT, scenes, appliedSpatialEvidence: records, trustedImageGeometry: geometries,
    evaluationTimeMs: NOW, outputDimensions: output, compositionDefaults: { motion: 'static', transition: 'crossfade' },
  });
}

describe('Spatial Continuity Evidence V1', () => {
  it('separates analyzed, unavailable, and unsupported scenes without inventing continuity', () => {
    const one = scene(FIRST, '00000000-0000-4000-8000-000000000101');
    const two = scene(SECOND, '00000000-0000-4000-8000-000000000102');
    const three = scene(THIRD, '00000000-0000-4000-8000-000000000103', { imageStorage: undefined, videoStorage: { bucket: 'media', objectPath: 'video.mp4' } });
    const actual = report([one, two, three], { [FIRST]: evidence(FIRST, 0, '00000000-0000-4000-8000-000000000101') }, { [FIRST]: geometry('00000000-0000-4000-8000-000000000101') });
    expect(actual.coverage).toEqual({ analyzedSceneIds: [FIRST], unavailableSceneIds: [SECOND], unsupportedSceneIds: [THIRD] });
    expect(actual.boundaries.map((boundary) => boundary.findings)).toEqual([['insufficient-spatial-evidence'], ['insufficient-spatial-evidence']]);
  });

  it('uses final inherited and non-center crops for crop-relative focal facts', () => {
    const id = '00000000-0000-4000-8000-000000000101';
    const centered = scene(FIRST, id);
    const nonCenter = scene(SECOND, '00000000-0000-4000-8000-000000000102');
    const firstGeometry = geometry(id, { encodedDimensions: { width: 1200, height: 800 }, displayDimensions: { width: 1200, height: 800 } });
    const secondGeometry = geometry('00000000-0000-4000-8000-000000000102', { encodedDimensions: { width: 1200, height: 800 }, displayDimensions: { width: 1200, height: 800 } });
    const framed = imageFramingFromAnchor({ x: 0.2, y: 0.5 })!;
    const expectedBinding = imageFramingBindingFromHistoricalGeometry(secondGeometry, media('00000000-0000-4000-8000-000000000102'));
    const actual = report([centered, { ...nonCenter, imageFraming: framed, imageFramingBinding: expectedBinding }], {
      [FIRST]: evidence(FIRST, 0, id, { x: 0.5, y: 0.5 }, undefined, { width: 1200, height: 800 }),
      [SECOND]: evidence(SECOND, 1, '00000000-0000-4000-8000-000000000102', { x: 0.2, y: 0.5 }, undefined, { width: 1200, height: 800 }),
    }, { [FIRST]: firstGeometry, [SECOND]: secondGeometry });
    expect(actual.sceneSignatures[0].crop.x).toBeCloseTo(0.3125);
    expect(actual.sceneSignatures[0].cropRelativeFocal).toEqual({ x: 0.5, y: 0.5 });
    expect(actual.sceneSignatures[1].crop.x).toBeCloseTo(0.0125);
    expect(actual.sceneSignatures[1].cropRelativeFocal?.x).toBeCloseTo(0.5);
  });

  it('reuses encoded-to-display transforms, including mirrored orientation, before crop evaluation', () => {
    const id = '00000000-0000-4000-8000-000000000101';
    const source = scene(FIRST, id);
    const actual = report([source], { [FIRST]: evidence(FIRST, 0, id, { x: 0.2, y: 0.3 }, { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }) }, {
      [FIRST]: geometry(id, { encodedToDisplay: 'mirror-horizontal' }),
    });
    expect(actual.sceneSignatures[0].cropRelativeFocal).toEqual({ x: 0.8, y: 0.3 });
    expect(actual.sceneSignatures[0].subjectVisibilityRatio).toBeCloseTo(1);
    expect(actual.sceneSignatures[0].subjectOccupancyRatio).toBeCloseTo(0.12);
  });

  it('derives visibility and occupancy separately and records partial current crop visibility', () => {
    const id = '00000000-0000-4000-8000-000000000101';
    const source = scene(FIRST, id);
    const landscape = geometry(id, { encodedDimensions: { width: 1200, height: 800 }, displayDimensions: { width: 1200, height: 800 } });
    const actual = report([source], { [FIRST]: evidence(FIRST, 0, id, { x: 0.5, y: 0.5 }, { x: 0.6, y: 0.2, width: 0.4, height: 0.6 }, { width: 1200, height: 800 }) }, { [FIRST]: landscape });
    const signature = actual.sceneSignatures[0];
    expect(signature.subjectVisibilityRatio).toBeCloseTo(0.21875);
    expect(signature.subjectOccupancyRatio).toBeCloseTo(0.14);
    expect(signature.subjectPartiallyOutsideCrop).toBe(true);
  });

  it('uses documented inclusive-middle focal-zone boundaries', () => {
    const ids = ['00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000103'];
    const scenes = [scene(FIRST, ids[0]), scene(SECOND, ids[1]), scene(THIRD, ids[2])];
    const actual = report(scenes, {
      [FIRST]: evidence(FIRST, 0, ids[0], { x: 0.3334, y: 0.3334 }),
      [SECOND]: evidence(SECOND, 1, ids[1], { x: 0.6666, y: 0.6666 }),
      [THIRD]: evidence(THIRD, 2, ids[2], { x: 0.999, y: 0.999 }),
    }, { [FIRST]: geometry(ids[0]), [SECOND]: geometry(ids[1]), [THIRD]: geometry(ids[2]) });
    expect(actual.sceneSignatures.map((item) => item.focalZone)).toEqual(['middle-center', 'middle-center', 'bottom-right']);
  });

  it('reports only neutral factual boundary conditions', () => {
    const ids = ['00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000103'];
    const scenes = [scene(FIRST, ids[0]), scene(SECOND, ids[1]), scene(THIRD, ids[2])];
    const actual = report(scenes, {
      [FIRST]: evidence(FIRST, 0, ids[0], { x: 0.5, y: 0.5 }),
      [SECOND]: evidence(SECOND, 1, ids[1], { x: 0.5, y: 0.5 }),
      [THIRD]: evidence(THIRD, 2, ids[2], { x: 1, y: 1 }),
    }, { [FIRST]: geometry(ids[0]), [SECOND]: geometry(ids[1]), [THIRD]: geometry(ids[2]) });
    expect(actual.boundaries[0].findings).toEqual(expect.arrayContaining(['exact-crop-repetition', 'repeated-focal-zone', 'repeated-motion-context']));
    expect(actual.boundaries[1].findings).toEqual(expect.arrayContaining(['large-focal-position-shift', 'repeated-transition-context']));
  });

  it.each([
    [SPATIAL_CONTINUITY_LARGE_FOCAL_SHIFT - 0.001, false],
    [SPATIAL_CONTINUITY_LARGE_FOCAL_SHIFT, true],
    [SPATIAL_CONTINUITY_LARGE_FOCAL_SHIFT + 0.001, true],
  ])('applies the named focal-shift threshold at %s deterministically', (distance, present) => {
    const ids = ['00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000102'];
    const actual = report([scene(FIRST, ids[0]), scene(SECOND, ids[1])], {
      [FIRST]: evidence(FIRST, 0, ids[0], { x: 0.5, y: 0.5 }),
      [SECOND]: evidence(SECOND, 1, ids[1], { x: 0.5 + distance, y: 0.5 }),
    }, { [FIRST]: geometry(ids[0]), [SECOND]: geometry(ids[1]) });
    expect(actual.boundaries[0].findings.includes('large-focal-position-shift')).toBe(present);
  });

  it.each([
    [SPATIAL_CONTINUITY_SUBJECT_OCCUPANCY_SHIFT - 0.001, false],
    [SPATIAL_CONTINUITY_SUBJECT_OCCUPANCY_SHIFT, true],
    [SPATIAL_CONTINUITY_SUBJECT_OCCUPANCY_SHIFT + 0.001, true],
  ])('applies the named occupancy-shift threshold at %s deterministically', (delta, present) => {
    const ids = ['00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000102'];
    const actual = report([scene(FIRST, ids[0]), scene(SECOND, ids[1])], {
      [FIRST]: evidence(FIRST, 0, ids[0], { x: 0.5, y: 0.5 }, { x: 0, y: 0, width: 0.2, height: 1 }),
      [SECOND]: evidence(SECOND, 1, ids[1], { x: 0.5, y: 0.5 }, { x: 0, y: 0, width: 0.2 + delta, height: 1 }),
    }, { [FIRST]: geometry(ids[0]), [SECOND]: geometry(ids[1]) });
    expect(actual.boundaries[0].findings.includes('subject-occupancy-shift')).toBe(present);
  });

  it('marks an out-of-crop focal fact instead of clamping it into a valid signature', () => {
    const id = '00000000-0000-4000-8000-000000000101';
    const geometric = geometry(id, { encodedDimensions: { width: 1200, height: 800 }, displayDimensions: { width: 1200, height: 800 } });
    const framing = imageFramingFromAnchor({ x: 0.8, y: 0.5 })!;
    const source = { ...scene(FIRST, id), imageFraming: framing, imageFramingBinding: imageFramingBindingFromHistoricalGeometry(geometric, media(id)) };
    const actual = report([source, scene(SECOND, '00000000-0000-4000-8000-000000000102')], {
      [FIRST]: evidence(FIRST, 0, id, { x: 0, y: 0.5 }, undefined, { width: 1200, height: 800 }),
      [SECOND]: evidence(SECOND, 1, '00000000-0000-4000-8000-000000000102'),
    }, { [FIRST]: geometric, [SECOND]: geometry('00000000-0000-4000-8000-000000000102') });
    expect(actual.sceneSignatures[0].focalInsideCrop).toBe(false);
    expect(actual.sceneSignatures[0].cropRelativeFocal).toBeUndefined();
    expect(actual.sceneSignatures[0].focalZone).toBeUndefined();
    expect(actual.boundaries[0].findings).toContain('focal-outside-current-crop');
  });

  it('makes order semantic for reorder, insertion, deletion, and durable duplication', () => {
    const ids = ['00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000103'];
    const scenes = [scene(FIRST, ids[0]), scene(SECOND, ids[1]), scene(THIRD, ids[2])];
    const records = { [FIRST]: evidence(FIRST, 0, ids[0]), [SECOND]: evidence(SECOND, 1, ids[1]), [THIRD]: evidence(THIRD, 2, ids[2]) };
    const geometries = { [FIRST]: geometry(ids[0]), [SECOND]: geometry(ids[1]), [THIRD]: geometry(ids[2]) };
    const first = report(scenes, records, geometries);
    expect(report([scenes[1], scenes[0], scenes[2]], { [SECOND]: evidence(SECOND, 0, ids[1]), [FIRST]: evidence(FIRST, 1, ids[0]), [THIRD]: evidence(THIRD, 2, ids[2]) }, geometries).freshnessFingerprint).not.toBe(first.freshnessFingerprint);
    expect(report([scenes[0], scenes[2]], { [FIRST]: records[FIRST], [THIRD]: evidence(THIRD, 1, ids[2]) }, geometries).freshnessFingerprint).not.toBe(first.freshnessFingerprint);
    const duplicate = scene('visual-scene-00000000-0000-4000-8000-000000000099', ids[0]);
    expect(report([...scenes, duplicate], { ...records, [duplicate.sceneId]: evidence(duplicate.sceneId, 3, ids[0]) }, { ...geometries, [duplicate.sceneId]: geometry(ids[0]) }).freshnessFingerprint).not.toBe(first.freshnessFingerprint);
  });

  it('stales semantic fingerprint inputs but ignores capability rotation with equivalent immutable geometry', () => {
    const id = '00000000-0000-4000-8000-000000000101';
    const source = scene(FIRST, id);
    const base = report([source], { [FIRST]: evidence(FIRST, 0, id) }, { [FIRST]: geometry(id) });
    const changed = (next: Parameters<typeof report>[0], records = { [FIRST]: evidence(FIRST, 0, id) }, geometries = { [FIRST]: geometry(id) }) => expect(report(next, records, geometries).freshnessFingerprint).not.toBe(base.freshnessFingerprint);
    changed([{ ...source, duration: 6 }]);
    changed([{ ...source, imageStorage: { bucket: 'media', objectPath: path('00000000-0000-4000-8000-000000000102') } }], { [FIRST]: evidence(FIRST, 0, '00000000-0000-4000-8000-000000000102') }, { [FIRST]: geometry('00000000-0000-4000-8000-000000000102') });
    changed([source], { [FIRST]: evidence(FIRST, 0, id, { x: 0.4, y: 0.5 }) });
    const rotated = geometry(id, { executionAuthority: { version: 1, reference: `idga1_${'b'.repeat(43)}`, expiresAt: '2098-01-01T00:00:00.000Z' } });
    expect(report([source], { [FIRST]: evidence(FIRST, 0, id) }, { [FIRST]: rotated }).freshnessFingerprint).toBe(base.freshnessFingerprint);
  });

  it('binds framing, binding source, immutable geometry, composition, transition, and target output semantics', () => {
    const id = '00000000-0000-4000-8000-000000000101';
    const geometric = geometry(id);
    const source = scene(FIRST, id);
    const base = report([source], { [FIRST]: evidence(FIRST, 0, id) }, { [FIRST]: geometric });
    const different = (next: ReturnType<typeof report>) => expect(next.freshnessFingerprint).not.toBe(base.freshnessFingerprint);
    const framing = imageFramingFromAnchor({ x: 0.7, y: 0.5 })!;
    different(report([{ ...source, imageFraming: framing, imageFramingBinding: imageFramingBindingFromHistoricalGeometry(geometric, media(id)) }], { [FIRST]: evidence(FIRST, 0, id) }, { [FIRST]: geometric }));
    different(report([source], { [FIRST]: evidence(FIRST, 0, id) }, { [FIRST]: geometry(id, { contentDigest: 'b'.repeat(64) }) }));
    different(report([source], { [FIRST]: evidence(FIRST, 0, id) }, { [FIRST]: geometry(id, { encodedToDisplay: 'rotate-180' }) }));
    const resized = geometry(id, { encodedDimensions: { width: 1000, height: 1800 }, displayDimensions: { width: 1000, height: 1800 } });
    different(report([source], { [FIRST]: evidence(FIRST, 0, id, { x: 0.5, y: 0.5 }, undefined, { width: 1000, height: 1800 }) }, { [FIRST]: resized }));
    different(report([{ ...source, compositionOverride: { motion: 'pan' } }], { [FIRST]: evidence(FIRST, 0, id) }, { [FIRST]: geometric }));
    const nextId = '00000000-0000-4000-8000-000000000102';
    const next = scene(SECOND, nextId);
    const pair = report([source, next], { [FIRST]: evidence(FIRST, 0, id), [SECOND]: evidence(SECOND, 1, nextId) }, { [FIRST]: geometric, [SECOND]: geometry(nextId) });
    expect(report([source, { ...next, compositionOverride: { transition: 'none' } }], { [FIRST]: evidence(FIRST, 0, id), [SECOND]: evidence(SECOND, 1, nextId) }, { [FIRST]: geometric, [SECOND]: geometry(nextId) }).freshnessFingerprint).not.toBe(pair.freshnessFingerprint);
    different(report([source], { [FIRST]: evidence(FIRST, 0, id) }, { [FIRST]: geometric }, { width: 720, height: 1280 }));
  });

  it('is byte-equivalent for repeated inputs and keeps unavailable provider results advisory', () => {
    const id = '00000000-0000-4000-8000-000000000101';
    const source = scene(FIRST, id);
    const unavailable = createVisualSpatialEvidenceRecord({ projectId: PROJECT, sceneId: FIRST, sceneIndex: 0, scope: 'applied-image', mediaIdentity: media(id) }, unavailableVisualSpatialAnalysis('provider-unavailable'), { mediaIdentity: media(id), contentDigest: 'a'.repeat(64), encodedDimensions: { width: 1080, height: 1920 } });
    const input = () => report([source], { [FIRST]: unavailable }, { [FIRST]: geometry(id) });
    expect(input()).toEqual(input());
    expect(input().coverage.unavailableSceneIds).toEqual([FIRST]);
  });

  it('distinguishes the exact formerly colliding focal evidence states', () => {
    const id = '00000000-0000-4000-8000-000000000101';
    const source = scene(FIRST, id);
    const geometric = geometry(id);
    const first = report([source], { [FIRST]: evidence(FIRST, 0, id, { x: 0.6549, y: 0.0009 }) }, { [FIRST]: geometric });
    const second = report([source], { [FIRST]: evidence(FIRST, 0, id, { x: 0.2, y: 0.0012 }) }, { [FIRST]: geometric });
    expect(first.sceneSignatures).not.toEqual(second.sceneSignatures);
    expect(first.freshnessFingerprint).not.toBe(second.freshnessFingerprint);
    expect(report([source], { [FIRST]: evidence(FIRST, 0, id, { x: 0.6549, y: 0.0009 }) }, { [FIRST]: geometric }).freshnessFingerprint).toBe(first.freshnessFingerprint);
  });

  it('fails old-digest evidence closed and restores analysis with evidence for the new digest', () => {
    const id = '00000000-0000-4000-8000-000000000101';
    const source = scene(FIRST, id);
    const digestB = 'b'.repeat(64);
    const geometryB = geometry(id, { contentDigest: digestB });
    const stale = report([source], { [FIRST]: evidence(FIRST, 0, id) }, { [FIRST]: geometryB });
    expect(stale.coverage.unavailableSceneIds).toEqual([FIRST]);
    expect(stale.sceneSignatures).toEqual([]);
    const restored = report([source], { [FIRST]: evidence(FIRST, 0, id, { x: 0.5, y: 0.5 }, undefined, { width: 1080, height: 1920 }, digestB) }, { [FIRST]: geometryB });
    expect(restored.coverage.analyzedSceneIds).toEqual([FIRST]);
  });

  it('requires live geometry and restores identical semantics after equivalent reauthorization', () => {
    const id = '00000000-0000-4000-8000-000000000101';
    const source = scene(FIRST, id);
    const record = evidence(FIRST, 0, id);
    const liveGeometry = geometry(id, { executionAuthority: { version: 1, reference: `idga1_${'a'.repeat(43)}`, expiresAt: '2026-09-05T00:00:01.000Z' } });
    const live = report([source], { [FIRST]: record }, { [FIRST]: liveGeometry });
    const expired = createSpatialContinuityEvidenceReport({
      projectId: PROJECT, scenes: [source], appliedSpatialEvidence: { [FIRST]: record }, trustedImageGeometry: { [FIRST]: liveGeometry },
      evaluationTimeMs: Date.parse('2026-09-05T00:00:01.000Z'), outputDimensions: OUTPUT, compositionDefaults: { motion: 'static', transition: 'crossfade' },
    });
    expect(expired.coverage.unavailableSceneIds).toEqual([FIRST]);
    expect(expired.sceneSignatures).toEqual([]);
    const refreshedGeometry = geometry(id, { executionAuthority: { version: 1, reference: `idga1_${'b'.repeat(43)}`, expiresAt: '2098-01-01T00:00:00.000Z' } });
    const refreshed = report([source], { [FIRST]: record }, { [FIRST]: refreshedGeometry });
    expect(refreshed.sceneSignatures).toEqual(live.sceneSignatures);
    expect(refreshed.boundaries).toEqual(live.boundaries);
    expect(refreshed.freshnessFingerprint).toBe(live.freshnessFingerprint);
  });

  it('classifies exact crop-relative thirds inclusively in the middle zones', () => {
    const id = '00000000-0000-4000-8000-000000000101';
    const landscape = geometry(id, { encodedDimensions: { width: 1875, height: 1000 }, displayDimensions: { width: 1875, height: 1000 } });
    const horizontalFraming = imageFramingFromAnchor({ x: 0.25, y: 0.5 })!;
    const horizontalScene = { ...scene(FIRST, id), imageFraming: horizontalFraming, imageFramingBinding: imageFramingBindingFromHistoricalGeometry(landscape, media(id)) };
    const horizontal = [0.1, 0.2, 0.3, 0.4].map((x) => report([horizontalScene], { [FIRST]: evidence(FIRST, 0, id, { x, y: 0.5 }, undefined, { width: 1875, height: 1000 }) }, { [FIRST]: landscape }).sceneSignatures[0]);
    expect(horizontal.map((item) => item.cropRelativeFocal?.x)).toEqual([0, 1 / 3, 2 / 3, 1]);
    expect(horizontal.map((item) => item.focalZone)).toEqual(['middle-left', 'middle-center', 'middle-center', 'middle-right']);

    const portrait = geometry(id, { encodedDimensions: { width: 270, height: 1600 }, displayDimensions: { width: 270, height: 1600 } });
    const verticalFraming = imageFramingFromAnchor({ x: 0.5, y: 0.25 })!;
    const verticalScene = { ...scene(FIRST, id), imageFraming: verticalFraming, imageFramingBinding: imageFramingBindingFromHistoricalGeometry(portrait, media(id)) };
    const vertical = [0.1, 0.2, 0.3, 0.4].map((y) => report([verticalScene], { [FIRST]: evidence(FIRST, 0, id, { x: 0.5, y }, undefined, { width: 270, height: 1600 }) }, { [FIRST]: portrait }).sceneSignatures[0]);
    expect(vertical.map((item) => item.cropRelativeFocal?.y)).toEqual([0, 1 / 3, 2 / 3, 1]);
    expect(vertical.map((item) => item.focalZone)).toEqual(['top-center', 'middle-center', 'middle-center', 'bottom-center']);
  });

  it('covers full, partial, outside, oversized, edge-touching, absent, mirrored, and swapped subject geometry', () => {
    const id = '00000000-0000-4000-8000-000000000101';
    const landscape = geometry(id, { encodedDimensions: { width: 1200, height: 800 }, displayDimensions: { width: 1200, height: 800 } });
    const signatureFor = (subject?: { x: number; y: number; width: number; height: number }, geometric = landscape) => report(
      [scene(FIRST, id)],
      { [FIRST]: evidence(FIRST, 0, id, { x: 0.5, y: 0.5 }, subject, geometric.encodedDimensions) },
      { [FIRST]: geometric },
    ).sceneSignatures[0];
    expect(signatureFor({ x: 0.4, y: 0.2, width: 0.1, height: 0.2 })).toMatchObject({ subjectVisibilityRatio: 1, subjectPartiallyOutsideCrop: false });
    expect(signatureFor({ x: 0.3, y: 0.2, width: 0.1, height: 0.2 }).subjectVisibilityRatio).toBeGreaterThan(0);
    expect(signatureFor({ x: 0.3, y: 0.2, width: 0.1, height: 0.2 }).subjectVisibilityRatio).toBeLessThan(1);
    expect(signatureFor({ x: 0, y: 0.2, width: 0.1, height: 0.2 })).toMatchObject({ subjectVisibilityRatio: 0, subjectOccupancyRatio: 0, subjectPartiallyOutsideCrop: true });
    expect(signatureFor({ x: 0.2, y: 0.1, width: 0.6, height: 0.8 }).subjectOccupancyRatio).toBeCloseTo(0.8);
    expect(signatureFor({ x: 0.3125, y: 0.2, width: 0.1, height: 0.2 })).toMatchObject({ subjectVisibilityRatio: 1, subjectPartiallyOutsideCrop: false });
    expect(signatureFor()).not.toHaveProperty('subjectOccupancyRatio');
    const mirrored = geometry(id, { encodedDimensions: { width: 1200, height: 800 }, displayDimensions: { width: 1200, height: 800 }, encodedToDisplay: 'mirror-horizontal' });
    expect(signatureFor({ x: 0.65, y: 0.2, width: 0.1, height: 0.2 }, mirrored).subjectVisibilityRatio).toBeLessThan(1);
    const swapped = geometry(id, { encodedDimensions: { width: 800, height: 1200 }, displayDimensions: { width: 1200, height: 800 }, encodedToDisplay: 'rotate-90-cw' });
    expect(signatureFor({ x: 0.2, y: 0.4, width: 0.2, height: 0.1 }, swapped).subjectOccupancyRatio).toBeDefined();
  });

  it('compares exact canonical crops without merging adjacent anchors or different aspects', () => {
    const ids = ['00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000102'];
    const geometries = ids.map((id) => geometry(id, { encodedDimensions: { width: 1200, height: 800 }, displayDimensions: { width: 1200, height: 800 } }));
    const framed = (sceneId: string, id: string, geometric: TrustedImageDisplayGeometryV1, x: number) => ({ ...scene(sceneId, id), imageFraming: imageFramingFromAnchor({ x, y: 0.5 })!, imageFramingBinding: imageFramingBindingFromHistoricalGeometry(geometric, media(id)) });
    const records = { [FIRST]: evidence(FIRST, 0, ids[0], { x: 0.5, y: 0.5 }, undefined, { width: 1200, height: 800 }), [SECOND]: evidence(SECOND, 1, ids[1], { x: 0.5, y: 0.5 }, undefined, { width: 1200, height: 800 }) };
    const same = report([framed(FIRST, ids[0], geometries[0], 0.6), framed(SECOND, ids[1], geometries[1], 0.6)], records, { [FIRST]: geometries[0], [SECOND]: geometries[1] });
    expect(same.boundaries[0].findings).toContain('exact-crop-repetition');
    const adjacent = report([framed(FIRST, ids[0], geometries[0], 0.6), framed(SECOND, ids[1], geometries[1], 0.6001)], records, { [FIRST]: geometries[0], [SECOND]: geometries[1] });
    expect(adjacent.boundaries[0].findings).not.toContain('exact-crop-repetition');
    const differentAspect = geometry(ids[1], { encodedDimensions: { width: 1000, height: 800 }, displayDimensions: { width: 1000, height: 800 } });
    const aspectRecords = { ...records, [SECOND]: evidence(SECOND, 1, ids[1], { x: 0.5, y: 0.5 }, undefined, { width: 1000, height: 800 }) };
    expect(report([scene(FIRST, ids[0]), scene(SECOND, ids[1])], aspectRecords, { [FIRST]: geometries[0], [SECOND]: differentAspect }).boundaries[0].findings).not.toContain('exact-crop-repetition');
  });

  it('rebuilds only canonical adjacent boundaries through insertion, deletion, reorder, and duplication', () => {
    const ids = ['00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000103'];
    const source = [scene(FIRST, ids[0]), scene(SECOND, ids[1]), scene(THIRD, ids[2])];
    const recordsFor = (ordered: readonly Scene[]) => Object.fromEntries(ordered.map((item, index) => [item.sceneId, evidence(item.sceneId, index, item.imageStorage!.objectPath.match(/[0-9a-f-]{36}(?=\.png$)/u)![0])]));
    const geometryFor = (ordered: readonly Scene[]) => Object.fromEntries(ordered.map((item) => [item.sceneId, geometry(item.imageStorage!.objectPath.match(/[0-9a-f-]{36}(?=\.png$)/u)![0])]));
    const pairs = (ordered: readonly Scene[]) => report(ordered, recordsFor(ordered), geometryFor(ordered)).boundaries.map((item) => [item.fromSceneId, item.toSceneId]);
    expect(pairs(source)).toEqual([[FIRST, SECOND], [SECOND, THIRD]]);
    expect(pairs([source[0], source[2]])).toEqual([[FIRST, THIRD]]);
    expect(pairs([source[2], source[0], source[1]])).toEqual([[THIRD, FIRST], [FIRST, SECOND]]);
    const inserted = scene('visual-scene-00000000-0000-4000-8000-000000000014', '00000000-0000-4000-8000-000000000104');
    expect(pairs([source[0], inserted, source[1], source[2]])).toEqual([[FIRST, inserted.sceneId], [inserted.sceneId, SECOND], [SECOND, THIRD]]);
    const duplicate = scene('visual-scene-00000000-0000-4000-8000-000000000015', ids[0]);
    expect(pairs([...source, duplicate]).at(-1)).toEqual([THIRD, duplicate.sceneId]);
  });

  it('binds analyzer, confidence, focal, subject, duration, motion, transition, output, framing, orientation, and digest identity', () => {
    const id = '00000000-0000-4000-8000-000000000101';
    const source = scene(FIRST, id);
    const geometric = geometry(id);
    const base = report([source], { [FIRST]: evidence(FIRST, 0, id) }, { [FIRST]: geometric });
    const differs = (value: ReturnType<typeof report>) => expect(value.freshnessFingerprint).not.toBe(base.freshnessFingerprint);
    differs(report([source], { [FIRST]: evidence(FIRST, 0, id, { x: 0.5, y: 0.5 }, undefined, undefined, undefined, { analyzerVersion: 'openai:next' }) }, { [FIRST]: geometric }));
    differs(report([source], { [FIRST]: evidence(FIRST, 0, id, { x: 0.5, y: 0.5 }, undefined, undefined, undefined, { confidenceBand: 'high' }) }, { [FIRST]: geometric }));
    differs(report([source], { [FIRST]: evidence(FIRST, 0, id, { x: 0.4, y: 0.5 }) }, { [FIRST]: geometric }));
    differs(report([source], { [FIRST]: evidence(FIRST, 0, id, { x: 0.5, y: 0.5 }, { x: 0.4, y: 0.4, width: 0.2, height: 0.2 }) }, { [FIRST]: geometric }));
    differs(report([{ ...source, duration: 6 }], { [FIRST]: evidence(FIRST, 0, id) }, { [FIRST]: geometric }));
    differs(report([{ ...source, compositionOverride: { motion: 'pan' } }], { [FIRST]: evidence(FIRST, 0, id) }, { [FIRST]: geometric }));
    differs(report([source], { [FIRST]: evidence(FIRST, 0, id) }, { [FIRST]: geometric }, { width: 720, height: 1280 }));
    const framed = imageFramingFromAnchor({ x: 0.6, y: 0.5 })!;
    differs(report([{ ...source, imageFraming: framed, imageFramingBinding: imageFramingBindingFromHistoricalGeometry(geometric, media(id)) }], { [FIRST]: evidence(FIRST, 0, id) }, { [FIRST]: geometric }));
    const rotated = geometry(id, { encodedToDisplay: 'rotate-180' });
    differs(report([source], { [FIRST]: evidence(FIRST, 0, id) }, { [FIRST]: rotated }));
    const digestB = 'b'.repeat(64);
    differs(report([source], { [FIRST]: evidence(FIRST, 0, id, { x: 0.5, y: 0.5 }, undefined, undefined, digestB) }, { [FIRST]: geometry(id, { contentDigest: digestB }) }));
    const nextId = '00000000-0000-4000-8000-000000000102';
    const second = scene(SECOND, nextId);
    const pair = report([source, second], { [FIRST]: evidence(FIRST, 0, id), [SECOND]: evidence(SECOND, 1, nextId) }, { [FIRST]: geometric, [SECOND]: geometry(nextId) });
    expect(report([source, { ...second, compositionOverride: { transition: 'none' } }], { [FIRST]: evidence(FIRST, 0, id), [SECOND]: evidence(SECOND, 1, nextId) }, { [FIRST]: geometric, [SECOND]: geometry(nextId) }).freshnessFingerprint).not.toBe(pair.freshnessFingerprint);
  });
});
