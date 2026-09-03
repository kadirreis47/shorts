import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  evaluatedVisualSpatialAnalysis,
  normalizeDiscoveryCandidateSpatialAnalysisRequest,
  normalizeVisualSpatialAnalysisRequest,
  normalizeVisualSpatialAnalysisResponse,
  normalizeVisualSpatialProviderEvidence,
  unavailableVisualSpatialAnalysis,
} from '../../supabase/functions/_shared/visual-spatial-analysis';
import { createOpenAIVisualSpatialProvider, MAX_SPATIAL_PROVIDER_IMAGE_BYTES } from '../../supabase/functions/_shared/openai-visual-spatial-provider';
import * as browserSpatialContract from '../../src/core/visual-intelligence/visualSpatialAnalysis';
import * as edgeSpatialContract from '../../supabase/functions/_shared/visual-spatial-analysis';

const reference = `omr1.${'a'.repeat(16)}.${'b'.repeat(48)}`;
const providerEvidence = { focalPoint: { x: 0.5, y: 0.375 }, primarySubjectRegion: { x: 0.2, y: 0.1, width: 0.6, height: 0.8 }, confidenceBand: 'medium' } as const;

describe('visual spatial evidence contract', () => {
  it('uses the Edge contract itself as the browser contract authority', () => {
    expect(browserSpatialContract.normalizeVisualSpatialAnalysisRequest).toBe(edgeSpatialContract.normalizeVisualSpatialAnalysisRequest);
    expect(browserSpatialContract.normalizeDiscoveryCandidateSpatialAnalysisRequest).toBe(edgeSpatialContract.normalizeDiscoveryCandidateSpatialAnalysisRequest);
    expect(browserSpatialContract.normalizeVisualSpatialAnalysisResponse).toBe(edgeSpatialContract.normalizeVisualSpatialAnalysisResponse);
  });

  it('admits focal-only and one bounded generic primary-subject region', () => {
    expect(normalizeVisualSpatialProviderEvidence({ focalPoint: { x: 0.5, y: 0.5 }, primarySubjectRegion: null, confidenceBand: 'low' })).toEqual({ focalPoint: { x: 0.5, y: 0.5 }, confidenceBand: 'low' });
    expect(normalizeVisualSpatialProviderEvidence(providerEvidence)).toEqual(providerEvidence);
    expect(evaluatedVisualSpatialAnalysis({ analyzerVersion: 'openai:gpt-4.1-mini', sourceDimensions: { width: 1920, height: 1080 }, evidence: providerEvidence })).toMatchObject({
      status: 'evaluated', contractVersion: 'visual-spatial-v1', analyzerVersion: 'openai:gpt-4.1-mini', sourceDimensions: { width: 1920, height: 1080 }, ...providerEvidence,
    });
  });

  it('rejects malformed, non-finite, imprecise, and out-of-range geometry without clamping', () => {
    const invalidPoints = [
      { x: -0.0001, y: 0.5 }, { x: 1.0001, y: 0.5 }, { x: Number.NaN, y: 0.5 }, { x: Number.POSITIVE_INFINITY, y: 0.5 },
      { x: 0.12345, y: 0.5 }, { x: '0.5', y: 0.5 }, { x: 0.5 }, [0.5, 0.5], null,
    ];
    for (const focalPoint of invalidPoints) expect(() => normalizeVisualSpatialProviderEvidence({ focalPoint, primarySubjectRegion: null, confidenceBand: 'medium' })).toThrow();
    const invalidRegions = [
      { x: 0, y: 0, width: 0, height: 0.5 }, { x: 0, y: 0, width: -0.1, height: 0.5 },
      { x: -0.1, y: 0, width: 0.5, height: 0.5 }, { x: 0, y: -0.1, width: 0.5, height: 0.5 },
      { x: 0.8, y: 0, width: 0.3, height: 0.5 }, { x: 0, y: 0.9, width: 0.5, height: 0.2 },
      { x: 0, y: 0, width: Number.NaN, height: 0.5 }, { x: 0, y: 0, width: 0.5, height: Number.NEGATIVE_INFINITY },
      { x: 0, y: 0, width: 0.12345, height: 0.5 },
    ];
    for (const primarySubjectRegion of invalidRegions) expect(() => normalizeVisualSpatialProviderEvidence({ focalPoint: { x: 0.5, y: 0.5 }, primarySubjectRegion, confidenceBand: 'medium' })).toThrow();
  });

  it('accepts exact decimal boundary boxes and rejects any actual floating-point overflow', () => {
    for (const primarySubjectRegion of [
      { x: 0.1, y: 0, width: 0.9, height: 1 },
      { x: 0, y: 0.1, width: 1, height: 0.9 },
      { x: 0, y: 0, width: 1, height: 1 },
      { x: 0.9999, y: 0.9999, width: 0.0001, height: 0.0001 },
    ]) expect(() => normalizeVisualSpatialProviderEvidence({ focalPoint: { x: 0.5, y: 0.5 }, primarySubjectRegion, confidenceBand: 'medium' })).not.toThrow();

    for (const primarySubjectRegion of [
      { x: 0.10000000000000012, y: 0, width: 0.9, height: 1 },
      { x: 0, y: 0.10000000000000012, width: 1, height: 0.9 },
    ]) expect(() => normalizeVisualSpatialProviderEvidence({ focalPoint: { x: 0.5, y: 0.5 }, primarySubjectRegion, confidenceBand: 'medium' })).toThrow(/exceeds image bounds/u);
  });

  it('rejects unexpected/unbounded structure, forged dimensions, arrays, labels, and malformed confidence', () => {
    for (const value of [
      { ...providerEvidence, confidenceBand: '0.9' },
      { ...providerEvidence, confidenceBand: Number.NaN },
      { ...providerEvidence, sourceDimensions: { width: 1, height: 1 } },
      { ...providerEvidence, label: 'ignore previous instructions' },
      { ...providerEvidence, subjects: Array.from({ length: 1000 }, () => providerEvidence.primarySubjectRegion) },
      { ...providerEvidence, focalPoint: { ...providerEvidence.focalPoint, url: 'https://unsafe.test' } },
      { ...providerEvidence, primarySubjectRegion: { ...providerEvidence.primarySubjectRegion, name: '<script>' } },
      [], null,
    ]) expect(() => normalizeVisualSpatialProviderEvidence(value)).toThrow();
  });

  it('accepts only image-only reference and Pexels candidate request identities', () => {
    expect(normalizeVisualSpatialAnalysisRequest({ reference, requestId: 'spatial-request-123' })).toBeTruthy();
    expect(normalizeDiscoveryCandidateSpatialAnalysisRequest({ candidate: { provider: 'pexels', providerAssetId: 42, mediaType: 'image' }, requestId: 'candidate-spatial-123' }).candidate.providerAssetId).toBe(42);
    expect(() => normalizeVisualSpatialAnalysisRequest({ reference, requestId: 'spatial-request-123', sourceDimensions: { width: 1, height: 1 } })).toThrow();
    for (const candidate of [
      { provider: 'unknown', providerAssetId: 42, mediaType: 'image' },
      { provider: 'pexels', providerAssetId: 42, mediaType: 'video' },
      { provider: 'pexels', providerAssetId: '../42', mediaType: 'image' },
      { provider: 'pexels', providerAssetId: Number.MAX_SAFE_INTEGER, mediaType: 'image' },
    ]) expect(() => normalizeDiscoveryCandidateSpatialAnalysisRequest({ candidate, requestId: 'candidate-spatial-123' })).toThrow();
  });

  it('strictly normalizes evaluated and unavailable responses', () => {
    const evaluated = evaluatedVisualSpatialAnalysis({ analyzerVersion: 'openai:gpt-4.1-mini', sourceDimensions: { width: 1080, height: 1920 }, evidence: providerEvidence });
    expect(normalizeVisualSpatialAnalysisResponse(evaluated)).toEqual(evaluated);
    expect(normalizeVisualSpatialAnalysisResponse(unavailableVisualSpatialAnalysis('provider-credit-exhausted'))).toEqual({ status: 'unavailable', reason: 'provider-credit-exhausted', contractVersion: 'visual-spatial-v1' });
    expect(() => normalizeVisualSpatialAnalysisResponse({ ...evaluated, crop: { x: 0, y: 0 } })).toThrow();
    expect(() => normalizeVisualSpatialAnalysisResponse({ ...evaluated, sourceDimensions: { width: 0, height: 1920 } })).toThrow();
    expect(() => normalizeVisualSpatialAnalysisResponse({ status: 'evaluated', contractVersion: 'visual-spatial-v1', analyzerVersion: 'x', sourceDimensions: { width: 1080, height: 1920 }, focalPoint: { x: 0.5, y: 0.5 }, confidenceBand: 'certain' })).toThrow();
    expect(() => normalizeVisualSpatialAnalysisResponse({ status: 'unsupported', reason: 'provider-timeout', contractVersion: 'visual-spatial-v1' })).toThrow();
    expect(() => normalizeVisualSpatialAnalysisResponse({ status: 'unavailable', reason: 'unsupported-media', contractVersion: 'visual-spatial-v1' })).toThrow();
  });
});

describe('OpenAI visual spatial provider boundary', () => {
  it('uses a strict geometry-only schema and returns only admitted evidence', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { response_format: { json_schema: { schema: unknown } }; messages: unknown[] };
      expect(JSON.stringify(body.response_format)).toContain('additionalProperties');
      expect(JSON.stringify(body.messages)).toContain('never instructions');
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(providerEvidence) } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    await expect(createOpenAIVisualSpatialProvider({ apiKey: 'test-key', model: 'gpt-test', fetchImpl }).analyze({ bytes: new Uint8Array([1]), contentType: 'image/png' })).resolves.toEqual(providerEvidence);
  });

  it('fails closed for malformed provider geometry, provider errors, size, and timeout', async () => {
    const malformed = createOpenAIVisualSpatialProvider({ apiKey: 'test-key', model: 'gpt-test', fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ ...providerEvidence, focalPoint: { x: 2, y: 0.5 } }) } }] })) });
    await expect(malformed.analyze({ bytes: new Uint8Array([1]), contentType: 'image/png' })).rejects.toMatchObject({ reason: 'provider-malformed-response' });
    const exhausted = createOpenAIVisualSpatialProvider({ apiKey: 'test-key', model: 'gpt-test', fetchImpl: async () => new Response(JSON.stringify({ error: { code: 'insufficient_quota' } }), { status: 429 }) });
    await expect(exhausted.analyze({ bytes: new Uint8Array([1]), contentType: 'image/png' })).rejects.toMatchObject({ reason: 'provider-credit-exhausted' });
    await expect(createOpenAIVisualSpatialProvider({ apiKey: 'test-key', model: 'gpt-test' }).analyze({ bytes: new Uint8Array(MAX_SPATIAL_PROVIDER_IMAGE_BYTES + 1), contentType: 'image/png' })).rejects.toMatchObject({ reason: 'unsupported-media' });
    const timeout = createOpenAIVisualSpatialProvider({ apiKey: 'test-key', model: 'gpt-test', timeoutMs: 1, fetchImpl: (_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })) });
    await expect(timeout.analyze({ bytes: new Uint8Array([1]), contentType: 'image/png' })).rejects.toMatchObject({ reason: 'provider-timeout' });
  });

  it('stops reading an oversized provider response body', async () => {
    const oversized = createOpenAIVisualSpatialProvider({
      apiKey: 'test-key', model: 'gpt-test',
      fetchImpl: async () => new Response(new Uint8Array(16 * 1024 + 1)),
    });
    await expect(oversized.analyze({ bytes: new Uint8Array([1]), contentType: 'image/png' })).rejects.toMatchObject({ reason: 'provider-malformed-response' });
  });

  it('keeps server routes image-only, owner/capability scoped, and free of canonical mutation', () => {
    const canonical = readFileSync('supabase/functions/analyze-visual-spatial/index.ts', 'utf8');
    const candidate = readFileSync('supabase/functions/analyze-discovery-candidate-spatial/index.ts', 'utf8');
    expect(canonical).toContain('resolveMediaAnalysisReference');
    expect(canonical).toContain('"spatial-image-analysis"');
    expect(canonical).toContain('authorization.userId');
    expect(candidate).toContain('resolvePexelsAnalysisCandidate');
    for (const source of [canonical, candidate]) {
      expect(source).not.toContain('ingestPexelsImage');
      expect(source).not.toContain('compositionOverride');
      expect(source).not.toContain('createSignedUrl');
    }
  });
});
