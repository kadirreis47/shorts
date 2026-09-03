import { describe, expect, it } from 'vitest';
import {
  assignNewCanonicalSceneIds,
  createCanonicalSceneId,
  hasUniqueCanonicalSceneIds,
  isCanonicalSceneId,
  materializeCanonicalSceneIds,
} from '@/lib/sceneIdentity';

const A = 'visual-scene-11111111-1111-4111-8111-111111111111';
const B = 'visual-scene-22222222-2222-4222-8222-222222222222';
const B_LEGACY = 'visual-scene-AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA';

describe('canonical scene identity', () => {
  it('generates and strictly validates the established opaque wire format', () => {
    expect(isCanonicalSceneId(createCanonicalSceneId())).toBe(true);
    expect(isCanonicalSceneId(A)).toBe(true);
    expect(isCanonicalSceneId('scene-1')).toBe(false);
    expect(isCanonicalSceneId(` ${A}`)).toBe(false);
    expect(isCanonicalSceneId([A])).toBe(false);
  });

  it('preserves canonical IDs, promotes legacy visual IDs, and removes the legacy field', () => {
    const normalized = materializeCanonicalSceneIds([
      { sceneId: A, visualPlanningId: B, text: 'canonical' },
      { visualPlanningId: B_LEGACY, text: 'legacy' },
    ]);

    expect(normalized.map((scene) => scene.sceneId)).toEqual([A, B_LEGACY]);
    expect(normalized.every((scene) => !('visualPlanningId' in scene))).toBe(true);
  });

  it('repairs malformed, missing, and duplicate identities exactly once without aliasing', () => {
    const first = materializeCanonicalSceneIds([
      { sceneId: A, text: 'first' },
      { sceneId: A, text: 'duplicate' },
      { sceneId: 'malformed', text: 'malformed' },
      { text: 'missing' },
    ]);
    const second = materializeCanonicalSceneIds(first);

    expect(first[0].sceneId).toBe(A);
    expect(hasUniqueCanonicalSceneIds(first)).toBe(true);
    expect(first.every((scene) => isCanonicalSceneId(scene.sceneId))).toBe(true);
    expect(second.map((scene) => scene.sceneId)).toEqual(first.map((scene) => scene.sceneId));
  });

  it('reserves canonical IDs before promoting colliding legacy identities', () => {
    const normalized = materializeCanonicalSceneIds([
      { visualPlanningId: A, text: 'legacy appears first' },
      { sceneId: A, text: 'canonical appears later' },
    ]);

    expect(normalized[1].sceneId).toBe(A);
    expect(normalized[0].sceneId).not.toBe(A);
    expect(hasUniqueCanonicalSceneIds(normalized)).toBe(true);
  });

  it('keeps logical IDs through reorder, delete, and same-scene edits while an inserted scene gets a new ID', () => {
    const initial = materializeCanonicalSceneIds([
      { sceneId: A, text: 'A' },
      { sceneId: B, text: 'B' },
    ]);
    const reordered = materializeCanonicalSceneIds([initial[1], initial[0]]);
    const inserted = materializeCanonicalSceneIds([reordered[0], { text: 'inserted' }, reordered[1]]);
    const edited = materializeCanonicalSceneIds([{ ...inserted[2], text: 'A edited', media: 'replaced' }, inserted[0]]);

    expect(reordered.map((scene) => scene.sceneId)).toEqual([B, A]);
    expect(inserted[0].sceneId).toBe(B);
    expect(inserted[2].sceneId).toBe(A);
    expect(inserted[1].sceneId).not.toBe(A);
    expect(inserted[1].sceneId).not.toBe(B);
    expect(edited.map((scene) => scene.sceneId)).toEqual([A, B]);
  });

  it('assigns fresh identities at new-scene-set ingress instead of trusting supplied aliases', () => {
    const generated = assignNewCanonicalSceneIds([
      { sceneId: A, visualPlanningId: B, text: 'new logical scene' },
      { sceneId: A, text: 'another new logical scene' },
    ]);

    expect(generated.every((scene) => !('visualPlanningId' in scene))).toBe(true);
    expect(generated.every((scene) => scene.sceneId !== A && scene.sceneId !== B)).toBe(true);
    expect(hasUniqueCanonicalSceneIds(generated)).toBe(true);
  });
});
