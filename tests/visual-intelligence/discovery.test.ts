import { describe, expect, it, vi } from 'vitest';
import {
  createSceneVisualBinding, discoverVisualCandidates, ensureSceneVisualPlanningIds,
  rankVisualCandidates, visualBriefFingerprint, type VisualDiscoveryCandidate,
} from '@/core/visual-intelligence';

const scenes = ensureSceneVisualPlanningIds([{ visualPlanningId: 'visual-scene-00000000-0000-4000-8000-000000000001', text: 'A historic tram crosses a rainy city.' }]);
const binding = createSceneVisualBinding(scenes, 0);
const brief = { version: 1, sceneBinding: binding, subject: 'historic tram', editorialRole: 'hook', preferredMedia: 'either', visualStyleHints: [], visualExclusions: [], noveltyConstraints: ['vary-media-type'], sourceIntent: { allowedSourceKinds: ['licensed-stock'], commerciallyUsableSourceRequired: true, attributionPreference: 'no-preference' } } as const;
const plan = { version: 1, sceneBinding: binding, briefFingerprint: visualBriefFingerprint(brief), concepts: [
  { query: 'historic tram rain', targetMedia: 'video', priority: 1, category: 'action' },
  { query: 'tram detail', targetMedia: 'image', priority: 2, category: 'detail' },
  { query: 'rain street', targetMedia: 'either', priority: 3, category: 'atmosphere' },
] } as const;

function candidate(id: string, mediaType: 'image' | 'video', overrides: Partial<VisualDiscoveryCandidate> = {}): VisualDiscoveryCandidate {
  return { candidateId: 'pexels:' + mediaType + ':' + id, provider: 'pexels', providerMediaIdentity: id, mediaType, orientation: 'portrait', ...(mediaType === 'video' ? { width: 1080, height: 1920, durationMs: 6_000 } : {}), conceptCategories: ['action'], conceptPriorities: [1], providerRanks: [1], sourcePolicy: { provider: 'pexels', sourceClass: 'provider-catalog' }, ...overrides };
}

describe('visual discovery ranking', () => {
  it('ranks priority, cross-query matches, vertical fit, preferred media, and stable ties deterministically', () => {
    const video = candidate('video-a', 'video', { conceptPriorities: [1, 2], conceptCategories: ['action', 'detail'], providerRanks: [1, 2] });
    const image = candidate('image-a', 'image', { conceptPriorities: [3], providerRanks: [3] });
    const ranked = rankVisualCandidates([image, video], { ...brief, preferredMedia: 'video' });
    expect(ranked.map((item) => item.candidateId)).toEqual(['pexels:video:video-a', 'pexels:image:image-a']);
    expect(ranked[0].explanations).toEqual(expect.arrayContaining(['cross-query-match', 'vertical-fit', 'preferred-media', 'duration-fit', 'diversity-boost']));
  });

  it('penalizes low resolution and cross-scene repetition without URL authority', () => {
    const repeated = candidate('same', 'video', { width: 640, height: 960 });
    const other = candidate('other', 'image');
    const previous = { sceneBinding: binding, briefFingerprint: plan.briefFingerprint, status: 'ready' as const, candidates: [rankVisualCandidates([repeated], brief)[0]], queryCount: 1, failedQueryCount: 0 };
    const ranked = rankVisualCandidates([repeated, other], brief, [previous]);
    expect(ranked[0].candidateId).toBe('pexels:image:other');
    expect(ranked.find((item) => item.candidateId === repeated.candidateId)?.explanations).toEqual(expect.arrayContaining(['low-resolution-penalty', 'repeated-visual-penalty']));
    expect(JSON.stringify(ranked)).not.toMatch(/https?:\/\//);
  });

  it('caps fan-out, deduplicates provider identity, and returns partial shortlists truthfully', async () => {
    let active = 0; let peak = 0;
    const provider = {
      id: 'pexels' as const, capabilities: new Set(['image', 'video'] as const),
      search: vi.fn(async ({ mediaType, query }: { mediaType: 'image' | 'video'; query: string }) => {
        active += 1; peak = Math.max(peak, active); await Promise.resolve(); active -= 1;
        if (query === 'tram detail') throw new Error('provider temporary failure');
        return [candidate('shared', mediaType), candidate(query.replace(/ /gu, '-'), mediaType)];
      }),
    };
    const shortlist = await discoverVisualCandidates({ brief, queryPlan: plan, provider });
    expect(provider.search).toHaveBeenCalledTimes(4);
    expect(peak).toBeLessThanOrEqual(2);
    expect(shortlist.status).toBe('partial');
    expect(shortlist.failedQueryCount).toBe(1);
    expect(shortlist.candidates.filter((item) => item.providerMediaIdentity === 'shared')).toHaveLength(2);
    expect(shortlist.candidates).toHaveLength(5);
  });
});
