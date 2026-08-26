import { describe, expect, it, vi } from 'vitest';
import { createSceneVisualBinding, ensureSceneVisualPlanningIds, visualBriefFingerprint } from '@/core/visual-intelligence';

const post = vi.fn();
vi.mock('@/lib/api/client', () => ({ apiClient: { post } }));

const scene = ensureSceneVisualPlanningIds([{ visualPlanningId: 'visual-scene-00000000-0000-4000-8000-000000000001', text: 'İstanbul tramvayı.' }])[0];
const binding = createSceneVisualBinding([scene], 0);
const brief = {
  version: 1, sceneBinding: binding, subject: 'historic tram', editorialRole: 'hook', preferredMedia: 'video',
  visualStyleHints: ['cinematic'], visualExclusions: [], noveltyConstraints: [],
  sourceIntent: { allowedSourceKinds: ['licensed-stock'], commerciallyUsableSourceRequired: true, attributionPreference: 'no-preference' },
} as const;
const planning = {
  version: 1, briefs: [brief], queryPlans: [{
    version: 1, sceneBinding: binding, briefFingerprint: visualBriefFingerprint(brief),
    concepts: [
      { query: 'historic tram rain', targetMedia: 'video', priority: 1, category: 'action' },
      { query: 'tram detail', targetMedia: 'image', priority: 2, category: 'detail' },
      { query: 'street atmosphere', targetMedia: 'either', priority: 3, category: 'atmosphere' },
    ],
  }],
} as const;

describe('visual query planner API contract', () => {
  it('accepts only a complete validated planning response', async () => {
    post.mockResolvedValueOnce({ status: 'planned', planning });
    const { planVisualQueries } = await import('@/lib/api');
    await expect(planVisualQueries({ scenes: [{ sceneBinding: binding, sceneText: scene.text, language: 'tr' }] })).resolves.toMatchObject({ status: 'planned', planning });
    expect(post).toHaveBeenCalledWith('visual-query-planner', expect.anything(), { retryCount: 0, timeoutMs: 40_000 });
  });

  it('rejects malformed or URL-authority responses', async () => {
    const { planVisualQueries } = await import('@/lib/api');
    post.mockResolvedValueOnce({ status: 'planned', planning: { ...planning, queryPlans: [] } });
    await expect(planVisualQueries({ scenes: [{ sceneBinding: binding, sceneText: scene.text }] })).rejects.toThrow(/invalid/i);
    post.mockResolvedValueOnce({ status: 'planned', planning: { ...planning, briefs: [{ ...brief, sourceUrl: 'https://unsafe.example' }] } });
    await expect(planVisualQueries({ scenes: [{ sceneBinding: binding, sceneText: scene.text }] })).rejects.toThrow(/invalid/i);
  });
});
