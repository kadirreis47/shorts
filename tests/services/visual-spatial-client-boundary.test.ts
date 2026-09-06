import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.fn();
vi.mock('@/lib/api/client', () => ({ apiClient: { post } }));

const media = { bucket: 'media', objectPath: '00000000-0000-4000-8000-000000000001/generated-images/00000000-0000-4000-8000-000000000002.png' } as const;
const now = Date.now();
const spatialReference = { reference: `omr1.${'a'.repeat(16)}.${'b'.repeat(48)}`, issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + 300_000).toISOString(), scope: 'spatial-image-analysis', mediaType: 'image' } as const;
const evaluated = { status: 'evaluated', contractVersion: 'visual-spatial-v1', analyzerVersion: 'openai:gpt-test', sourceDimensions: { width: 1200, height: 800 }, focalPoint: { x: 0.5, y: 0.4 }, confidenceBand: 'medium' } as const;

describe('visual spatial client boundary', () => {
  beforeEach(() => post.mockReset());

  it('requests and verifies the distinct spatial capability scope', async () => {
    const { issueOpaqueSpatialMediaAnalysisReference } = await import('@/lib/api');
    post.mockResolvedValueOnce(spatialReference);
    await expect(issueOpaqueSpatialMediaAnalysisReference(media)).resolves.toEqual(spatialReference);
    expect(post).toHaveBeenCalledWith('media-analysis-reference', { media, scope: 'spatial-image-analysis' }, { retryCount: 0, timeoutMs: 15_000 });
    post.mockResolvedValueOnce({ ...spatialReference, scope: 'semantic-image-analysis' });
    await expect(issueOpaqueSpatialMediaAnalysisReference(media)).rejects.toThrow(/invalid/i);
  });

  it('strictly validates canonical and discovery responses without client dimensions or URLs', async () => {
    const { analyzeVisualSpatial, analyzeDiscoveryCandidateSpatial } = await import('@/lib/api');
    post.mockResolvedValueOnce(evaluated);
    await expect(analyzeVisualSpatial({ reference: spatialReference.reference, requestId: 'spatial-request-123' })).resolves.toEqual(evaluated);
    expect(post).toHaveBeenLastCalledWith('analyze-visual-spatial', expect.not.objectContaining({ sourceDimensions: expect.anything() }), { retryCount: 0, timeoutMs: 45_000 });
    post.mockResolvedValueOnce(evaluated);
    await expect(analyzeDiscoveryCandidateSpatial({ candidate: { provider: 'pexels', providerAssetId: 42, mediaType: 'image' }, requestId: 'candidate-spatial-123' })).resolves.toEqual(evaluated);
    expect(post).toHaveBeenLastCalledWith('analyze-discovery-candidate-spatial', { candidate: { provider: 'pexels', providerAssetId: 42, mediaType: 'image' }, requestId: 'candidate-spatial-123' }, { retryCount: 0, timeoutMs: 45_000 });
    post.mockResolvedValueOnce({ ...evaluated, previewUrl: 'https://unsafe.test/a.jpg' });
    await expect(analyzeVisualSpatial({ reference: spatialReference.reference, requestId: 'spatial-request-456' })).rejects.toThrow(/unsupported|invalid/i);
  });

  it('keeps applied and candidate evidence session-only, isolated, and stale-guarded', () => {
    const studio = readFileSync('src/views/Studio.tsx', 'utf8');
    const appliedStart = studio.indexOf('async function handleAnalyzeSceneSpatial');
    const candidateStart = studio.indexOf('async function handleAnalyzeDiscoveryCandidateSpatial');
    const end = studio.indexOf('async function handleGenerateSceneImage', candidateStart);
    const applied = studio.slice(appliedStart, candidateStart);
    const candidate = studio.slice(candidateStart, end);
    for (const handler of [applied, candidate]) {
      expect(handler).toContain('visualSessionEpoch.current');
      expect(handler).toContain('directorProjectIdRef.current');
      expect(handler).toContain('sceneId');
      expect(handler).toContain('sceneIndex');
      expect(handler).not.toContain('setScenes(');
      expect(handler).not.toContain('saveStudioDraft');
      expect(handler).not.toContain('compositionOverride');
    }
    expect(applied).toContain('current !== scene');
    expect(applied).toContain('current.imageStorage?.objectPath !== mediaPath');
    expect(applied).toContain('issueOpaqueSpatialMediaAnalysisReference');
    expect(candidate).toContain('currentScene !== scene');
    expect(candidate).toContain('selectedVisualCandidatesRef.current[sceneId] !== candidateId');
    expect(candidate).toContain('visualDiscoveryGenerations.current.get(sceneId) !== discoveryGeneration');
    expect(candidate).toContain('analyzeDiscoveryCandidateSpatial');
    expect(studio).toContain("scope: 'applied-image'");
    expect(studio).toContain("scope: 'discovery-candidate-image'");
  });

  it('invalidates Search Again, selection, media Apply, project, scene, and replacement bindings', () => {
    const studio = readFileSync('src/views/Studio.tsx', 'utf8');
    const search = studio.slice(studio.indexOf('async function handleFindPremiumVisuals'), studio.indexOf('async function handleApplyPremiumVisual'));
    const apply = studio.slice(studio.indexOf('async function handleApplyPremiumVisual'), studio.indexOf('function handleApplyCinematography'));
    expect(search.indexOf('setCandidateSpatialEvidence')).toBeLessThan(search.indexOf('await planVisualQueries'));
    expect(apply).toContain('requestVisualSpatialEvidenceChange');
    expect(apply).toContain('setCandidateSpatialEvidence');
    expect(studio).toContain('setCandidateSpatialEvidence((current) => { const { [sceneId]: _ignored, ...rest } = current; return rest; });');
    expect(studio).toContain('filterSpatialEvidence(visualSpatialEvidenceRef.current');
    expect(studio).toContain('requestVisualSpatialEvidenceChange({});');
    expect(studio).toContain('setCandidateSpatialEvidence({});');
  });

  it('excludes evidence from persistence and all executable output/freshness inputs', () => {
    const studio = readFileSync('src/views/Studio.tsx', 'utf8');
    const revision = studio.slice(studio.indexOf('const canonicalStudioRevision = useMemo'), studio.indexOf('const currentCompletedExport'));
    const draft = studio.slice(studio.indexOf('const draft = useMemo<StudioDraft>'), studio.indexOf('useEffect(() => {', studio.indexOf('const draft = useMemo<StudioDraft>')));
    expect(revision).not.toMatch(/Spatial/i);
    expect(draft).not.toMatch(/Spatial/i);
    expect(readFileSync('src/lib/studioOutputIdentity.ts', 'utf8')).not.toMatch(/Spatial/i);
    expect(readFileSync('src/lib/studioDraft.ts', 'utf8')).not.toMatch(/Spatial/i);
    expect(readFileSync('src/lib/types.ts', 'utf8')).not.toMatch(/Spatial/i);
    expect(readFileSync('src/core/media/studioProductionRecipe.ts', 'utf8')).not.toMatch(/Spatial/i);
    expect(readFileSync('src/core/render/sceneFingerprint.ts', 'utf8')).not.toMatch(/Spatial/i);
  });
});
