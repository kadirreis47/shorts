import { describe, expect, it } from 'vitest';
import { createSceneVisualBinding, ensureSceneVisualPlanningIds, visualBriefFingerprint } from '@/core/visual-intelligence';
import { createVisualDiscoveryController, type VisualDiscoveryLease } from '@/services/visualDiscoveryController';
import type { Scene } from '@/lib/types';

const scenes = ensureSceneVisualPlanningIds<Scene>([
  { visualPlanningId: 'visual-scene-00000000-0000-4000-8000-000000000001', text: 'First visual.', duration: 3, visual: 'first' },
  { visualPlanningId: 'visual-scene-00000000-0000-4000-8000-000000000002', text: 'Second visual.', duration: 3, visual: 'second' },
]);
const binding = createSceneVisualBinding(scenes, 0);
const brief = { version: 1, sceneBinding: binding, subject: 'first visual', editorialRole: 'hook', preferredMedia: 'image', visualStyleHints: [], visualExclusions: [], noveltyConstraints: [], sourceIntent: { allowedSourceKinds: ['licensed-stock'], commerciallyUsableSourceRequired: true, attributionPreference: 'no-preference' } } as const;
const planning = { version: 1, briefs: [brief], queryPlans: [{ version: 1, sceneBinding: binding, briefFingerprint: visualBriefFingerprint(brief), concepts: [{ query: 'first image', targetMedia: 'image', priority: 1, category: 'detail' }, { query: 'first detail', targetMedia: 'image', priority: 2, category: 'detail' }, { query: 'first atmosphere', targetMedia: 'image', priority: 3, category: 'atmosphere' }] }] } as const;
const provider = { id: 'pexels' as const, capabilities: new Set(['image'] as const), search: async () => [] };
function lease(overrides: Partial<VisualDiscoveryLease> = {}): VisualDiscoveryLease { return { ownerRevision: 'owner-a', projectId: 'project-a', scenes, planning, ...overrides }; }

describe('visual discovery controller', () => {
  it('preserves an existing shortlist when every provider query fails', async () => {
    const current = lease(); let installed = false;
    const controller = createVisualDiscoveryController({
      readLease: () => current, writeShortlist: () => { installed = true; },
      provider: { ...provider, search: async () => { throw new Error('temporary provider failure'); } },
    });
    await expect(controller.discover(binding.sceneId)).resolves.toBe(false);
    expect(installed).toBe(false);
  });

  it('does not attach a discovery result after an owner, project, edit, reorder, or deletion race', async () => {
    for (const next of [
      lease({ ownerRevision: 'owner-b' }), lease({ projectId: 'project-b' }),
      lease({ scenes: [{ ...scenes[0], text: 'Edited.' }, scenes[1]] }), lease({ scenes: [scenes[1], scenes[0]] }), lease({ scenes: [scenes[1]] }),
    ]) {
      let current = lease(); let installed = false; let resolve!: (value: readonly []) => void;
      const pending = new Promise<readonly []>((done) => { resolve = done; });
      const controller = createVisualDiscoveryController({ readLease: () => current, writeShortlist: () => { installed = true; }, provider: { ...provider, search: async () => pending } });
      const running = controller.discover(binding.sceneId); current = next; resolve([]);
      await expect(running).resolves.toBe(false); expect(installed).toBe(false);
    }
  });
});
