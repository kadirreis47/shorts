import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleResolveImageDisplayGeometryRequest } from '../../supabase/functions/_shared/resolve-image-display-geometry-handler';
import { issueMediaAnalysisReference, resolveMediaAnalysisReference, type ResolvedMediaAnalysisReference } from '../../supabase/functions/_shared/media-analysis-reference-gateway';

const owner = '00000000-0000-4000-8000-000000000001';
const reference = `omr1.${'a'.repeat(16)}.${'b'.repeat(48)}`;
const now = 1_800_000_000_000;
const path = `${owner}/generated-images/00000000-0000-4000-8000-000000000002.png`;
const bytes = png(3, 2);
const evidence = {
  id: '00000000-0000-4000-8000-000000000003', version: 'version-1', etag: 'etag-1',
  updatedAt: '2026-09-04T00:00:00.000Z', size: bytes.byteLength, contentType: 'image/png',
} as const;
const storageAuthority = { supabaseUrl: 'https://geometry-handler.supabase.co', serviceRoleKey: 'test-service-role' } as const;

afterEach(() => vi.unstubAllGlobals());

function request(body: unknown = { reference }) {
  return new Request('https://edge.test/resolve-image-display-geometry', {
    method: 'POST', headers: { authorization: 'Bearer token', 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

function dependencies(resolveReference = vi.fn(async () => resolved())) {
  return {
    authorize: vi.fn(async () => ({ ok: true as const, userId: owner })),
    resolveReference,
  };
}

describe('resolve image display geometry handler behavior', () => {
  it.each([
    [401, 'Unauthenticated'],
    [429, 'Quota exceeded'],
  ])('returns the authorization boundary response (%s) without storage resolution', async (status, message) => {
    const resolveReference = vi.fn();
    const response = await handleResolveImageDisplayGeometryRequest(request(), {
      authorize: vi.fn(async () => ({ ok: false as const, response: new Response(JSON.stringify({ error: message }), { status }) })),
      resolveReference,
    });
    expect(response.status).toBe(status);
    expect(resolveReference).not.toHaveBeenCalled();
  });

  it.each([
    [null, 400],
    [{}, 400],
    [{ reference: 'semantic-token' }, 400],
    [{ reference, extra: true }, 400],
  ])('rejects malformed or missing capabilities %#', async (body, status) => {
    const response = await handleResolveImageDisplayGeometryRequest(request(body), dependencies());
    expect(response.status).toBe(status);
  });

  it.each([
    ['scope-mismatch', 403],
    ['expired-reference', 403],
    ['invalid-reference', 403],
    ['media-not-found', 404],
    ['media-too-large', 413],
    ['resolution-failed', 503],
    ['unsupported-media-type', 503],
    ['temporarily-unavailable', 503],
  ] as const)('maps resolver failure %s without leaking authority', async (reason, status) => {
    const response = await handleResolveImageDisplayGeometryRequest(request(), dependencies(vi.fn(async () => { throw Object.assign(new Error(reason), { reason }); })));
    expect(response.status).toBe(status);
    const text = await response.text();
    expect(text).toContain('Image display geometry could not be resolved.');
    expect(text).not.toMatch(/service.role|secret|storage|objectPath|token/i);
  });

  it('passes authenticated owner plus capability to the resolver and returns bounded geometry only', async () => {
    const resolveReference = vi.fn(async () => resolved(7));
    const response = await handleResolveImageDisplayGeometryRequest(request(), dependencies(resolveReference));
    expect(response.status).toBe(200);
    expect(resolveReference).toHaveBeenCalledWith(owner, reference);
    await expect(response.json()).resolves.toEqual({
      version: 1,
      mediaIdentity: `media:${owner}/generated-images/00000000-0000-4000-8000-000000000002.jpg`,
      encodedDimensions: { width: 3, height: 2 },
      displayDimensions: { width: 2, height: 3 },
      encodedToDisplay: 'transverse',
      contentDigest: 'a'.repeat(64),
    });
  });

  it('handles OPTIONS and rejects non-POST methods before authorization', async () => {
    const deps = dependencies();
    expect((await handleResolveImageDisplayGeometryRequest(new Request('https://edge.test', { method: 'OPTIONS' }), deps)).status).toBe(200);
    expect((await handleResolveImageDisplayGeometryRequest(new Request('https://edge.test', { method: 'GET' }), deps)).status).toBe(405);
    expect(deps.authorize).not.toHaveBeenCalled();
  });

  it('behaviorally rejects semantic, spatial, expired, and cross-owner capabilities through the real resolver', async () => {
    const secret = encodedSecret();
    const geometry = await issue('image-display-geometry', owner, path, secret);
    const semantic = await issue('semantic-image-analysis', owner, path, secret);
    const spatial = await issue('spatial-image-analysis', owner, path, secret);
    const otherOwner = '00000000-0000-4000-8000-000000000009';
    const otherPath = `${otherOwner}/generated-images/00000000-0000-4000-8000-000000000002.png`;
    const foreign = await issue('image-display-geometry', otherOwner, otherPath, secret);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(bytes, { headers: { 'content-type': 'image/png', 'content-length': String(bytes.length) } })));
    for (const candidate of [semantic.reference, spatial.reference, foreign.reference]) {
      const response = await handleResolveImageDisplayGeometryRequest(request({ reference: candidate }), realDependencies(secret));
      expect(response.status).toBe(403);
    }
    const expired = await handleResolveImageDisplayGeometryRequest(request({ reference: geometry.reference }), realDependencies(secret, now + 301_000));
    expect(expired.status).toBe(403);
  });

  it('behaviorally maps metadata races, bounded reads, invalid signatures, and successful exact-byte geometry', async () => {
    const secret = encodedSecret();
    const geometry = await issue('image-display-geometry', owner, path, secret);

    vi.stubGlobal('fetch', vi.fn(async () => new Response(bytes, { headers: { 'content-type': 'image/png', 'content-length': String(bytes.length) } })));
    const raced = await handleResolveImageDisplayGeometryRequest(request({ reference: geometry.reference }), realDependencies(secret, now + 1_000, [evidence, { ...evidence, etag: 'replaced' }]));
    expect(raced.status).toBe(403);

    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(bytes.length + 1), { headers: { 'content-type': 'image/png', 'content-length': String(bytes.length + 1) } })));
    const oversized = await handleResolveImageDisplayGeometryRequest(request({ reference: geometry.reference }), realDependencies(secret));
    expect(oversized.status).toBe(413);

    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(bytes.length), { headers: { 'content-type': 'image/png', 'content-length': String(bytes.length) } })));
    const invalidSignature = await handleResolveImageDisplayGeometryRequest(request({ reference: geometry.reference }), realDependencies(secret));
    expect(invalidSignature.status).toBe(503);

    vi.stubGlobal('fetch', vi.fn(async () => new Response(bytes, { headers: { 'content-type': 'image/png', 'content-length': String(bytes.length) } })));
    const success = await handleResolveImageDisplayGeometryRequest(request({ reference: geometry.reference }), realDependencies(secret));
    expect(success.status).toBe(200);
    const body = await success.json();
    expect(body).toMatchObject({ mediaIdentity: `media:${path}`, encodedToDisplay: 'identity' });
    expect(body.contentDigest).toMatch(/^[0-9a-f]{64}$/u);
    expect(JSON.stringify(body)).not.toMatch(/service-role|objectPath|reference|secret|token/iu);
  });

  it('uses the real bounded JSON reader for malformed and oversized bodies', async () => {
    const deps = dependencies();
    const malformed = new Request('https://edge.test', { method: 'POST', body: '{bad-json' });
    expect((await handleResolveImageDisplayGeometryRequest(malformed, deps)).status).toBe(400);
    const oversized = new Request('https://edge.test', { method: 'POST', body: JSON.stringify({ reference, padding: 'x'.repeat(5_000) }) });
    expect((await handleResolveImageDisplayGeometryRequest(oversized, deps)).status).toBe(413);
  });
});

function resolved(exifOrientation = 1): ResolvedMediaAnalysisReference {
  return {
    mediaType: 'image',
    mediaIdentity: `media:${owner}/generated-images/00000000-0000-4000-8000-000000000002.jpg`,
    contentType: 'image/jpeg', bytes: new Uint8Array([0xff]), contentDigest: 'a'.repeat(64), width: 3, height: 2, exifOrientation,
  };
}

async function issue(scope: 'semantic-image-analysis' | 'spatial-image-analysis' | 'image-display-geometry', userId: string, objectPath: string, secret: string) {
  return issueMediaAnalysisReference(metadataService([evidence]), userId, { media: { bucket: 'media', objectPath }, scope }, secret, now);
}

function realDependencies(secret: string, resolveAt = now + 1_000, sequence: readonly Record<string, unknown>[] = [evidence]) {
  return {
    authorize: vi.fn(async () => ({ ok: true as const, userId: owner })),
    resolveReference: (userId: string, candidate: string) => resolveMediaAnalysisReference(
      metadataService(sequence), storageAuthority, userId, candidate, 'image-display-geometry', secret, resolveAt,
    ),
  };
}

function metadataService(sequence: readonly Record<string, unknown>[]) {
  let call = 0;
  return { storage: { from: () => ({ info: async () => ({ data: sequence[Math.min(call++, sequence.length - 1)], error: null }) }) } } as never;
}

function encodedSecret(): string {
  return `omr-secret-v1.${Buffer.from(Uint8Array.from({ length: 32 }, (_, index) => index + 1)).toString('base64url')}`;
}

function png(width: number, height: number): Uint8Array {
  const result = new Uint8Array(58); result.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  set32(result, 16, width); set32(result, 20, height); result.set([8, 2, 0, 0, 0], 24); set32(result, 29, crc32(result.slice(12, 29)));
  result.set([0, 0, 0, 1, 0x49, 0x44, 0x41, 0x54, 0], 33); set32(result, 42, crc32(result.slice(37, 42)));
  result.set([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82], 46); return result;
}
function set32(value: Uint8Array, offset: number, item: number): void { value[offset] = item >>> 24; value[offset + 1] = item >>> 16; value[offset + 2] = item >>> 8; value[offset + 3] = item; }
function crc32(value: Uint8Array): number { let crc = 0xffffffff; for (const byte of value) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ 0xffffffff) >>> 0; }
