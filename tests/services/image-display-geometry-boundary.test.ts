import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setValidatedOwnerId } from '@/auth/identity';

const post = vi.fn();
const resolveImageDisplayGeometry = vi.fn();
vi.mock('@/lib/api/client', () => ({ apiClient: { post } }));
vi.mock('@/auth/session', () => ({ getAuthenticatedSession: () => ({ access_token: 'test-access-token-that-is-long-enough' }) }));

const owner = '00000000-0000-4000-8000-000000000001';
const media = { bucket: 'media', objectPath: `${owner}/generated-images/00000000-0000-4000-8000-000000000002.jpg` } as const;
const reference = `omr1.${'a'.repeat(16)}.${'b'.repeat(48)}`;
const now = Date.now();
const referenceResponse = { reference, issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + 300_000).toISOString(), scope: 'image-display-geometry', mediaType: 'image' } as const;
const geometry = { version: 1, mediaIdentity: `media:${media.objectPath}`, encodedDimensions: { width: 1200, height: 800 }, displayDimensions: { width: 800, height: 1200 }, encodedToDisplay: 'rotate-90-cw' } as const;
const trustedGeometry = { ...geometry, contentDigest: 'a'.repeat(64), executionAuthority: { version: 1, reference: `idga1_${'A'.repeat(43)}`, expiresAt: '2099-01-01T00:00:00.000Z' } } as const;

describe('owned image display geometry boundary', () => {
  beforeEach(() => {
    post.mockReset(); resolveImageDisplayGeometry.mockReset(); setValidatedOwnerId(owner);
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { electronAPI: { ffmpeg: { resolveImageDisplayGeometry } } } });
  });

  it('uses one distinct capability and strictly validates the media-bound response', async () => {
    const { resolveOwnedImageDisplayGeometry } = await import('@/lib/api');
    resolveImageDisplayGeometry.mockResolvedValueOnce(trustedGeometry);
    await expect(resolveOwnedImageDisplayGeometry(media)).resolves.toEqual(trustedGeometry);
    expect(resolveImageDisplayGeometry).toHaveBeenCalledWith('test-access-token-that-is-long-enough', media);
    resolveImageDisplayGeometry.mockResolvedValueOnce({ ...trustedGeometry, mediaIdentity: geometry.mediaIdentity.replace('.jpg', '.png') });
    await expect(resolveOwnedImageDisplayGeometry(media)).rejects.toThrow(/invalid/u);
  });

  it('keeps storage and parsing authority inside the protected Edge boundary', () => {
    const edge = readFileSync('supabase/functions/resolve-image-display-geometry/index.ts', 'utf8');
    const entry = readFileSync('supabase/functions/resolve-image-display-geometry/entry.ts', 'utf8');
    const handler = readFileSync('supabase/functions/_shared/resolve-image-display-geometry-handler.ts', 'utf8');
    expect(edge).toContain('installResolveImageDisplayGeometryProductionRuntime({');
    expect(edge).toContain('Deno.serve(productionHandleRequest)');
    expect(entry).toContain('createProtectedFunctionAuthorizer({');
    expect(entry).toContain('createBoundedJsonReader(respond)');
    expect(entry).toContain('"image-display-geometry"');
    expect(entry).toContain('resolveMediaAnalysisReference');
    expect(edge).not.toMatch(/provider|previewUrl|sceneId|focalPoint|crop/iu);
    expect(handler).toContain("dependencies.authorize(req, 'resolve-image-display-geometry')");
    expect(handler.indexOf('dependencies.authorize')).toBeLessThan(handler.indexOf('dependencies.readJson'));
  });

  it('derives geometry only after Pexels promotion and generated-image ingestion return owned media', async () => {
    const { generateAIImage, ingestPexelsImage } = await import('@/lib/api');
    const provenance = {
      provider: 'pexels', providerMediaId: 42,
      originalSourceUrl: 'https://images.pexels.com/photos/42/original.jpg',
      providerPageUrl: 'https://www.pexels.com/photo/42/', query: 'subject',
    } as const;
    post
      .mockResolvedValueOnce({ media, previewUrl: 'https://signed.example/private.jpg', provenance });
    resolveImageDisplayGeometry.mockResolvedValue(trustedGeometry);
    await expect(ingestPexelsImage(42, 'subject')).resolves.toMatchObject({ media, imageDisplayGeometry: trustedGeometry });
    expect(post).toHaveBeenNthCalledWith(1, 'ingest-pexels-image', { mediaId: 42, query: 'subject' }, { retryCount: 0, timeoutMs: 60_000 });
    expect(post.mock.calls.slice(1).map((call) => call[0])).toEqual([]);

    post.mockReset();
    post
      .mockResolvedValueOnce({ imageUrl: 'https://signed.example/generated.jpg', media });
    await expect(generateAIImage({ prompt: 'subject', mode: 'ai_realistic' })).resolves.toMatchObject({ media, imageDisplayGeometry: trustedGeometry });
    expect(post.mock.calls.map((call) => call[0])).toEqual(['generate-image']);
  });
});
