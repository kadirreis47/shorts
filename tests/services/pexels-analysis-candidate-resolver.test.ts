import { describe, expect, it, vi } from 'vitest';
import { MAX_SEMANTIC_PROVIDER_IMAGE_BYTES } from '../../supabase/functions/_shared/openai-visual-semantic-provider';
import { PexelsAnalysisCandidateError, resolvePexelsAnalysisCandidate } from '../../supabase/functions/_shared/pexels-analysis-candidate';

const mediaUrl = 'https://images.pexels.com/photos/42/large.jpeg';
const metadata = (id: number, url = mediaUrl) => JSON.stringify({ id, src: { original: mediaUrl, large2x: url }, ignored: 'not propagated' });

describe('Pexels analysis candidate resolver', () => {
  it('binds the API response to the requested asset and keeps credentials off media fetches', async () => {
    const calls: Array<[string, RequestInit | undefined]> = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push([String(url), init]);
      return calls.length === 1
        ? new Response(metadata(42), { headers: { 'content-type': 'application/json' } })
        : new Response(png(10, 10), { headers: { 'content-type': 'image/png' } });
    }) as unknown as typeof fetch;
    const result = await resolvePexelsAnalysisCandidate(42, 'server-secret', fetchImpl);
    expect(result.contentType).toBe('image/png');
    expect(result).toMatchObject({ width: 10, height: 10 });
    expect(calls[0][0]).toBe('https://api.pexels.com/v1/photos/42');
    expect((calls[0][1]?.headers as Record<string, string>).Authorization).toBe('server-secret');
    expect(calls[1][1]?.headers).toBeUndefined();
  });

  it('rejects malformed, oversized, and identity-mismatched metadata before media fetch', async () => {
    for (const response of [
      new Response('{bad'),
      new Response(metadata(43)),
      new Response(metadata(42), { headers: { 'content-length': String(64 * 1024 + 1) } }),
    ]) {
      const fetchImpl = vi.fn(async () => response) as unknown as typeof fetch;
      await expect(resolvePexelsAnalysisCandidate(42, 'key', fetchImpl)).rejects.toBeInstanceOf(PexelsAnalysisCandidateError);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });

  it('revalidates redirects, caps loops, and never forwards API credentials', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url).startsWith('https://api.pexels.com/')) return new Response(metadata(42));
      return new Response(null, { status: 302, headers: { location: 'https://images.pexels.com/loop' } });
    }) as unknown as typeof fetch;
    await expect(resolvePexelsAnalysisCandidate(42, 'key', fetchImpl)).rejects.toMatchObject({ reason: 'candidate-media-unavailable' });
    expect(fetchImpl).toHaveBeenCalledTimes(5);

    const attacker = vi.fn(async (url: string | URL | Request) => String(url).startsWith('https://api.pexels.com/') ? new Response(metadata(42)) : new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/private' } })) as unknown as typeof fetch;
    await expect(resolvePexelsAnalysisCandidate(42, 'key', attacker)).rejects.toMatchObject({ reason: 'candidate-media-unavailable' });
    expect(attacker).toHaveBeenCalledTimes(2);
  });

  it('stops unknown-length or lying-length streams at the application byte cap', async () => {
    for (const headers of [undefined, { 'content-length': '1' }]) {
      const oversized = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(MAX_SEMANTIC_PROVIDER_IMAGE_BYTES)); controller.enqueue(new Uint8Array(1)); controller.close(); } });
      const fetchImpl = vi.fn(async (url: string | URL | Request) => String(url).startsWith('https://api.pexels.com/') ? new Response(metadata(42)) : new Response(oversized, { headers })) as unknown as typeof fetch;
      await expect(resolvePexelsAnalysisCandidate(42, 'key', fetchImpl)).rejects.toMatchObject({ reason: 'candidate-media-too-large' });
    }
  });

  it('rejects MIME/signature mismatch after bounded download', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => String(url).startsWith('https://api.pexels.com/') ? new Response(metadata(42)) : new Response(png(10, 10), { headers: { 'content-type': 'image/jpeg' } })) as unknown as typeof fetch;
    await expect(resolvePexelsAnalysisCandidate(42, 'key', fetchImpl)).rejects.toMatchObject({ reason: 'unsupported-media' });
  });

  it('aborts stalled metadata and media network stages without retry', async () => {
    const stalled = (signal?: AbortSignal) => new Promise<Response>((_resolve, reject) => signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
    const metadataFetch = vi.fn((_url: string | URL | Request, init?: RequestInit) => stalled(init?.signal ?? undefined)) as unknown as typeof fetch;
    await expect(resolvePexelsAnalysisCandidate(42, 'key', metadataFetch, 1)).rejects.toMatchObject({ reason: 'candidate-provider-unavailable' });
    expect(metadataFetch).toHaveBeenCalledTimes(1);

    const mediaFetch = vi.fn((url: string | URL | Request, init?: RequestInit) => String(url).startsWith('https://api.pexels.com/') ? Promise.resolve(new Response(metadata(42))) : stalled(init?.signal ?? undefined)) as unknown as typeof fetch;
    await expect(resolvePexelsAnalysisCandidate(42, 'key', mediaFetch, 1)).rejects.toMatchObject({ reason: 'candidate-media-unavailable' });
    expect(mediaFetch).toHaveBeenCalledTimes(2);
  });
});

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(58); bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  set32(bytes, 16, width); set32(bytes, 20, height); bytes.set([8, 2, 0, 0, 0], 24); set32(bytes, 29, crc32(bytes.slice(12, 29))); bytes.set([0, 0, 0, 1, 0x49, 0x44, 0x41, 0x54, 0], 33); set32(bytes, 42, crc32(bytes.slice(37, 42))); bytes.set([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82], 46); return bytes;
}
function set32(bytes: Uint8Array, offset: number, value: number): void { bytes[offset] = value >>> 24; bytes[offset + 1] = value >>> 16; bytes[offset + 2] = value >>> 8; bytes[offset + 3] = value; }
function crc32(bytes: Uint8Array): number { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ 0xffffffff) >>> 0; }
