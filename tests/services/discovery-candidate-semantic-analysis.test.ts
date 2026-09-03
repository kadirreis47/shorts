import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeDiscoveryCandidateSemanticAnalysisRequest } from '../../supabase/functions/_shared/visual-semantic-analysis';
import { isApprovedPexelsUrl } from '../../supabase/functions/ingest-pexels-image/pexels-image-source';
import { visualBriefFingerprint } from '../../supabase/functions/_shared/visual-intelligence';

const brief = { version: 1, sceneBinding: { sceneId: 'visual-scene-11111111-1111-4111-8111-111111111111', sceneIndex: 0, sceneTextFingerprint: 'scene-text-v1-1234567812345678' }, subject: 'archive room', editorialRole: 'evidence', preferredMedia: 'image', visualStyleHints: [], visualExclusions: [], noveltyConstraints: [], sourceIntent: { allowedSourceKinds: ['manual'], commerciallyUsableSourceRequired: false, attributionPreference: 'no-preference' } } as const;
const request = { candidate: { provider: 'pexels', providerAssetId: 42, mediaType: 'image' }, requestId: 'candidate-request-123', intent: { brief, briefFingerprint: visualBriefFingerprint(brief), dimensions: ['subject'] } } as const;

describe('analysis-only discovery candidate boundary', () => {
  it('accepts only an exact Pexels image identity, never renderer media authority', () => {
    expect(normalizeDiscoveryCandidateSemanticAnalysisRequest(request).candidate).toEqual(request.candidate);
    for (const providerAssetId of ['../1', '/', '\\', '?', '#', '%2f', '%5c', '..', '42 ', -1, 1.5, 1e30, Number.MAX_SAFE_INTEGER, null]) expect(() => normalizeDiscoveryCandidateSemanticAnalysisRequest({ ...request, candidate: { ...request.candidate, providerAssetId } })).toThrow();
    for (const candidate of [{ provider: 'unknown', providerAssetId: 42, mediaType: 'image' }, { provider: 'pexels', providerAssetId: 42, mediaType: 'video' }]) expect(() => normalizeDiscoveryCandidateSemanticAnalysisRequest({ ...request, candidate })).toThrow();
    for (const field of ['url', 'previewUrl', 'downloadUrl', 'src', 'href', 'original', 'large2x', 'host', 'hostname', 'redirect', 'bucket', 'storagePath', 'localPath', 'owner', 'providerUrl', 'mediaUrl']) {
      expect(() => normalizeDiscoveryCandidateSemanticAnalysisRequest({ ...request, [field]: 'https://127.0.0.1/x' })).toThrow();
      expect(() => normalizeDiscoveryCandidateSemanticAnalysisRequest({ ...request, candidate: { ...request.candidate, [field]: 'https://127.0.0.1/x' } })).toThrow();
    }
  });

  it('enforces exact HTTPS Pexels media host before every redirect target', () => {
    expect(isApprovedPexelsUrl('https://images.pexels.com/photos/42/a.jpg', 'images.pexels.com')).toBe(true);
    for (const value of ['http://images.pexels.com/a.jpg', 'https://localhost/a.jpg', 'https://127.0.0.1/a.jpg', 'https://[::1]/a.jpg', 'https://169.254.169.254/a.jpg', 'file:///tmp/a.jpg', 'ftp://images.pexels.com/a.jpg', 'https://x@images.pexels.com/a.jpg', 'https://images.pexels.com@evil.example/a.jpg', 'https://images.pexels.com.evil/a.jpg', 'https://images.pexels.com./a.jpg', 'https://images.pexels.com:443/a.jpg', 'https://images.pexels.com:444/a.jpg', 'https://%69mages.pexels.com/a.jpg', 'https://images.pexels.com\\@evil.example/a.jpg', 'https://images.\tpexels.com/a.jpg', 'https://images.pexels.com/a.jpg#fragment']) expect(isApprovedPexelsUrl(value, 'images.pexels.com')).toBe(false);
  });

  it('uses server Pexels resolution, bounded streaming, validation, and no canonical bridge', () => {
    const edge = readFileSync('supabase/functions/analyze-discovery-candidate-semantics/index.ts', 'utf8');
    const resolver = readFileSync('supabase/functions/_shared/pexels-analysis-candidate.ts', 'utf8');
    expect(edge).toContain('resolvePexelsAnalysisCandidate');
    expect(edge).not.toContain('ingestPexelsImage');
    expect(edge).not.toContain('createSignedUrl');
    expect(edge).not.toContain('objectPath');
    expect(resolver).toContain('redirect: "manual"');
    expect(resolver).toContain('MAX_SEMANTIC_PROVIDER_IMAGE_BYTES');
    expect(resolver).toContain('validateAnalysisImage');
    expect(resolver).toContain('https://api.pexels.com/v1/photos/${assetId}');
    expect(readFileSync('supabase/functions/_shared/protected-function.ts', 'utf8')).toContain('functionName === "analyze-discovery-candidate-semantics"');
  });

  it('binds completion to shortlist generation and uses a code-level in-flight registry', () => {
    const studio = readFileSync('src/views/Studio.tsx', 'utf8');
    const start = studio.indexOf('async function handleAnalyzeDiscoveryCandidate');
    const end = studio.indexOf('async function handleGenerateSceneImage', start);
    const handler = studio.slice(start, end);
    expect(handler).toContain('candidateSemanticRequests.current.tryAcquire(operation)');
    expect(handler).toContain('candidateSemanticRequests.current.release(operation)');
    expect(handler).toContain('visualDiscoveryGenerations.current.get(sceneId) !== discoveryGeneration');
    expect(handler).toContain('currentShortlist?.candidates.some');
    expect(handler).not.toContain('setScenes(');
    expect(handler).not.toContain('ingestPexelsImage');
    expect(handler).not.toContain('saveStudioDraft');
  });
});
