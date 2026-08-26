import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const studio = readFileSync('src/views/Studio.tsx', 'utf8');

describe('Premium Visual Discovery Studio boundary', () => {
  it('keeps review and selection separate from durable canonical application', () => {
    expect(studio).toContain("t('studio.findVisuals')");
    expect(studio).toContain("t('studio.useThisVisual')");
    expect(studio).toContain('setSelectedVisualCandidates');
    expect(studio).toContain('await ingestPexelsImage(providerMediaId');
    expect(studio).toContain('await prepareDurablePexelsVideo(providerMediaId');
    expect(studio).not.toContain('candidate.previewUrl');
    expect(studio).not.toContain('candidate.downloadUrl');
  });

  it('guards a durable apply against ownership, scene, selection, and generation races', () => {
    expect(studio).toContain('assertCurrentMediaOwnerContext(owner)');
    expect(studio).toContain('visualApplyGenerations.current.get(sceneId) !== generation');
    expect(studio).toContain('selectedVisualCandidatesRef.current[sceneId] !== selectedId');
    expect(studio).toContain("currentScene.text !== scene.text");
    expect(studio).toContain("t('studio.visualApplyFailed')");
    expect(studio).toContain('isSceneVisualBindingCurrent(binding, scenesRef.current)');
    expect(studio).toContain('visualApplyActive.current.has(`${visualSessionEpoch.current}:${sceneId}`)');
  });

  it('keeps provider previews and review state session-only and outside output identity', () => {
    expect(studio).toContain('setVisualShortlists({});');
    expect(studio).toContain('setSelectedVisualCandidates({});');
    expect(studio).toContain('resolvePreview(candidate.candidateId)');
    expect(studio).toContain('canonicalStudioOutputScenes(scenes)');
    expect(studio).toContain('visualSessionEpoch.current += 1');
  });

  it('classifies planner and exhausted Pexels discovery failures without changing media', () => {
    expect(studio).toContain("'VISUAL_PLANNER_REQUEST_FAILED'");
    expect(studio).toContain("'VISUAL_DISCOVERY_PROVIDER_UNAVAILABLE'");
    expect(studio).toContain("shortlist.status === 'empty' && shortlist.failedQueryCount > 0");
    expect(studio).toContain("t('studio.visualPlanningUnavailable')");
    expect(studio).toContain("t('studio.visualDiscoveryUnavailable')");
  });
});
