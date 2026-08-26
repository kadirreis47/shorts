import { describe, expect, it } from 'vitest';
import { createSceneVisualBinding, ensureSceneVisualPlanningIds, visualBriefFingerprint } from '@/core/visual-intelligence';
import { createVisualQueryPlannerController, type VisualPlannerLease } from '@/services/visualQueryPlannerController';
import type { Scene } from '@/lib/types';

const scenes = ensureSceneVisualPlanningIds<Scene>([
  { visualPlanningId: 'visual-scene-00000000-0000-4000-8000-000000000001', text: 'First scene.', duration: 3, visual: 'first' },
  { visualPlanningId: 'visual-scene-00000000-0000-4000-8000-000000000002', text: 'Second scene.', duration: 3, visual: 'second' },
]);
const binding = createSceneVisualBinding(scenes, 0);
const brief = {
  version: 1, sceneBinding: binding, subject: 'first scene', editorialRole: 'hook', preferredMedia: 'video',
  visualStyleHints: ['cinematic'], visualExclusions: [], noveltyConstraints: [],
  sourceIntent: { allowedSourceKinds: ['licensed-stock'], commerciallyUsableSourceRequired: true, attributionPreference: 'no-preference' },
} as const;
const result = {
  status: 'planned' as const,
  planning: {
    version: 1,
    briefs: [brief],
    queryPlans: [{
      version: 1, sceneBinding: binding, briefFingerprint: visualBriefFingerprint(brief),
      concepts: [
        { query: 'first scene action', targetMedia: 'video', priority: 1, category: 'action' },
        { query: 'first scene detail', targetMedia: 'image', priority: 2, category: 'detail' },
        { query: 'first scene atmosphere', targetMedia: 'either', priority: 3, category: 'atmosphere' },
      ],
    }],
  },
} as const;

function lease(overrides: Partial<VisualPlannerLease> = {}): VisualPlannerLease {
  return { ownerRevision: 'owner-a', projectId: 'project-a', scenes, ...overrides };
}

describe('visual query planner controller', () => {
  it('persists only a current planning result without changing canonical scene media', async () => {
    const current = lease(); let installed = undefined as VisualPlannerLease['planning'];
    const controller = createVisualQueryPlannerController({ readLease: () => current, writePlanning: (value) => { installed = value; }, request: async () => result });
    await expect(controller.request({ scenes: [{ sceneBinding: binding, sceneText: scenes[0].text }] })).resolves.toBe(true);
    expect(installed?.briefs[0].subject).toBe('first scene');
    expect(current.scenes).toEqual(scenes);
  });

  it.each(['owner transition', 'scene edit', 'reorder', 'delete'] as const)('rejects stale completion after %s', async (kind) => {
    let current = lease(); let resolve!: (value: typeof result) => void; let installed = false;
    const pending = new Promise<typeof result>((done) => { resolve = done; });
    const controller = createVisualQueryPlannerController({ readLease: () => current, writePlanning: () => { installed = true; }, request: async () => pending });
    const promise = controller.request({ scenes: [{ sceneBinding: binding, sceneText: scenes[0].text }] });
    if (kind === 'owner transition') current = lease({ ownerRevision: 'owner-b' });
    if (kind === 'scene edit') current = lease({ scenes: [{ ...scenes[0], text: 'Edited.' }, scenes[1]] });
    if (kind === 'reorder') current = lease({ scenes: [scenes[1], scenes[0]] });
    if (kind === 'delete') current = lease({ scenes: [scenes[1]] });
    resolve(result);
    await expect(promise).resolves.toBe(false);
    expect(installed).toBe(false);
  });
});
