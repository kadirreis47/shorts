import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { issueMediaAnalysisReference } from '../../supabase/functions/_shared/media-analysis-reference-gateway';
import {
  installResolveImageDisplayGeometryProductionRuntime,
  productionHandleRequest,
} from '../../supabase/functions/resolve-image-display-geometry/entry';

const owner = '00000000-0000-4000-8000-000000000001';
const otherOwner = '00000000-0000-4000-8000-000000000009';
const objectPath = `${owner}/generated-images/00000000-0000-4000-8000-000000000002.png`;
const bytes = png(3, 2);
const now = 1_800_000_000_000;
const evidence = { id: '00000000-0000-4000-8000-000000000003', version: 'version-1', etag: 'etag-1', updatedAt: '2026-09-04T00:00:00.000Z', size: bytes.byteLength, contentType: 'image/png' } as const;
const secret = `omr-secret-v1.${Buffer.from(Uint8Array.from({ length: 32 }, (_, index) => index + 1)).toString('base64url')}`;

afterEach(() => vi.unstubAllGlobals());

describe('actual resolve-image-display-geometry endpoint entry', () => {
  it('serves the exact exported singleton that behavioral tests invoke', () => {
    const source = readFileSync('supabase/functions/resolve-image-display-geometry/index.ts', 'utf8');
    expect(source).toContain('installResolveImageDisplayGeometryProductionRuntime({');
    expect(source).toContain('createClient: (url, key, options) => createClient(url, key, options) as never');
    expect(source).toContain('Deno.serve(productionHandleRequest)');
  });

  it.each([[null, null], ['Bearer invalid', 401]])('rejects missing or invalid authorization before quota and storage', async (authorization, authStatus) => {
    const h = install({ authStatus });
    const response = await productionHandleRequest(request({ reference: opaqueReference() }, authorization));
    expect(response.status).toBe(401);
    expect(h.quota).not.toHaveBeenCalled();
    expect(h.info).not.toHaveBeenCalled();
  });

  it('enforces production quota before body parsing and storage', async () => {
    const h = install({ quotaAllowed: false });
    const response = await productionHandleRequest(request({ reference: opaqueReference() }));
    expect(response.status).toBe(429);
    expect(h.quota).toHaveBeenCalledWith('consume_edge_function_quota', expect.objectContaining({
      p_user_id: owner, p_function_name: 'resolve-image-display-geometry', p_burst_max_requests: 12, p_daily_max_requests: 120,
    }));
    expect(h.info).not.toHaveBeenCalled();
  });

  it.each([['{bad-json', 400], [JSON.stringify({ reference: opaqueReference(), padding: 'x'.repeat(5_000) }), 413]])('uses the production bounded body reader', async (body, status) => {
    const h = install();
    const response = await productionHandleRequest(new Request('https://edge.test/resolve-image-display-geometry', { method: 'POST', headers: { authorization: 'Bearer valid-token' }, body }));
    expect(response.status).toBe(status);
    expect(h.info).not.toHaveBeenCalled();
  });

  it('distinguishes request-body stream failure from storage response stream failure', async () => {
    const requestBody = new ReadableStream<Uint8Array>({ start(controller) { controller.error(new Error('request failed')); } });
    install();
    const requestFailure = await productionHandleRequest(new Request('https://edge.test/resolve-image-display-geometry', {
      method: 'POST', headers: { authorization: 'Bearer valid-token', 'content-type': 'application/json' }, body: requestBody, duplex: 'half',
    } as RequestInit & { duplex: 'half' }));
    expect(requestFailure.status).toBe(400);

    const reference = (await issue('image-display-geometry', owner, objectPath)).reference;
    install();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.error(new Error('storage failed')); } }), { headers: storageHeaders() })));
    const storageFailure = await productionHandleRequest(request({ reference }));
    expect(storageFailure.status).toBe(503);
  });

  it('rejects wrong-owner, semantic, spatial, and expired capabilities', async () => {
    vi.stubGlobal('fetch', storageFetch(bytes));
    const semantic = await issue('semantic-image-analysis', owner, objectPath);
    const spatial = await issue('spatial-image-analysis', owner, objectPath);
    const foreignPath = `${otherOwner}/generated-images/00000000-0000-4000-8000-000000000002.png`;
    const foreign = await issue('image-display-geometry', otherOwner, foreignPath);
    const expired = await issue('image-display-geometry', owner, objectPath);
    for (const candidate of [semantic.reference, spatial.reference, foreign.reference]) {
      install();
      expect((await productionHandleRequest(request({ reference: candidate }))).status).toBe(403);
    }
    install({ currentTime: now + 301_000 });
    expect((await productionHandleRequest(request({ reference: expired.reference }))).status).toBe(403);
  });

  it('maps metadata races and bounded storage failures without returning geometry', async () => {
    const reference = (await issue('image-display-geometry', owner, objectPath)).reference;
    vi.stubGlobal('fetch', storageFetch(bytes));
    install({ evidenceSequence: [evidence, { ...evidence, etag: 'replaced' }] });
    expect((await productionHandleRequest(request({ reference }))).status).toBe(403);

    vi.stubGlobal('fetch', storageFetch(new Uint8Array(bytes.length + 1)));
    install();
    expect((await productionHandleRequest(request({ reference }))).status).toBe(413);
  });

  it('returns successful owner-bound exact-byte geometry through the singleton', async () => {
    const reference = (await issue('image-display-geometry', owner, objectPath)).reference;
    vi.stubGlobal('fetch', storageFetch(bytes));
    install();
    const response = await productionHandleRequest(request({ reference }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      version: 1, mediaIdentity: `media:${objectPath}`, encodedDimensions: { width: 3, height: 2 }, displayDimensions: { width: 3, height: 2 },
      encodedToDisplay: 'identity', contentDigest: expect.stringMatching(/^[0-9a-f]{64}$/u),
    });
  });
});

function install({ authStatus = null as number | null, quotaAllowed = true, evidenceSequence = [evidence] as readonly Record<string, unknown>[], currentTime = now + 1_000 } = {}) {
  let metadataCall = 0;
  const quota = vi.fn(async () => ({ data: quotaAllowed, error: null }));
  const info = vi.fn(async () => ({ data: evidenceSequence[Math.min(metadataCall++, evidenceSequence.length - 1)], error: null }));
  const env = new Map([['SUPABASE_URL', 'https://edge-entry.supabase.co'], ['SUPABASE_ANON_KEY', 'anon'], ['SUPABASE_SERVICE_ROLE_KEY', 'service-role'], ['MEDIA_ANALYSIS_REFERENCE_SECRET', secret]]);
  const client = { auth: { getUser: vi.fn(async () => authStatus ? { data: { user: null }, error: { status: authStatus } } : { data: { user: { id: owner } }, error: null }) }, rpc: quota, storage: { from: () => ({ info }) } };
  installResolveImageDisplayGeometryProductionRuntime({
    deno: { env: { get: (name: string) => env.get(name) } }, createClient: () => client as never, console: { error: vi.fn() }, now: () => currentTime,
  });
  return { quota, info };
}

function request(body: unknown, authorization: string | null = 'Bearer valid-token') {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (authorization) headers.set('authorization', authorization);
  return new Request('https://edge.test/resolve-image-display-geometry', { method: 'POST', headers, body: JSON.stringify(body) });
}
function opaqueReference() { return `omr1.${'a'.repeat(16)}.${'b'.repeat(48)}`; }
function storageHeaders() { return { 'content-type': 'image/png', 'content-length': String(bytes.length) }; }
function storageFetch(value: Uint8Array) { return vi.fn(async () => new Response(value, { headers: { 'content-type': 'image/png', 'content-length': String(value.length) } })); }
async function issue(scope: 'semantic-image-analysis' | 'spatial-image-analysis' | 'image-display-geometry', userId: string, path: string) { return issueMediaAnalysisReference(metadataService([evidence]), userId, { media: { bucket: 'media', objectPath: path }, scope }, secret, now); }
function metadataService(sequence: readonly Record<string, unknown>[]) { let call = 0; return { storage: { from: () => ({ info: async () => ({ data: sequence[Math.min(call++, sequence.length - 1)], error: null }) }) } } as never; }
function png(width: number, height: number): Uint8Array { const result = new Uint8Array(58); result.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]); set32(result, 16, width); set32(result, 20, height); result.set([8, 2, 0, 0, 0], 24); set32(result, 29, crc32(result.slice(12, 29))); result.set([0, 0, 0, 1, 0x49, 0x44, 0x41, 0x54, 0], 33); set32(result, 42, crc32(result.slice(37, 42))); result.set([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82], 46); return result; }
function set32(value: Uint8Array, offset: number, item: number): void { value[offset] = item >>> 24; value[offset + 1] = item >>> 16; value[offset + 2] = item >>> 8; value[offset + 3] = item; }
function crc32(value: Uint8Array): number { let crc = 0xffffffff; for (const byte of value) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ 0xffffffff) >>> 0; }
