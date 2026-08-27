import { describe, expect, it } from 'vitest';
import {
  assessVisualCandidateContinuity,
  assessVisualSequence,
  createSceneVisualBinding,
  createVisualStoryPlan,
  ensureSceneVisualPlanningIds,
  isVisualStoryPlanCurrent,
  neutralCandidateContinuity,
  visualBriefFingerprint,
  type VisualDiscoveryCandidate,
} from '@/core/visual-intelligence';
import { canonicalStudioOutputScenes } from '@/lib/studioOutputIdentity';
import type { Scene } from '@/lib/types';

const scenes = ensureSceneVisualPlanningIds([
  { visualPlanningId: 'visual-scene-00000000-0000-4000-8000-000000000011', text: 'Opening scene.' },
  { visualPlanningId: 'visual-scene-00000000-0000-4000-8000-000000000012', text: 'Evidence scene.' },
  { visualPlanningId: 'visual-scene-00000000-0000-4000-8000-000000000013', text: 'Payoff scene.' },
]);
const bindings = scenes.map((_, index) => createSceneVisualBinding(scenes, index));
const briefs = bindings.map((sceneBinding, index) => ({
  version: 1 as const, sceneBinding, subject: index < 2 ? 'historic tram' : 'tram conclusion', location: index < 2 ? 'istanbul center' : undefined,
  editorialRole: index === 0 ? 'hook' as const : index === 1 ? 'evidence' as const : 'payoff' as const,
  preferredMedia: 'either' as const, visualStyleHints: [], visualExclusions: [], noveltyConstraints: index === 2 ? ['vary-media-type'] as const : [],
  sourceIntent: { allowedSourceKinds: ['licensed-stock'] as const, commerciallyUsableSourceRequired: true, attributionPreference: 'no-preference' as const },
}));
const planning = {
  version: 1 as const,
  briefs,
  queryPlans: briefs.map((brief, index) => ({ version: 1 as const, sceneBinding: brief.sceneBinding, briefFingerprint: visualBriefFingerprint(brief), concepts: [
    { query: `tram establishing ${index}`, targetMedia: 'either' as const, priority: 1, category: 'establishing' as const },
    { query: `tram detail ${index}`, targetMedia: 'either' as const, priority: 2, category: 'detail' as const },
    { query: `tram action ${index}`, targetMedia: 'either' as const, priority: 3, category: 'action' as const },
  ] })),
};
function candidate(id: string, mediaType: 'image' | 'video'): VisualDiscoveryCandidate {
  return { candidateId: `pexels:${mediaType}:${id}`, provider: 'pexels', providerMediaIdentity: id, mediaType, orientation: 'portrait', width: 1080, height: 1920, ...(mediaType === 'video' ? { durationMs: 5_000 } : {}), descriptor: 'tram', conceptCategories: ['detail'], conceptPriorities: [1], providerRanks: [1], sourcePolicy: { provider: 'pexels', sourceClass: 'provider-catalog' } };
}

describe('visual continuity and storytelling intelligence', () => {
  it('constructs deterministic ordered story beats and groups only explicit shared planning evidence', () => {
    const first = createVisualStoryPlan(planning, scenes);
    const second = createVisualStoryPlan(planning, scenes);
    expect(first).toEqual(second);
    expect(first.beats.map((beat) => beat.sceneBinding.sceneId)).toEqual(bindings.map((binding) => binding.sceneId));
    expect(first.continuityGroups).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'shared-location-intent', sceneIds: [bindings[0].sceneId, bindings[1].sceneId] })]));
    expect(first.continuityGroups.every((group) => group.sceneIds.length > 1)).toBe(true);
  });

  it('becomes stale on scene edit, reorder, insertion, or deletion without affecting canonical media', () => {
    const story = createVisualStoryPlan(planning, scenes);
    expect(isVisualStoryPlanCurrent(story, planning, scenes)).toBe(true);
    expect(isVisualStoryPlanCurrent(story, planning, [{ ...scenes[0], text: 'Edited.' }, scenes[1], scenes[2]])).toBe(false);
    expect(isVisualStoryPlanCurrent(story, planning, [scenes[1], scenes[0], scenes[2]])).toBe(false);
    expect(isVisualStoryPlanCurrent(story, planning, [{ text: 'Inserted.' }, ...scenes])).toBe(false);
    expect(isVisualStoryPlanCurrent(story, planning, scenes.slice(0, 2))).toBe(false);
  });

  it('reports repeat pressure and media rhythm using identities and metadata only', () => {
    const story = createVisualStoryPlan(planning, scenes);
    const assessment = assessVisualSequence(story, [
      { sceneId: bindings[0].sceneId, origin: 'selection', mediaType: 'image', provider: 'pexels', providerMediaIdentity: 'same', categories: ['detail'] },
      { sceneId: bindings[1].sceneId, origin: 'canonical', mediaType: 'image', provider: 'pexels', providerMediaIdentity: 'same', categories: ['detail'] },
      { sceneId: bindings[2].sceneId, origin: 'selection', mediaType: 'image', provider: 'pexels', providerMediaIdentity: 'other', categories: ['detail'] },
    ]);
    expect(assessment.reasons).toEqual(expect.arrayContaining(['repeated-provider-media', 'media-type-run', 'repeated-category-pattern', 'novelty-request-unmet', 'intentional-continuity']));
    expect(assessment.score).toBeGreaterThanOrEqual(0);
    expect(assessment.score).toBeLessThanOrEqual(100);
  });

  it('keeps local quality independent and bounds global continuity influence', () => {
    const story = createVisualStoryPlan(planning, scenes);
    const continuity = assessVisualCandidateContinuity({ story, target: bindings[2], candidate: candidate('new', 'image'), media: [
      { sceneId: bindings[0].sceneId, origin: 'selection', mediaType: 'image', provider: 'pexels', providerMediaIdentity: 'a', categories: ['detail'] },
      { sceneId: bindings[1].sceneId, origin: 'selection', mediaType: 'image', provider: 'pexels', providerMediaIdentity: 'b', categories: ['detail'] },
    ] });
    expect(continuity.localQualityIndependent).toBe(true);
    expect(continuity.globalAdjustment).toBeGreaterThanOrEqual(-12);
    expect(continuity.globalAdjustment).toBeLessThanOrEqual(12);
    expect(continuity.reasons).toEqual(expect.arrayContaining(['media-type-run', 'novelty-request-unmet', 'repeated-category-pattern']));
    expect(neutralCandidateContinuity()).toMatchObject({ globalAdjustment: 0, reasons: [] });
  });

  it('keeps story planning and sequence assessment outside canonical output identity', () => {
    const story = createVisualStoryPlan(planning, scenes);
    const canonical: Scene[] = [{ text: 'Canonical scene.', duration: 3, visual: 'tram', imageStorage: { bucket: 'media', objectPath: 'owner/images/tram.png' } }];
    const before = canonicalStudioOutputScenes(canonical);
    const assessment = assessVisualSequence(story, []);
    expect(canonicalStudioOutputScenes(canonical)).toEqual(before);
    expect(JSON.stringify(before)).not.toContain(story.fingerprint);
    expect(JSON.stringify(before)).not.toContain(JSON.stringify(assessment));
  });
});
