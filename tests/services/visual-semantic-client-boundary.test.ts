import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { interpretVisualSemanticAnalysis, semanticRankingAdjustment, visualBriefFingerprint } from '@/core/visual-intelligence';

const post = vi.fn();
vi.mock('@/lib/api/client', () => ({ apiClient: { post } }));

const semanticRequest = {
  version: 1, analyzerVersion: 'visual-semantic-v1', briefFingerprint: 'brief-fingerprint-1234',
  candidate: { candidateId: 'durable-image:visual-scene-1', provider: 'durable-owner-media', providerMediaIdentity: 'visual-scene-1', mediaType: 'image' as const },
} as const;
const analysisBrief = { version: 1, sceneBinding: { sceneId: 'visual-scene-11111111-1111-4111-8111-111111111111', sceneIndex: 0, sceneTextFingerprint: 'scene-text-v1-1234567812345678' }, subject: 'control room', editorialRole: 'evidence', preferredMedia: 'image', visualStyleHints: [], visualExclusions: [], noveltyConstraints: [], sourceIntent: { allowedSourceKinds: ['manual'], commerciallyUsableSourceRequired: false, attributionPreference: 'no-preference' } } as const;

describe('visual semantic client authority and identity boundary', () => {
  it('accepts only strict bounded Edge responses and keeps provider facts out of app state', async () => {
    const { analyzeVisualSemantics } = await import('@/lib/api');
    post.mockResolvedValueOnce({ status: 'evaluated', contractVersion: 'visual-semantic-v1', observations: [{ dimension: 'subject', evidence: 'supports-intent', confidenceBand: 'high', facts: ['Control panels are visible'] }] });
    const result = await analyzeVisualSemantics({
      reference: `omr1.${'a'.repeat(16)}.${'b'.repeat(48)}`, requestId: 'semantic-request-123',
      intent: { brief: analysisBrief, briefFingerprint: visualBriefFingerprint(analysisBrief), dimensions: ['subject'] },
    });
    const assessment = interpretVisualSemanticAnalysis(semanticRequest, result);
    expect(assessment.signals).toEqual([{ dimension: 'subject', state: 'evaluated', interpretation: 'match', confidenceBand: 'high', observation: 'provider-observed-match' }]);
    expect(semanticRankingAdjustment(assessment)).toBe(4);
    expect(JSON.stringify(assessment)).not.toContain('Control panels are visible');
    expect(post).toHaveBeenCalledWith('analyze-visual-semantics', expect.anything(), { retryCount: 0, timeoutMs: 45_000 });
  });

  it('rejects an Edge response that claims an unrequested dimension', async () => {
    const { analyzeVisualSemantics } = await import('@/lib/api');
    post.mockResolvedValueOnce({ status: 'evaluated', contractVersion: 'visual-semantic-v1', observations: [{ dimension: 'mood', evidence: 'supports-intent', confidenceBand: 'high', facts: [] }] });
    await expect(analyzeVisualSemantics({ reference: `omr1.${'a'.repeat(16)}.${'b'.repeat(48)}`, requestId: 'semantic-request-123', intent: { brief: analysisBrief, briefFingerprint: visualBriefFingerprint(analysisBrief), dimensions: ['subject'] } })).rejects.toThrow(/invalid/i);
  });

  it('rejects an incomplete evaluated response rather than partially trusting it', async () => {
    const { analyzeVisualSemantics } = await import('@/lib/api');
    post.mockResolvedValueOnce({ status: 'evaluated', contractVersion: 'visual-semantic-v1', observations: [{ dimension: 'subject', evidence: 'supports-intent', confidenceBand: 'high', facts: [] }] });
    await expect(analyzeVisualSemantics({ reference: `omr1.${'a'.repeat(16)}.${'b'.repeat(48)}`, requestId: 'semantic-request-123', intent: { brief: analysisBrief, briefFingerprint: visualBriefFingerprint(analysisBrief), dimensions: ['subject', 'setting'] } })).rejects.toThrow(/invalid/i);
  });

  it('keeps semantic analysis session-only, advisory, and guarded against stale completion', () => {
    const source = readFileSync('src/views/Studio.tsx', 'utf8');
    const start = source.indexOf('async function handleAnalyzeSceneVisual');
    const end = source.indexOf('async function handleGenerateSceneImage', start);
    const handler = source.slice(start, end);
    expect(handler).toContain('issueOpaqueMediaAnalysisReference(scene.imageStorage)');
    expect(handler).toContain('visualSemanticRequests.current.tryAcquire(operation)');
    expect(handler).toContain('visualSemanticRequests.current.release(operation)');
    expect(handler).not.toContain('cached');
    expect(handler).toContain('visualSemanticGenerations.current.get(sceneId) !== generation');
    expect(handler).toContain('visualSessionEpoch.current !== epoch');
    expect(handler).toContain('current.imageStorage?.objectPath !== mediaPath');
    expect(handler).toContain('setVisualSemanticAssessments');
    expect(handler).not.toContain('setScenes(');
    expect(handler).not.toContain('saveStudioDraft');
    expect(handler).not.toContain('createPrivateMediaSignedUrl');
  });
});
