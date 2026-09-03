import { afterEach, describe, expect, it, vi } from 'vitest';
import { readBoundedAnalysisObject, type BoundedStorageReadError } from '../../supabase/functions/_shared/bounded-storage-read';

const authority = { supabaseUrl: 'https://project-ref.supabase.co', serviceRoleKey: 'server-only-service-role-key' } as const;
const ownerId = '00000000-0000-4000-8000-000000000001';
const path = '00000000-0000-4000-8000-000000000001/generated-images/00000000-0000-4000-8000-000000000002.png';

afterEach(() => vi.unstubAllGlobals());

describe('bounded private Storage analysis read', () => {
  it('constructs only the fixed project Storage target, disables redirects, and returns bounded bytes', async () => {
    const fetchMock = vi.fn(async (_url: URL, _init: RequestInit) => new Response(Uint8Array.from([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/png', 'content-length': '3' } }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(readBoundedAnalysisObject(authority, ownerId, path, { size: 3, contentType: 'image/png' })).resolves.toEqual(Uint8Array.from([1, 2, 3]));
    expect(fetchMock).toHaveBeenCalledWith(new URL(`https://project-ref.supabase.co/storage/v1/object/media/${path}`), expect.objectContaining({ method: 'GET', redirect: 'error' }));
    const init = fetchMock.mock.calls[0][1]; expect(init.headers).toMatchObject({ apikey: authority.serviceRoleKey, Authorization: `Bearer ${authority.serviceRoleKey}` });
  });

  it('rejects non-project, non-HTTPS, loopback, private, metadata, suffix-confused, and path-bearing authorities before fetch', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    for (const supabaseUrl of ['http://project.supabase.co', 'https://localhost', 'https://127.0.0.1', 'https://10.0.0.1', 'https://169.254.169.254', 'https://project.supabase.co.evil.test', 'https://evil.test', 'https://project.supabase.co/storage']) {
      await expect(readBoundedAnalysisObject({ ...authority, supabaseUrl }, ownerId, path, { size: 3, contentType: 'image/png' })).rejects.toMatchObject({ reason: 'temporarily-unavailable' } satisfies Partial<BoundedStorageReadError>);
    }
    for (const unsafePath of ['https://evil.test/a.png', '../secret.png', '00000000-0000-4000-8000-000000000001/../secret.png', '00000000-0000-4000-8000-000000000001/videos/00000000-0000-4000-8000-000000000002.mp4']) {
      await expect(readBoundedAnalysisObject(authority, ownerId, unsafePath, { size: 3, contentType: 'image/png' })).rejects.toMatchObject({ reason: 'temporarily-unavailable' });
    }
    await expect(readBoundedAnalysisObject(authority, '00000000-0000-4000-8000-000000000099', path, { size: 3, contentType: 'image/png' })).rejects.toMatchObject({ reason: 'temporarily-unavailable' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a lying Content-Length and cancels an over-bound stream before accumulation', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(Uint8Array.from([1, 2, 3, 4]), { headers: { 'content-type': 'image/png', 'content-length': '4' } })));
    await expect(readBoundedAnalysisObject(authority, ownerId, path, { size: 3, contentType: 'image/png' })).rejects.toMatchObject({ reason: 'media-too-large' });

    const cancel = vi.fn(); const body = { getReader: () => ({ read: vi.fn().mockResolvedValueOnce({ value: new Uint8Array(4), done: false }), cancel, releaseLock: vi.fn() }) };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, body, headers: new Headers({ 'content-type': 'image/png' }) })));
    await expect(readBoundedAnalysisObject(authority, ownerId, path, { size: 3, contentType: 'image/png' })).rejects.toMatchObject({ reason: 'media-too-large' });
    expect(cancel).toHaveBeenCalledOnce();
  });
});
