import { describe, expect, it, vi } from 'vitest';
import {
  createSceneVisualBinding, discoverVisualCandidates, ensureSceneVisualPlanningIds,
  rankVisualCandidates, visualBriefFingerprint, type VisualDiscoveryCandidate, type VisualStoryPlan,
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

  it('integrates factual quality deterministically, retains weak candidates, and excludes only technical rejects', () => {
    const good = candidate('good', 'video', { width: 1080, height: 1920, durationMs: 6_000, descriptor: 'tram' });
    const weak = candidate('weak', 'video', { width: 640, height: 360, durationMs: 25_000 });
    const rejected = candidate('bad', 'video', { width: 0, height: 1920 });
    const first = rankVisualCandidates([weak, rejected, good], { ...brief, preferredMedia: 'video' });
    const second = rankVisualCandidates([good, weak, rejected], { ...brief, preferredMedia: 'video' });
    expect(first.map((item) => item.candidateId)).toEqual(second.map((item) => item.candidateId));
    expect(first.map((item) => item.candidateId)).toEqual(['pexels:video:good', 'pexels:video:weak']);
    expect(first[0].quality.grade).toBe('excellent');
    expect(first[1].quality.hardRejected).toBe(false);
    expect(first[1].quality.reasons).toEqual(expect.arrayContaining(['low-resolution', 'heavy-crop-required', 'duration-mismatch']));
    expect(first.map((item) => item.semantic.status)).toEqual(['unavailable', 'unavailable']);
    expect(first.map((item) => item.semanticFitScore)).toEqual([0, 0]);
  });

  it('does not let technical quality silently overturn an explicit media preference', () => {
    const preferredButLimited = candidate('preferred-image', 'image', { width: 640, height: 360, descriptor: undefined });
    const nonPreferredExcellent = candidate('non-preferred-video', 'video', { width: 1080, height: 1920, durationMs: 6_000, descriptor: 'tram' });
    const ranked = rankVisualCandidates([nonPreferredExcellent, preferredButLimited], { ...brief, preferredMedia: 'image' });
    expect(ranked.map((item) => item.candidateId)).toEqual(['pexels:image:preferred-image', 'pexels:video:non-preferred-video']);
  });

  it('keeps explicit media preference ahead of bounded global sequence context', () => {
    const priorBinding = { sceneId: 'visual-scene-00000000-0000-4000-8000-000000000099', sceneIndex: 0, sceneTextFingerprint: 'scene-text-v1-0000000000000000' } as const;
    const story: VisualStoryPlan = { version: 1, fingerprint: 'visual-story-v1-00000000', continuityGroups: [], beats: [
      { sceneBinding: priorBinding, order: 0, editorialRole: 'context', preferredMedia: 'either', categories: ['detail'], noveltyConstraints: [], continuityGroupIds: [] },
      { sceneBinding: binding, order: 1, editorialRole: 'hook', preferredMedia: 'image', categories: ['detail'], noveltyConstraints: ['vary-media-type'], continuityGroupIds: [] },
    ] };
    const preferredImage = candidate('preferred-context', 'image', { width: 640, height: 360 });
    const nonPreferredVideo = candidate('non-preferred-context', 'video', { width: 1080, height: 1920, durationMs: 6_000, descriptor: 'tram' });
    const ranked = rankVisualCandidates([nonPreferredVideo, preferredImage], { ...brief, preferredMedia: 'image', noveltyConstraints: ['vary-media-type'] }, [], {
      story, media: [{ sceneId: priorBinding.sceneId, origin: 'selection', mediaType: 'image', provider: 'pexels', providerMediaIdentity: 'prior', categories: ['detail'] }],
    });
    expect(ranked.map((item) => item.candidateId)).toEqual(['pexels:image:preferred-context', 'pexels:video:non-preferred-context']);
    expect(ranked[0].continuity.globalAdjustment).toBeLessThanOrEqual(0);
  });

  it('uses selection-aware continuity instead of double-counting legacy shortlist presence', () => {
    const priorBinding = { sceneId: 'visual-scene-00000000-0000-4000-8000-000000000098', sceneIndex: 0, sceneTextFingerprint: 'scene-text-v1-0000000000000001' } as const;
    const story: VisualStoryPlan = { version: 1, fingerprint: 'visual-story-v1-00000001', continuityGroups: [], beats: [
      { sceneBinding: priorBinding, order: 0, editorialRole: 'context', preferredMedia: 'either', categories: ['detail'], noveltyConstraints: [], continuityGroupIds: [] },
      { sceneBinding: binding, order: 1, editorialRole: 'hook', preferredMedia: 'either', categories: ['detail'], noveltyConstraints: [], continuityGroupIds: [] },
    ] };
    const repeated = candidate('same-context', 'image');
    const legacy = { sceneBinding: binding, briefFingerprint: plan.briefFingerprint, status: 'ready' as const, candidates: [rankVisualCandidates([repeated], brief)[0]], queryCount: 1, failedQueryCount: 0 };
    const ranked = rankVisualCandidates([repeated], brief, [legacy], { story, media: [{ sceneId: priorBinding.sceneId, origin: 'selection', mediaType: 'image', provider: 'pexels', providerMediaIdentity: 'same-context' }] });
    expect(ranked[0].continuity.globalAdjustment).toBe(-12);
    expect(ranked[0].explanations).not.toContain('repeated-visual-penalty');
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
