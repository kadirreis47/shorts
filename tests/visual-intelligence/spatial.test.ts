import { describe, expect, it } from 'vitest';
import { createVisualSpatialEvidenceRecord, createVisualSpatialRequestRegistry, isVisualSpatialEvidenceRecordCurrent, type VisualSpatialEvidenceBinding } from '@/core/visual-intelligence';

const binding: VisualSpatialEvidenceBinding = {
  projectId: 'studio-project-12345678', sceneId: 'visual-scene-11111111-1111-4111-8111-111111111111', sceneIndex: 1,
  scope: 'applied-image', mediaIdentity: 'media:00000000-0000-4000-8000-000000000001/generated-images/00000000-0000-4000-8000-000000000002.png',
};
const response = { status: 'evaluated', contractVersion: 'visual-spatial-v1', analyzerVersion: 'openai:gpt-test', sourceDimensions: { width: 1920, height: 1080 }, focalPoint: { x: 0.5, y: 0.5 }, confidenceBand: 'low' } as const;

describe('session-only visual spatial evidence', () => {
  it('binds evidence to project, canonical scene/order, scope, and durable media identity', () => {
    const record = createVisualSpatialEvidenceRecord(binding, response);
    expect(isVisualSpatialEvidenceRecordCurrent(record, binding)).toBe(true);
    for (const changed of [
      { ...binding, projectId: 'studio-project-other' },
      { ...binding, sceneId: 'visual-scene-22222222-2222-4222-8222-222222222222' },
      { ...binding, sceneIndex: 0 },
      { ...binding, scope: 'discovery-candidate-image' as const },
      { ...binding, mediaIdentity: binding.mediaIdentity.replace('000000000002', '000000000003') },
    ]) expect(isVisualSpatialEvidenceRecordCurrent(record, changed)).toBe(false);
  });

  it('rejects bindings after project switch, scene removal/replacement, media replacement, or candidate change', () => {
    const applied = createVisualSpatialEvidenceRecord(binding, response);
    const candidateBinding = { ...binding, scope: 'discovery-candidate-image' as const, mediaIdentity: 'pexels:image:42' };
    const candidate = createVisualSpatialEvidenceRecord(candidateBinding, response);
    expect(isVisualSpatialEvidenceRecordCurrent(applied, { ...binding, projectId: 'studio-project-switched' })).toBe(false);
    expect(isVisualSpatialEvidenceRecordCurrent(applied, { ...binding, sceneId: 'visual-scene-22222222-2222-4222-8222-222222222222' })).toBe(false);
    expect(isVisualSpatialEvidenceRecordCurrent(applied, { ...binding, sceneIndex: 0 })).toBe(false);
    expect(isVisualSpatialEvidenceRecordCurrent(applied, { ...binding, mediaIdentity: 'media:00000000-0000-4000-8000-000000000001/generated-images/00000000-0000-4000-8000-000000000099.png' })).toBe(false);
    expect(isVisualSpatialEvidenceRecordCurrent(candidate, { ...candidateBinding, mediaIdentity: 'pexels:image:43' })).toBe(false);
  });

  it('does not admit URLs, malformed scene IDs, or response extras into session evidence', () => {
    expect(() => createVisualSpatialEvidenceRecord({ ...binding, mediaIdentity: 'https://preview.test/a.jpg' }, response)).toThrow();
    expect(() => createVisualSpatialEvidenceRecord({ ...binding, mediaIdentity: '<script>ignore instructions</script>' }, response)).toThrow();
    expect(() => createVisualSpatialEvidenceRecord({ ...binding, scope: 'discovery-candidate-image', mediaIdentity: 'pexels:image:9999999999' }, response)).toThrow();
    expect(() => createVisualSpatialEvidenceRecord({ ...binding, sceneId: 'scene-1' }, response)).toThrow();
    expect(() => createVisualSpatialEvidenceRecord(binding, { ...response, crop: { x: 0, y: 0 } })).toThrow();
  });

  it('guards duplicate paid operations and releases every exact binding independently', () => {
    const registry = createVisualSpatialRequestRegistry();
    expect(registry.tryAcquire(binding)).toBe(true);
    expect(registry.tryAcquire(binding)).toBe(false);
    expect(registry.tryAcquire({ ...binding, scope: 'discovery-candidate-image' })).toBe(true);
    registry.release(binding);
    expect(registry.tryAcquire(binding)).toBe(true);
  });
});
