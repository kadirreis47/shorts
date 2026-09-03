import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { normalizeOpaqueMediaReferenceRequest, normalizeOpaqueMediaReferenceResponse } from '@/core/visual-intelligence';

const post = vi.fn();
vi.mock('@/lib/api/client', () => ({ apiClient: { post } }));

const now = Date.now();
const response = {
  reference: `omr1.${'a'.repeat(16)}.${'b'.repeat(48)}`,
  issuedAt: new Date(now).toISOString(),
  expiresAt: new Date(now + 300_000).toISOString(),
  scope: 'semantic-image-analysis', mediaType: 'image',
} as const;
const gateway = readFileSync('supabase/functions/_shared/media-analysis-reference-gateway.ts', 'utf8');
const boundedRead = readFileSync('supabase/functions/_shared/bounded-storage-read.ts', 'utf8');
const cryptoSource = readFileSync('supabase/functions/_shared/media-analysis-reference-crypto.ts', 'utf8');
const edge = readFileSync('supabase/functions/media-analysis-reference/index.ts', 'utf8');

describe('opaque media analysis reference gateway', () => {
  it('accepts only a narrow owner-derived durable image identity and rejects URL-bearing shapes before a fetch', () => {
    expect(normalizeOpaqueMediaReferenceRequest({ media: { bucket: 'media', objectPath: '00000000-0000-4000-8000-000000000001/generated-images/00000000-0000-4000-8000-000000000002.png' } })).toMatchObject({ scope: 'semantic-image-analysis' });
    expect(normalizeOpaqueMediaReferenceRequest({ media: { bucket: 'media', objectPath: '00000000-0000-4000-8000-000000000001/generated-images/00000000-0000-4000-8000-000000000002.png' }, scope: 'semantic-image-analysis' })).toBeTruthy();
    for (const objectPath of ['https://example.test/image.png', 'file:///tmp/a.png', 'http://127.0.0.1/a.png', 'http://[::1]/a.png', 'http://169.254.169.254/latest', 'owner/../secret.png', 'owner/./secret.png', 'owner//generated-images/id.png', 'owner\\generated-images\\id.png', 'owner/%2e%2e/secret.png', 'owner/%2Fsecret.png', 'owner/generated-images/id.PNG', 'owner/generated-images/id.png.exe', 'owner/generated-images/id.png\0', 'owner/videos/a.mp4']) {
      expect(() => normalizeOpaqueMediaReferenceRequest({ media: { bucket: 'media', objectPath }, scope: 'semantic-image-analysis' })).toThrow();
    }
    expect(() => normalizeOpaqueMediaReferenceRequest({ media: { bucket: 'media', objectPath: '00000000-0000-4000-8000-000000000001/generated-images/a.png' }, scope: 'semantic-image-analysis', url: 'https://evil.test' })).toThrow();
    for (const field of ['url', 'href', 'src', 'path', 'hostname', 'downloadUrl', 'signedUrl']) {
      expect(() => normalizeOpaqueMediaReferenceRequest({ media: { bucket: 'media', objectPath: '00000000-0000-4000-8000-000000000001/generated-images/00000000-0000-4000-8000-000000000002.png' }, scope: 'semantic-image-analysis', [field]: 'https://evil.test' })).toThrow();
    }
    expect(() => normalizeOpaqueMediaReferenceRequest({ media: { bucket: 'media', objectPath: '00000000-0000-4000-8000-000000000001/generated-images/00000000-0000-4000-8000-000000000002.png' }, scope: 'unknown' })).toThrow();
  });

  it('strictly validates short-lived opaque client responses and never accepts authority fields', () => {
    expect(normalizeOpaqueMediaReferenceResponse(response, now)).toEqual(response);
    expect(normalizeOpaqueMediaReferenceResponse(response, 'semantic-image-analysis', now)).toEqual(response);
    expect(() => normalizeOpaqueMediaReferenceResponse({ ...response, expiresAt: new Date(now + 3600_000).toISOString() }, 'semantic-image-analysis', now)).toThrow();
    expect(() => normalizeOpaqueMediaReferenceResponse({ ...response, expiresAt: new Date(now - 1).toISOString() }, 'semantic-image-analysis', now)).toThrow();
    expect(() => normalizeOpaqueMediaReferenceResponse({ ...response, issuedAt: new Date(now + 31_000).toISOString(), expiresAt: new Date(now + 300_000).toISOString() }, 'semantic-image-analysis', now)).toThrow();
    expect(() => normalizeOpaqueMediaReferenceResponse({ ...response, objectPath: 'owner/path' }, 'semantic-image-analysis', now)).toThrow();
    expect(() => normalizeOpaqueMediaReferenceResponse({ ...response, scope: 'visual-qa' }, 'semantic-image-analysis', now)).toThrow();
    expect(() => normalizeOpaqueMediaReferenceResponse({ ...response, scope: 'spatial-image-analysis' }, 'semantic-image-analysis', now)).toThrow();
  });

  it('uses the narrow issuance endpoint and rejects malformed response data', async () => {
    const { issueOpaqueMediaAnalysisReference } = await import('@/lib/api');
    post.mockResolvedValueOnce(response);
    await expect(issueOpaqueMediaAnalysisReference({ bucket: 'media', objectPath: '00000000-0000-4000-8000-000000000001/generated-images/00000000-0000-4000-8000-000000000002.png' })).resolves.toEqual(response);
    expect(post).toHaveBeenCalledWith('media-analysis-reference', expect.anything(), { retryCount: 0, timeoutMs: 15_000 });
    expect(post).toHaveBeenLastCalledWith('media-analysis-reference', expect.objectContaining({ scope: 'semantic-image-analysis' }), { retryCount: 0, timeoutMs: 15_000 });
    post.mockResolvedValueOnce({ ...response, mediaUrl: 'https://unsafe.test' });
    await expect(issueOpaqueMediaAnalysisReference({ bucket: 'media', objectPath: '00000000-0000-4000-8000-000000000001/generated-images/00000000-0000-4000-8000-000000000002.png' })).rejects.toThrow(/unsupported|invalid/i);
  });

  it('keeps resolution server-only, encrypted, bounded, owner-bound, and free of URL fetches', () => {
    expect(edge).toContain('await authorizeProtectedFunction(req, "media-analysis-reference")');
    expect(edge.indexOf('await authorizeProtectedFunction')).toBeLessThan(edge.indexOf('createClient(url, serviceRoleKey'));
    expect(edge).toContain('MEDIA_ANALYSIS_REFERENCE_SECRET');
    expect(edge).not.toContain('resolveMediaAnalysisReference');
    expect(edge).not.toContain('createSignedUrl');
    expect(edge).not.toContain('fetch(');
    expect(cryptoSource).toContain('AES-GCM');
    expect(cryptoSource).toContain('crypto.getRandomValues(new Uint8Array(12))');
    expect(gateway).toContain('capability.o !== userId');
    expect(gateway).toContain('capability.s !== requiredScope');
    expect(gateway).toContain('capability.exp <=');
    expect(gateway).toContain('capability.iat > nowSeconds + MEDIA_ANALYSIS_CLOCK_SKEW_SECONDS');
    expect(gateway).toContain('MAX_ANALYSIS_IMAGE_BYTES');
    expect(gateway).toContain('.info(path)');
    expect(gateway).toContain('expected.id !== actual.id');
    expect(gateway).toContain('expected.version !== actual.version');
    expect(gateway).toContain('expected.etag !== actual.etag');
    expect(gateway).toContain('expected.updatedAt !== actual.updatedAt');
    expect(gateway.match(/storedEvidence\(service, capability\.p\)/gu)).toHaveLength(2);
    expect(boundedRead).toContain('redirect: "error"');
    expect(boundedRead).toContain('total > expected.size || total > MAX_ANALYSIS_IMAGE_BYTES');
    expect(boundedRead).toContain('/storage/v1/object/media/${encodedPath}');
    expect(gateway).not.toContain('createSignedUrl');
    expect(gateway).not.toContain('console.');
    expect(edge).not.toContain('authorization.userId }');
    expect(edge).not.toContain('JSON.stringify(result)');
  });
});
