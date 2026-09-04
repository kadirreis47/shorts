import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createImageDisplayGeometryAuthorityService, materializeImageDisplayGeometryArgs, prepareImageDisplayGeometryExecution } = require('../../electron/image-display-geometry-authority.cjs') as {
  createImageDisplayGeometryAuthorityService(options: Record<string, unknown>): {
    resolve(webContentsId: number, input: unknown): Promise<Record<string, unknown>>;
    authorize(webContentsId: number, reference: string, identity: string, orientation: string, contentDigest: string): Record<string, unknown>;
    clearWebContents(webContentsId: number): void;
    stats(): { total: number; perWebContents: Record<number, number> };
  };
  materializeImageDisplayGeometryArgs(args: string[], declarations: unknown[], service: unknown, url: string, options?: unknown): string[];
  prepareImageDisplayGeometryExecution(args: string[], declarations: unknown[], service: unknown, url: string, options: unknown): Promise<string[]>;
};

const owner = '00000000-0000-4000-8000-000000000001';
const otherOwner = '00000000-0000-4000-8000-000000000009';
const objectPath = `${owner}/generated-images/00000000-0000-4000-8000-000000000002.jpg`;
const mediaIdentity = `media:${objectPath}`;
const source = `https://project.supabase.co/storage/v1/object/sign/media/${objectPath}?token=opaque`;
const accessToken = jwt({ sub: owner, exp: 4_102_444_800 });
const opaque = `omr1.${'a'.repeat(16)}.${'b'.repeat(48)}`;
const canonicalBytes = Buffer.from('exact-canonical-image-bytes');
const contentDigest = createHash('sha256').update(canonicalBytes).digest('hex');
const webContentsId = 17;

function harness(orientation = 'transverse') {
  let currentOwner = owner;
  let generation = 3;
  let now = Date.parse('2026-09-04T00:00:00.000Z');
  let nonce = 0;
  const transitionListeners = new Set<() => void>();
  const ownerContext = {
    capture: () => Object.freeze({ ownerId: currentOwner, generation, signal: new AbortController().signal }),
    assertCurrent: (context: { ownerId: string; generation: number }) => {
      if (context.ownerId !== currentOwner || context.generation !== generation) throw new Error('stale owner');
    },
    onTransition: (listener: () => void) => { transitionListeners.add(listener); return () => transitionListeners.delete(listener); },
  };
  const fetchImpl = vi.fn(async (url: string, _options?: RequestInit) => url.includes('/media-analysis-reference')
    ? response({ reference: opaque, scope: 'image-display-geometry', mediaType: 'image' })
    : response({
      version: 1, mediaIdentity, encodedDimensions: { width: 3, height: 2 },
      displayDimensions: ['transpose', 'rotate-90-cw', 'transverse', 'rotate-90-ccw'].includes(orientation) ? { width: 2, height: 3 } : { width: 3, height: 2 },
      encodedToDisplay: orientation,
      contentDigest,
    }));
  const service = createImageDisplayGeometryAuthorityService({
    ownerContext,
    resolveConfig: () => ({ url: 'https://project.supabase.co', anonKey: 'anon' }),
    fetchImpl,
    random: () => { const value = Buffer.alloc(32); value.writeUInt32BE(++nonce); return value; },
    now: () => now,
  });
  return {
    service, fetchImpl,
    expire: () => { now += 3_600_001; },
    switchOwner: () => { currentOwner = otherOwner; generation += 1; for (const listener of transitionListeners) listener(); },
    notifyTransition: () => { for (const listener of transitionListeners) listener(); },
  };
}

describe('native image display geometry execution authority', () => {
  it('derives through the two protected scopes and mints only a process-local handle', async () => {
    const { service, fetchImpl } = harness('rotate-90-cw');
    const result = await service.resolve(webContentsId, { accessToken, media: { bucket: 'media', objectPath } });
    expect(result).toMatchObject({ mediaIdentity, encodedToDisplay: 'rotate-90-cw', executionAuthority: { version: 1 } });
    expect(String((result.executionAuthority as { reference: string }).reference)).toMatch(/^idga1_[A-Za-z0-9_-]{43}$/);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const firstOptions = fetchImpl.mock.calls[0]![1]!;
    const secondOptions = fetchImpl.mock.calls[1]![1]!;
    expect(JSON.parse(String(firstOptions.body))).toEqual({ media: { bucket: 'media', objectPath }, scope: 'image-display-geometry' });
    expect(JSON.parse(String(secondOptions.body))).toEqual({ reference: opaque });
    const headers = firstOptions.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${accessToken}`);
    expect(JSON.stringify(result)).not.toContain(accessToken);
    expect(JSON.stringify(result)).not.toContain('anon');
  });

  it('rejects forged, mutated, expired, cross-media and cross-owner handles', async () => {
    const h = harness('transverse');
    const result = await h.service.resolve(webContentsId, { accessToken, media: { bucket: 'media', objectPath } });
    const reference = (result.executionAuthority as { reference: string }).reference;
    expect(() => h.service.authorize(webContentsId, reference, mediaIdentity, 'transverse', contentDigest)).not.toThrow();
    expect(() => h.service.authorize(webContentsId + 1, reference, mediaIdentity, 'transverse', contentDigest)).toThrow();
    expect(() => h.service.authorize(webContentsId, `idga1_${'Z'.repeat(43)}`, mediaIdentity, 'transverse', contentDigest)).toThrow();
    expect(() => h.service.authorize(webContentsId, reference, mediaIdentity, 'transpose', contentDigest)).toThrow();
    expect(() => h.service.authorize(webContentsId, reference, mediaIdentity, 'transverse', 'f'.repeat(64))).toThrow();
    expect(() => h.service.authorize(webContentsId, reference, mediaIdentity.replace('.jpg', '.png'), 'transverse', contentDigest)).toThrow();
    h.switchOwner();
    expect(() => h.service.authorize(webContentsId, reference, mediaIdentity, 'transverse', contentDigest)).toThrow();
    const fresh = harness('transverse');
    const next = await fresh.service.resolve(webContentsId, { accessToken, media: { bucket: 'media', objectPath } });
    fresh.expire();
    expect(() => fresh.service.authorize(webContentsId, (next.executionAuthority as { reference: string }).reference, mediaIdentity, 'transverse', contentDigest)).toThrow();
  });

  it('actively clears process-local handles when an owner transition begins', async () => {
    const h = harness('identity');
    const result = await h.service.resolve(webContentsId, { accessToken, media: { bucket: 'media', objectPath } });
    const reference = (result.executionAuthority as { reference: string }).reference;
    expect(() => h.service.authorize(webContentsId, reference, mediaIdentity, 'identity', contentDigest)).not.toThrow();
    h.notifyTransition();
    expect(() => h.service.authorize(webContentsId, reference, mediaIdentity, 'identity', contentDigest)).toThrow();
  });

  it('revokes destroyed-window handles and enforces per-window and global bounds', async () => {
    const h = harness('identity');
    const first = await h.service.resolve(webContentsId, { accessToken, media: { bucket: 'media', objectPath } });
    const firstReference = (first.executionAuthority as { reference: string }).reference;
    h.service.clearWebContents(webContentsId);
    expect(() => h.service.authorize(webContentsId, firstReference, mediaIdentity, 'identity', contentDigest)).toThrow();
    for (let index = 0; index < 65; index += 1) await h.service.resolve(webContentsId, { accessToken, media: { bucket: 'media', objectPath } });
    expect(h.service.stats()).toMatchObject({ total: 64, perWebContents: { [webContentsId]: 64 } });
    for (let windowId = 100; windowId < 104; windowId += 1) {
      for (let index = 0; index < 64; index += 1) await h.service.resolve(windowId, { accessToken, media: { bucket: 'media', objectPath } });
    }
    expect(h.service.stats().total).toBe(256);
  });

  it('binds -noautorotate and one main-expanded transform to the exact private input', async () => {
    const { service } = harness('transverse');
    const result = await service.resolve(webContentsId, { accessToken, media: { bucket: 'media', objectPath } });
    const declaration = {
      inputIndex: 0,
      authorityReference: (result.executionAuthority as { reference: string }).reference,
      mediaIdentity,
      expectedOrientation: 'transverse',
      contentDigest,
    };
    const args = ['-noautorotate', '-framerate', '30', '-loop', '1', '-i', source, '-vf', '{{IMAGE_DISPLAY_GEOMETRY_INPUT_0}},scale=2:3', 'out.mp4'];
    expect(materializeImageDisplayGeometryArgs(args, [declaration], service, 'https://project.supabase.co', { webContentsId }))
      .toContain('transpose=clock,vflip,scale=2:3');
    expect(() => materializeImageDisplayGeometryArgs(args.filter((arg) => arg !== '-noautorotate'), [declaration], service, 'https://project.supabase.co', { webContentsId })).toThrow();
    expect(() => materializeImageDisplayGeometryArgs(args, [{ ...declaration, expectedOrientation: 'transpose' }], service, 'https://project.supabase.co', { webContentsId })).toThrow();
    expect(() => materializeImageDisplayGeometryArgs(args.map((arg) => arg.replace('{{IMAGE_DISPLAY_GEOMETRY_INPUT_0}}', 'hflip')), [declaration], service, 'https://project.supabase.co', { webContentsId })).toThrow();
    expect(() => materializeImageDisplayGeometryArgs(args.map((arg) => arg.replace('{{IMAGE_DISPLAY_GEOMETRY_INPUT_0}}', 'hflip@forged')), [declaration], service, 'https://project.supabase.co', { webContentsId })).toThrow();
    expect(() => materializeImageDisplayGeometryArgs(args.map((arg) => arg.replace('{{IMAGE_DISPLAY_GEOMETRY_INPUT_0}}', 'transpose@forged=clock')), [declaration], service, 'https://project.supabase.co', { webContentsId })).toThrow();
    expect(() => materializeImageDisplayGeometryArgs([
      '-noautorotate', '-loop', '1', '-i', source,
      '-filter_complex', '[1:v]{{IMAGE_DISPLAY_GEOMETRY_INPUT_0}},scale=2:3[out]', '-map', '[out]',
    ], [declaration], service, 'https://project.supabase.co', { webContentsId })).toThrow();
    expect(() => materializeImageDisplayGeometryArgs(args, [], service, 'https://project.supabase.co', { webContentsId })).toThrow();
  });

  it('blocks mutable external still images and keeps videos free of image-only controls', () => {
    const external = ['-framerate', '30', '-loop', '1', '-i', 'https://cdn.example/image.jpg', '-vf', 'scale=2:3', 'out.mp4'];
    expect(() => materializeImageDisplayGeometryArgs(external, [], null, 'https://project.supabase.co')).toThrow(/mutable/i);
    const video = ['-stream_loop', '-1', '-i', 'https://cdn.example/video.mp4', '-vf', 'scale=2:3', 'out.mp4'];
    expect(materializeImageDisplayGeometryArgs(video, [], null, 'https://project.supabase.co')).toEqual(video);
    expect(() => materializeImageDisplayGeometryArgs(['-noautorotate', ...video], [], null, 'https://project.supabase.co')).toThrow();
    expect(() => materializeImageDisplayGeometryArgs(['-loop', '1', '-i', 'C:/mutable/image.jpg', '-vf', 'scale=2:3'], [], null, 'https://project.supabase.co')).toThrow(/authority-bound private media/i);
  });

  it('materializes only the exact authority-bound bytes and rejects storage mutation', async () => {
    const { service } = harness('transverse');
    const result = await service.resolve(webContentsId, { accessToken, media: { bucket: 'media', objectPath } });
    const declaration = {
      inputIndex: 0,
      authorityReference: (result.executionAuthority as { reference: string }).reference,
      mediaIdentity,
      expectedOrientation: 'transverse',
      contentDigest,
    };
    const args = ['-noautorotate', '-loop', '1', '-i', source, '-vf', '{{IMAGE_DISPLAY_GEOMETRY_INPUT_0}},scale=2:3'];
    const directory = await mkdtemp(join(tmpdir(), 'shortsflow-authority-test-'));
    try {
      const exact = await prepareImageDisplayGeometryExecution(args, [declaration], service, 'https://project.supabase.co', {
        tempDir: directory, webContentsId,
        fetchImpl: vi.fn(async () => new Response(canonicalBytes, { status: 200, headers: { 'content-length': String(canonicalBytes.length) } })),
      });
      expect(exact[exact.indexOf('-i') + 1]).toMatch(/trusted-image-0\.jpg$/u);
      await expect(readFile(exact[exact.indexOf('-i') + 1])).resolves.toEqual(canonicalBytes);
      await expect(prepareImageDisplayGeometryExecution(args, [declaration], service, 'https://project.supabase.co', {
        tempDir: directory, webContentsId,
        fetchImpl: vi.fn(async () => new Response('mutated bytes', { status: 200 })),
      })).rejects.toMatchObject({ code: 'geometry-media-changed' });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});

function response(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
}

function jwt(payload: unknown): string {
  return `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
}
