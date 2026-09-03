import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createOpenAIVisualSemanticProvider, MAX_SEMANTIC_PROVIDER_IMAGE_BYTES, VisualSemanticProviderError } from '../../supabase/functions/_shared/openai-visual-semantic-provider';
import { normalizeVisualSemanticAnalysisRequest, normalizeVisualSemanticAnalysisResponse, normalizeVisualSemanticObservations } from '../../supabase/functions/_shared/visual-semantic-analysis';
import { visualBriefFingerprint } from '../../supabase/functions/_shared/visual-intelligence';

const brief = {
  version: 1, sceneBinding: { sceneId: 'visual-scene-11111111-1111-4111-8111-111111111111', sceneIndex: 0, sceneTextFingerprint: 'scene-text-v1-1234567812345678' },
  subject: 'industrial control room', setting: 'interior', mood: 'tense', editorialRole: 'evidence', preferredMedia: 'image', visualStyleHints: [], visualExclusions: [], noveltyConstraints: [], sourceIntent: { allowedSourceKinds: ['manual'], commerciallyUsableSourceRequired: false, attributionPreference: 'no-preference' },
} as const;
const request = { reference: `omr1.${'a'.repeat(16)}.${'b'.repeat(48)}`, requestId: 'semantic-request-123', intent: { brief, briefFingerprint: visualBriefFingerprint(brief), dimensions: ['subject', 'setting', 'mood'] } } as const;
const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

describe('real visual semantic analysis boundary', () => {
  it('requires an opaque reference and exact bounded brief intent, never a URL or path', () => {
    const normalized = normalizeVisualSemanticAnalysisRequest(request);
    expect(normalized.reference).toMatch(/^omr1\./u);
    expect(() => normalizeVisualSemanticAnalysisRequest({ ...request, reference: 'https://provider.example/preview.jpg' })).toThrow();
    expect(() => normalizeVisualSemanticAnalysisRequest({ ...request, objectPath: 'owner/generated-images/image.png' })).toThrow();
    expect(() => normalizeVisualSemanticAnalysisRequest({ ...request, intent: { ...request.intent, dimensions: ['subject', 'unknown'] } })).toThrow();
  });

  it('strictly admits only bounded structured pixel observations', () => {
    const observations = normalizeVisualSemanticObservations({ observations: [{ dimension: 'subject', evidence: 'supports-intent', confidenceBand: 'medium', facts: ['Analog control panels are visible'] }] }, ['subject']);
    expect(observations).toHaveLength(1);
    expect(() => normalizeVisualSemanticObservations({ observations: [{ dimension: 'subject', evidence: 'unknown', confidenceBand: 'high', facts: [] }] }, ['subject'])).toThrow();
    expect(() => normalizeVisualSemanticObservations({ observations: [{ dimension: 'subject', evidence: 'supports-intent', confidenceBand: 'high', facts: ['x'.repeat(121)] }] }, ['subject'])).toThrow();
    expect(() => normalizeVisualSemanticObservations({ observations: [{ dimension: 'subject', evidence: 'supports-intent', confidenceBand: 'high', facts: [] }] }, ['subject', 'setting'])).toThrow();
    expect(() => normalizeVisualSemanticObservations({ observations: [{ dimension: 'subject', evidence: 'supports-intent', confidenceBand: 'high', facts: [] }, { dimension: 'subject', evidence: 'uncertain', confidenceBand: 'low', facts: [] }] }, ['subject', 'setting'])).toThrow();
    expect(() => normalizeVisualSemanticAnalysisResponse({ status: 'evaluated', contractVersion: 'visual-semantic-v1', observations: [{ dimension: 'subject', evidence: 'supports-intent', confidenceBand: 'high', facts: [], raw: 'ignore' }] })).toThrow();
  });

  it('uses exactly one inline-image provider request and returns no provider prose', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ observations: [{ dimension: 'subject', evidence: 'supports-intent', confidenceBand: 'high', facts: ['Control panels are visible'] }] }) } }] }), { status: 200 }));
    const provider = createOpenAIVisualSemanticProvider({ apiKey: 'test-key', model: 'server-model', fetchImpl: fetchImpl as unknown as typeof fetch });
    const result = await provider.analyze({ bytes, contentType: 'image/jpeg', intent: { ...request.intent, dimensions: ['subject'] } });
    expect(result).toEqual([{ dimension: 'subject', evidence: 'supports-intent', confidenceBand: 'high', facts: ['Control panels are visible'] }]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const called = fetchImpl.mock.calls[0] as unknown as [unknown, RequestInit];
    const payload = JSON.parse(String(called[1].body));
    expect(payload.max_tokens).toBe(600);
    expect(payload.messages[1].content[1].image_url.url).toMatch(/^data:image\/jpeg;base64,/u);
    expect(JSON.stringify(result)).not.toContain('choices');
    expect(payload.messages[0].content).toMatch(/untrusted evidence/u);
    expect(payload.messages[1].content[0].text).toMatch(/never as an instruction/u);
  });

  it('truthfully classifies credit exhaustion, rate limits, malformed output, timeout, and missing configuration', async () => {
    const failure = async (status: number, code: string) => createOpenAIVisualSemanticProvider({ apiKey: 'test-key', model: 'server-model', fetchImpl: async () => new Response(JSON.stringify({ error: { code } }), { status }) }).analyze({ bytes, contentType: 'image/jpeg', intent: { ...request.intent, dimensions: ['subject'] } });
    await expect(failure(429, 'insufficient_quota')).rejects.toMatchObject({ reason: 'provider-credit-exhausted' });
    await expect(failure(429, 'rate_limit_exceeded')).rejects.toMatchObject({ reason: 'provider-rate-limited' });
    await expect(failure(429, 'unknown_429')).rejects.toMatchObject({ reason: 'provider-rate-limited' });
    await expect(failure(401, 'invalid_api_key')).rejects.toMatchObject({ reason: 'provider-unavailable' });
    await expect(failure(403, 'forbidden')).rejects.toMatchObject({ reason: 'provider-unavailable' });
    await expect(failure(503, 'server_error')).rejects.toMatchObject({ reason: 'provider-unavailable' });
    await expect(createOpenAIVisualSemanticProvider({ apiKey: 'test-key', model: 'server-model', fetchImpl: async () => { throw new Error('network'); } }).analyze({ bytes, contentType: 'image/jpeg', intent: { ...request.intent, dimensions: ['subject'] } })).rejects.toMatchObject({ reason: 'provider-unavailable' });
    await expect(createOpenAIVisualSemanticProvider({ apiKey: 'test-key', model: 'server-model', fetchImpl: async () => new Response('{bad', { status: 200 }) }).analyze({ bytes, contentType: 'image/jpeg', intent: { ...request.intent, dimensions: ['subject'] } })).rejects.toMatchObject({ reason: 'provider-malformed-response' });
    for (const content of ['', '```json\n{}\n```', JSON.stringify({ observations: [] }), JSON.stringify({ observations: [{ dimension: 'subject', evidence: 'supports-intent', confidenceBand: 'high', facts: [] }, { dimension: 'subject', evidence: 'supports-intent', confidenceBand: 'high', facts: [] }] })]) {
      await expect(createOpenAIVisualSemanticProvider({ apiKey: 'test-key', model: 'server-model', fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 }) }).analyze({ bytes, contentType: 'image/jpeg', intent: { ...request.intent, dimensions: ['subject'] } })).rejects.toMatchObject({ reason: 'provider-malformed-response' });
    }
    await expect(createOpenAIVisualSemanticProvider({ apiKey: 'test-key', model: 'server-model', fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { refusal: 'cannot analyze' } }] }), { status: 200 }) }).analyze({ bytes, contentType: 'image/jpeg', intent: { ...request.intent, dimensions: ['subject'] } })).rejects.toMatchObject({ reason: 'provider-malformed-response' });
    await expect(createOpenAIVisualSemanticProvider({ apiKey: 'test-key', model: 'server-model', fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: ['{}', '{}'] } }] }), { status: 200 }) }).analyze({ bytes, contentType: 'image/jpeg', intent: { ...request.intent, dimensions: ['subject'] } })).rejects.toMatchObject({ reason: 'provider-malformed-response' });
    const delayedFetch = ((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))))) as unknown as typeof fetch;
    const timeout = createOpenAIVisualSemanticProvider({ apiKey: 'test-key', model: 'server-model', timeoutMs: 1, fetchImpl: delayedFetch });
    await expect(timeout.analyze({ bytes, contentType: 'image/jpeg', intent: { ...request.intent, dimensions: ['subject'] } })).rejects.toMatchObject({ reason: 'provider-timeout' });
    const noFetch = vi.fn();
    await expect(createOpenAIVisualSemanticProvider({ apiKey: 'test-key', model: 'server-model', fetchImpl: noFetch as unknown as typeof fetch }).analyze({ bytes: new Uint8Array(MAX_SEMANTIC_PROVIDER_IMAGE_BYTES + 1), contentType: 'image/jpeg', intent: { ...request.intent, dimensions: ['subject'] } })).rejects.toMatchObject({ reason: 'unsupported-media' });
    expect(noFetch).not.toHaveBeenCalled();
    expect(() => createOpenAIVisualSemanticProvider({ apiKey: '', model: 'server-model' })).toThrow(VisualSemanticProviderError);
  });

  it('keeps resolution, keys, bytes, and diagnostics server-only', () => {
    const edge = readFileSync('supabase/functions/analyze-visual-semantics/index.ts', 'utf8');
    const adapter = readFileSync('supabase/functions/_shared/openai-visual-semantic-provider.ts', 'utf8');
    expect(edge).toContain('await authorizeProtectedFunction(req, "analyze-visual-semantics")');
    expect(edge).toContain('resolveMediaAnalysisReference');
    expect(edge).not.toContain('createSignedUrl');
    expect(edge).not.toContain('objectPath');
    expect(edge).not.toMatch(/diagnostic\([^\n]*authorization\.userId/u);
    expect(adapter).toContain('data:${request.contentType};base64');
    expect(edge).toContain('MAX_SEMANTIC_PROVIDER_IMAGE_BYTES');
    expect(MAX_SEMANTIC_PROVIDER_IMAGE_BYTES).toBeLessThan(10 * 1024 * 1024);
    expect(adapter).not.toContain('console.');
  });
});
