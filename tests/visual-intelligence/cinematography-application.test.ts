import { describe, expect, it } from 'vitest';
import {
  applyCinematographyApplicationProposal,
  createCinematographyApplicationProposal,
  type CinematographyAssessment,
} from '@/core/visual-intelligence';
import { canonicalStudioCompositionOutput } from '@/lib/studioOutputIdentity';
import type { SceneCompositionDefaults } from '@/core/media/sceneComposition';
import type { Scene } from '@/lib/types';

const defaults = { motion: 'static', transition: 'crossfade' } as const;
const projectId = 'project-a';
const path = 'owner/generated-images/11111111-1111-4111-8111-111111111111.png';
const mediaIdentity = `image:media:${path}`;

function scene(overrides: Partial<Scene> = {}): Scene {
  return { visualPlanningId: 'scene-a', text: 'A scene', duration: 5, visual: 'visual', imageStorage: { bucket: 'media', objectPath: path }, ...overrides };
}
function recommendation(overrides: Partial<CinematographyAssessment> = {}): CinematographyAssessment {
  return {
    version: 1, sceneId: 'scene-a', strategy: 'gentle-push', motion: 'low', crop: 'preserve', transition: 'none', strength: 'moderate', supported: true, reasons: ['strong-semantic-fit'],
    ...overrides,
  };
}
function proposal(scenes: readonly Scene[], assessment = recommendation(), input: Partial<{ projectId: string; sceneIndex: number; defaults: SceneCompositionDefaults; mediaIdentity: string }> = {}) {
  return createCinematographyApplicationProposal({ projectId: input.projectId ?? projectId, scenes, sceneIndex: input.sceneIndex ?? 0, defaults: input.defaults ?? defaults, recommendation: assessment, recommendationMediaIdentity: input.mediaIdentity ?? mediaIdentity });
}

describe('explicit scene-local cinematography application', () => {
  it('maps only exact supported advice and exposes exact effective before/after values', () => {
    const result = proposal([scene({ visualPlanningId: 'scene-0' }), scene()], recommendation({ transition: 'crossfade' }), { sceneIndex: 1 });
    expect(result).toMatchObject({ status: 'ready', current: { motion: 'static', transition: 'crossfade' }, proposed: { motion: 'zoom_in', transition: 'crossfade' } });
    expect(result.changes).toEqual([{ field: 'motion', before: 'static', after: 'zoom_in' }]);
    expect(proposal([scene()], recommendation({ strategy: 'transition-led', motion: 'low' })).status).toBe('unsupported');
    expect(proposal([scene()], recommendation({ strategy: 'transition-led', motion: 'none' })).status).toBe('unsupported');
  });

  it('does not mutate canonical state while generating a proposal', () => {
    const scenes = [scene(), scene({ visualPlanningId: 'scene-b' })];
    const before = structuredClone(scenes);
    const outputBefore = canonicalStudioCompositionOutput(scenes, defaults);
    proposal(scenes);
    expect(scenes).toEqual(before);
    expect(canonicalStudioCompositionOutput(scenes, defaults)).toEqual(outputBefore);
  });

  it('keeps discovery-candidate advice advisory until it is bound to current durable media', () => {
    const candidateOnly = proposal([scene()], recommendation(), { mediaIdentity: 'image:media:unapplied-candidate' });
    expect(candidateOnly).toMatchObject({ status: 'invalid-media', reasons: ['recommendation-media-mismatch'] });
    expect(candidateOnly.changes).toEqual([]);
  });

  it('applies both fields atomically through the Slice 12A mutation authority', () => {
    const scenes = [scene({ visualPlanningId: 'scene-0' }), scene({ visualPlanningId: 'scene-a' })];
    const assessment = recommendation({ transition: 'none' });
    const proposed = proposal(scenes, assessment, { sceneIndex: 1 });
    const outputBefore = canonicalStudioCompositionOutput(scenes, defaults);
    const result = applyCinematographyApplicationProposal({ projectId, scenes, sceneIndex: 1, defaults, recommendation: assessment, recommendationMediaIdentity: mediaIdentity, proposal: proposed });
    expect(result.status).toBe('applied');
    if (result.status !== 'applied') return;
    expect(result.scenes[1].compositionOverride).toEqual({ motion: 'zoom_in', transition: 'none' });
    expect(result.scenes[0]).toEqual(scenes[0]);
    const outputAfter = canonicalStudioCompositionOutput(result.scenes, defaults);
    expect(outputAfter.sceneComposition[1]).toEqual({ motion: 'zoom_in', transition: 'none' });
    expect(outputAfter).not.toEqual(outputBefore);
  });

  it('uses effective state and clears a matching override back to inheritance', () => {
    const inheritedDefaults = { motion: 'zoom_in', transition: 'crossfade' } as const;
    const scenes = [scene({ visualPlanningId: 'scene-0' }), scene({ visualPlanningId: 'scene-a', compositionOverride: { motion: 'static', transition: 'none' } })];
    const assessment = recommendation({ transition: 'crossfade' });
    const proposed = proposal(scenes, assessment, { sceneIndex: 1, defaults: inheritedDefaults });
    expect(proposed.changes).toEqual([{ field: 'motion', before: 'static', after: 'zoom_in' }, { field: 'transition', before: 'none', after: 'crossfade' }]);
    const result = applyCinematographyApplicationProposal({ projectId, scenes, sceneIndex: 1, defaults: inheritedDefaults, recommendation: assessment, recommendationMediaIdentity: mediaIdentity, proposal: proposed });
    expect(result.status).toBe('applied');
    if (result.status === 'applied') expect(result.scenes[1].compositionOverride).toBeUndefined();
  });

  it('excludes transitions for scene zero and one-scene projects while keeping motion applicable', () => {
    const first = proposal([scene()], recommendation({ transition: 'crossfade' }));
    expect(first).toMatchObject({ status: 'ready', proposed: { motion: 'zoom_in', transition: 'none' } });
    expect(first.changes).toEqual([{ field: 'motion', before: 'static', after: 'zoom_in' }]);
    expect(first.reasons).toContain('scene-has-no-incoming-boundary');
  });

  it('fails closed for changed scene, global defaults, canonical media, project, and evidence', () => {
    const scenes = [scene()]; const assessment = recommendation(); const proposed = proposal(scenes, assessment);
    const apply = (next: readonly Scene[], nextDefaults: SceneCompositionDefaults = defaults, nextAssessment = assessment, nextProject = projectId) => applyCinematographyApplicationProposal({ projectId: nextProject, scenes: next, sceneIndex: 0, defaults: nextDefaults, recommendation: nextAssessment, recommendationMediaIdentity: mediaIdentity, proposal: proposed });
    expect(apply([scene({ compositionOverride: { motion: 'pan' } })]).status).toBe('stale');
    expect(apply(scenes, { motion: 'pan', transition: 'crossfade' }).status).toBe('stale');
    expect(apply([scene({ imageStorage: { bucket: 'media', objectPath: 'owner/generated-images/22222222-2222-4222-8222-222222222222.png' } })]).status).toBe('invalid-media');
    expect(apply(scenes, defaults, assessment, 'project-b').status).toBe('stale');
    expect(apply(scenes, defaults, recommendation({ strategy: 'restrained-pan', motion: 'low' })).status).toBe('stale');
  });

  it('has deterministic no-op and double-apply behavior without revision churn', () => {
    const matching = [scene({ compositionOverride: { motion: 'zoom_in' } })];
    const noChange = proposal(matching);
    expect(noChange.status).toBe('no-op');
    expect(applyCinematographyApplicationProposal({ projectId, scenes: matching, sceneIndex: 0, defaults, recommendation: recommendation(), recommendationMediaIdentity: mediaIdentity, proposal: noChange }).status).toBe('no-op');
    const initial = [scene()]; const proposed = proposal(initial);
    const first = applyCinematographyApplicationProposal({ projectId, scenes: initial, sceneIndex: 0, defaults, recommendation: recommendation(), recommendationMediaIdentity: mediaIdentity, proposal: proposed });
    expect(first.status).toBe('applied');
    if (first.status === 'applied') expect(applyCinematographyApplicationProposal({ projectId, scenes: first.scenes, sceneIndex: 0, defaults, recommendation: recommendation(), recommendationMediaIdentity: mediaIdentity, proposal: proposed }).status).toBe('stale');
  });

  it('never applies image motion to video while retaining an independently applicable transition', () => {
    const videoPath = 'owner/videos/33333333-3333-4333-8333-333333333333.mp4';
    const scenes = [scene({ visualPlanningId: 'scene-0' }), scene({ visualPlanningId: 'scene-a', imageStorage: undefined, videoStorage: { bucket: 'media', objectPath: videoPath } })];
    const videoMedia = `video:media:${videoPath}`;
    const assessed = recommendation({ transition: 'none' });
    const proposed = createCinematographyApplicationProposal({ projectId, scenes, sceneIndex: 1, defaults, recommendation: assessed, recommendationMediaIdentity: videoMedia });
    expect(proposed.changes).toEqual([{ field: 'transition', before: 'crossfade', after: 'none' }]);
    expect(proposed.reasons).toContain('video-motion-not-executable');
  });
});
