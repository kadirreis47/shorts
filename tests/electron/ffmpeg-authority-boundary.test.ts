import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const service = require('../../electron/ffmpeg-service.cjs') as any;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const security = require('../../electron/ffmpeg-security.cjs') as { validateFFmpegRunRequest(value: unknown): any };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const compiler = require('../../electron/canonical-render-intent.cjs') as { compileCanonicalRenderRequest(value: unknown): { args: string[] } };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const geometrySecurity = require('../../electron/image-display-geometry-authority.cjs') as { authorizeImageDisplayGeometryArgs(args: string[], declarations: unknown[], service: unknown, url: string): unknown };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createYouTubeOwnerContext } = require('../../electron/youtube-owner-context.cjs') as { createYouTubeOwnerContext(input: unknown): any };

const webContentsId = 41;
const ownerId = '00000000-0000-4000-8000-000000000001';
const objectPath = `${ownerId}/generated-images/00000000-0000-4000-8000-000000000002.jpg`;
const privateSource = `https://project.supabase.co/storage/v1/object/sign/media/${objectPath}?token=opaque`;
const mediaIdentity = `media:${objectPath}`;
const privateBytes = Buffer.from('authority-bound-private-image');
const digest = createHash('sha256').update(privateBytes).digest('hex');
const outputMarker = '{{OUTPUT_FILE}}';

afterEach(() => service.resetFFmpegAuthorityStateForTests());

describe('main-owned canonical FFmpeg authority boundary', () => {
  it.each([
    ['raw argv', { args: ['-version'] }], ['extra relative output', { args: ['safe.mp4', 'extra.mp4'] }],
    ['extra absolute output', { args: [path.resolve('extra.mp4')] }], ['traversal output', { args: ['../extra.mp4'] }],
    ['UNC output', { args: ['\\\\server\\share\\extra.mp4'] }], ['UDP output', { args: ['udp://127.0.0.1:9999'] }],
    ['file URL output', { args: ['file:///tmp/out.mp4'] }], ['pipe output', { args: ['pipe:2'] }],
    ['crypto/subfile input', { input: 'crypto:subfile:file.bin' }], ['response file', { commandFile: '@renderer-command.txt' }],
    ['filter script', { filterComplexScript: path.resolve('filter.txt') }], ['filter equals form', { option: `-filter_complex_script=${path.resolve('filter.txt')}` }],
    ['progress path', { progress: path.resolve('progress.txt') }], ['progress equals form', { option: `-progress=${path.resolve('progress.txt')}` }],
    ['protocol whitelist', { protocolWhitelist: 'file,http' }], ['protocol equals form', { option: '-protocol_whitelist=file,http' }],
    ['file-opening filter', { filter: `movie=${path.resolve('secret.jpg')}` }], ['subtitle path', { subtitlePath: path.resolve('secret.srt') }],
    ['font path', { fontPath: path.resolve('secret.ttf') }], ['concat path', { concatPath: path.resolve('concat.txt') }],
    ['concat body', { concatContent: "file 'secret.jpg'" }], ['undeclared URL', { url: 'https://cdn.example/secret' }],
  ])('categorically rejects renderer native authority: %s', (_label, injection) => {
    expect(() => security.validateFFmpegRunRequest({ ...fullRequest(path.resolve('out.mp4')), ...injection })).toThrow();
  });

  it('rejects path/protocol sources and forged image/video declarations', () => {
    const request = fullRequest(path.resolve('out.mp4'));
    const withSource = (source: unknown) => ({ ...request, intent: { ...request.intent, scenes: [{ ...request.intent.scenes[0], source }] } });
    expect(() => security.validateFFmpegRunRequest(withSource({ kind: 'external-video', url: 'file:///secret.mp4' }))).toThrow();
    expect(() => security.validateFFmpegRunRequest(withSource({ kind: 'external-video', url: 'udp://127.0.0.1:9999' }))).toThrow();
    expect(security.validateFFmpegRunRequest(withSource({ kind: 'private-image', url: 'https://cdn.example/still', geometry: declaration() }))).toBeTruthy();
    expect(() => security.validateFFmpegRunRequest(withSource({ kind: 'external-video', url: privateSource, geometry: declaration() }))).toThrow();
  });

  it('main constructs exactly one output and only fixed native operands', () => {
    const compiled = compiler.compileCanonicalRenderRequest(security.validateFFmpegRunRequest(fullRequest(path.resolve('out.mp4'))));
    expect(compiled.args.filter((value) => value === outputMarker)).toHaveLength(1);
    expect(compiled.args).toContain('pipe:1');
    expect(compiled.args.join('\n')).not.toMatch(/udp:|file:|crypto:|subfile:|filter_complex_script|protocol_whitelist|@renderer/iu);
  });

  it.each(['https', 'https://example.com', 'http', 'hflip', 'transpose', 'movie=', 'amovie=', 'file', `quote'\\:;,[line]\nUnicode ✓ 100%`])('treats watermark text as escaped literal data: %s', async (text) => {
    const output = path.resolve(`watermark-${Math.random().toString(16).slice(2)}.mp4`);
    const request = fullRequest(output); (request.intent as any).branding = { text, position: 'bottom-right' };
    service.rememberApprovedExportDestination(webContentsId, output);
    await expect(service.createCanonicalRenderPlan(webContentsId, request, { supabaseUrl: 'https://project.supabase.co' })).resolves.toMatchObject({ version: 1 });
    const compiled = compiler.compileCanonicalRenderRequest(security.validateFFmpegRunRequest(request));
    expect(compiled.args.join('\n')).toContain('drawtext=');
  });

  it('still rejects executable movie/amovie and orientation filters without trusted compiler provenance', () => {
    for (const filter of ['movie=C\\:/secret.jpg', 'amovie=C\\:/secret.wav', 'hflip', 'transpose=clock']) {
      expect(() => geometrySecurity.authorizeImageDisplayGeometryArgs(['-vf', filter, '{{OUTPUT_FILE}}'], [], null, 'https://project.supabase.co')).toThrowError(expect.objectContaining({ code: 'geometry-filter-injection' }));
    }
  });

  it('executes punctuation-heavy watermark data without creating another filter chain', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'shortsflow-watermark-literal-'));
    const output = path.join(root, 'watermark.mp4'); const watermarkPath = path.join(root, 'watermark.txt'); const request = fullRequest(output);
    const watermark = `https://example.com http hflip transpose movie= amovie= file ' " \\:;,[x]\nUnicode ✓ 100%`;
    (request.intent as any).branding = { text: watermark, position: 'bottom-right' }; await writeFile(watermarkPath, watermark);
    const compiled = compiler.compileCanonicalRenderRequest(security.validateFFmpegRunRequest(request));
    const serializedWatermarkPath = `'${watermarkPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'")}'`;
    const args = compiled.args.map((value) => value.split('{{WATERMARK_TEXT_FILE_FILTER_VALUE}}').join(serializedWatermarkPath).split(outputMarker).join(output));
    const result = spawnSync('ffmpeg', args, { encoding: 'utf8', maxBuffer: 1024 * 1024 });
    expect(result.status, result.stderr).toBe(0);
    expect(await stat(output)).toMatchObject({ size: expect.any(Number) });
    await fs.promises.rm(root, { recursive: true, force: true });
  });

  it('requires trusted geometry authority for canonical private images', async () => {
    const output = path.resolve('private-output.mp4');
    service.rememberApprovedExportDestination(webContentsId, output);
    await expect(service.createCanonicalRenderPlan(webContentsId, privateImageRequest(output), { supabaseUrl: 'https://project.supabase.co' })).rejects.toThrow();
    service.rememberApprovedExportDestination(webContentsId, output);
    await expect(service.createCanonicalRenderPlan(webContentsId, privateImageRequest(output), {
      supabaseUrl: 'https://project.supabase.co', geometryAuthority: geometryAuthority(),
    })).resolves.toMatchObject({ version: 1, reference: expect.stringMatching(/^crp1_/u) });
    const forged = privateImageRequest(output);
    (forged.intent.scenes[0].source as { url: string }).url = 'https://cdn.example/extensionless';
    service.rememberApprovedExportDestination(webContentsId, output);
    await expect(service.createCanonicalRenderPlan(webContentsId, forged, {
      supabaseUrl: 'https://project.supabase.co', geometryAuthority: geometryAuthority(),
    })).rejects.toThrow();
  });

  it('generates concat only from opaque segment resources and blocks injection', async () => {
    const segmentA = path.resolve('cache-a.mp4'); const segmentB = path.resolve('cache-b.mp4');
    const referenceA = service.rememberIssuedSegment(webContentsId, 'a'.repeat(16), segmentA);
    const referenceB = service.rememberIssuedSegment(webContentsId, 'b'.repeat(16), segmentB);
    expect(referenceA).toMatch(/^sgr1_/u);
    expect(service.requireIssuedSegment(webContentsId, referenceA)).toBe(segmentA);
    expect(() => service.requireIssuedSegment(99, referenceA)).toThrow(/unavailable/i);
    expect(service.canonicalConcatContent([segmentA, segmentB])).toBe(`file '${segmentA.replace(/\\/g, '/')}'\nfile '${segmentB.replace(/\\/g, '/')}'`);
    expect(() => service.canonicalConcatContent(["C:\\cache\\bad\nfile 'C:/secret.jpg'"])).toThrow();
    const output = path.resolve('concat-output.mp4'); service.rememberApprovedExportDestination(webContentsId, output);
    const plan = await service.createCanonicalRenderPlan(webContentsId, concatRequest(output, [referenceA, referenceB]));
    expect(service.consumeCanonicalRenderPlan(webContentsId, plan.reference, null).concatContent).toContain(segmentA.replace(/\\/g, '/'));
  });

  it('binds immutable one-shot plans to webContents, owner generation, and expiry', async () => {
    const output = path.resolve('authorized-output.mp4'); const owner = ownerAuthority();
    service.rememberApprovedExportDestination(webContentsId, output, 'render', owner.captured);
    const request = fullRequest(output);
    const plan = await service.createCanonicalRenderPlan(webContentsId, request, { ownerContext: owner.context, random: () => Buffer.alloc(32, 1) });
    (request.intent.scenes[0].source as { paletteIndex: number }).paletteIndex = 999;
    expect(() => service.consumeCanonicalRenderPlan(99, plan.reference, owner.context)).toThrow(/unavailable/i);
    expect(service.consumeCanonicalRenderPlan(webContentsId, plan.reference, owner.context).request.args.join(' ')).toContain('0x0f172a');
    expect(() => service.consumeCanonicalRenderPlan(webContentsId, plan.reference, owner.context)).toThrow(/unavailable/i);
    service.rememberApprovedExportDestination(webContentsId, output, 'render', owner.captured, 1_000);
    const expired = await service.createCanonicalRenderPlan(webContentsId, fullRequest(output), { ownerContext: owner.context, random: () => Buffer.alloc(32, 2), now: () => 1_000 });
    expect(() => service.consumeCanonicalRenderPlan(webContentsId, expired.reference, owner.context, 61_001)).toThrow(/unavailable/i);
  });

  it('bounds every native registry and clears renderer lifecycle state', () => {
    for (let index = 0; index < 520; index += 1) service.rememberIssuedSegment(webContentsId, index.toString(16).padStart(16, '0'), path.resolve(`segment-${index}.mp4`));
    for (let index = 0; index < 270; index += 1) service.rememberRenderedArtifact(webContentsId, path.resolve(`artifact-${index}.mp4`));
    for (let index = 0; index < 270; index += 1) service.rememberVerifiedExportArtifact(webContentsId, { artifactPath: path.resolve(`verified-${index}.mp4`), sizeBytes: 1, contentDigest: index.toString(16).padStart(64, '0') });
    for (let index = 0; index < 80; index += 1) service.rememberApprovedExportDestination(webContentsId, path.resolve(`destination-${index}.mp4`));
    expect(service.authorityRegistryStats()).toMatchObject({ segmentResources: 128, renderedArtifacts: 128, verifiedExportArtifacts: 128, approvedExportDestinations: 32 });
    const renderer = new EventEmitter() as EventEmitter & { id: number }; renderer.id = webContentsId;
    const geometry = { clearWebContents: vi.fn() };
    service.bindWebContentsLifecycle(renderer, geometry);
    renderer.emit('destroyed');
    expect(geometry.clearWebContents).toHaveBeenCalledWith(webContentsId);
    expect(service.authorityRegistryStats()).toEqual({ renderPlans: 0, segmentResources: 0, renderedArtifacts: 0, verifiedExportArtifacts: 0, approvedExportDestinations: 0 });
  });

  it('rejects segment resources across owner generations and after expiry', () => {
    const owner = ownerAuthority();
    const reference = service.issueSegmentResource(webContentsId, 'a'.repeat(16), owner.captured, undefined, 1_000, path.resolve('owner-segment.mp4')).reference;
    expect(service.requireIssuedSegment(webContentsId, reference, owner.captured, 2_000)).toBe(path.resolve('owner-segment.mp4'));
    expect(() => service.requireIssuedSegment(webContentsId, reference, { ...owner.captured, generation: 2 }, 2_000)).toThrow(/unavailable/i);
    expect(() => service.requireIssuedSegment(webContentsId, reference, owner.captured, 3_601_001)).toThrow(/unavailable/i);
  });

  it('expires and owner-binds destination, rendered, and verified artifact registries', () => {
    const owner = ownerAuthority(); const other = { ...owner.captured, ownerId: '00000000-0000-4000-8000-000000000009' };
    const destination = path.resolve('expiry-destination.mp4'); const artifactPath = path.resolve('expiry-artifact.mp4');
    const artifact = { artifactPath, sizeBytes: 1, contentDigest: 'a'.repeat(64) };
    service.rememberApprovedExportDestination(webContentsId, destination, 'render', owner.captured, 1_000);
    service.rememberRenderedArtifact(webContentsId, artifactPath, 'export', owner.captured, 1_000);
    service.rememberVerifiedExportArtifact(webContentsId, artifact, owner.captured, 1_000);
    expect(() => service.requireApprovedDestination(webContentsId, destination, 'render', other, 2_000)).toThrow(/unavailable/i);
    expect(() => service.requireRenderedArtifact(99, artifactPath, owner.captured, 2_000)).toThrow(/unavailable/i);
    expect(service.isKnownVerifiedExportArtifact(webContentsId, artifact, other, 2_000)).toBe(false);
    expect(service.authorityRegistryStats(3_601_001)).toMatchObject({ renderedArtifacts: 0, verifiedExportArtifacts: 0, approvedExportDestinations: 0 });
  });

  it('invalidates every owner-bound registry on transition', async () => {
    const output = path.resolve('transition-output.mp4'); const segment = path.resolve('transition-segment.mp4');
    service.rememberApprovedExportDestination(webContentsId, output); service.rememberIssuedSegment(webContentsId, 'e'.repeat(16), segment);
    service.rememberRenderedArtifact(webContentsId, output); service.rememberVerifiedExportArtifact(webContentsId, { artifactPath: output, sizeBytes: 1, contentDigest: 'e'.repeat(64) });
    const plan = await service.createCanonicalRenderPlan(webContentsId, fullRequest(output), { random: () => Buffer.alloc(32, 3) });
    const geometry = { clear: vi.fn() }; service.invalidateOwnerBoundAuthorities(geometry);
    expect(geometry.clear).toHaveBeenCalledOnce(); expect(service.authorityRegistryStats()).toEqual({ renderPlans: 0, segmentResources: 0, renderedArtifacts: 0, verifiedExportArtifacts: 0, approvedExportDestinations: 0 });
    expect(() => service.consumeCanonicalRenderPlan(webContentsId, plan.reference, null)).toThrow(/unavailable/i);
  });

  it.each([
    ['subtitle write', 'afterSubtitleWrite'], ['concat write', 'afterConcatWrite'], ['output mkdir', 'afterOutputDirectory'],
    ['input preparation', 'afterInputPreparation'], ['FFmpeg spawn', 'afterFFmpegSpawn'], ['post-child processing', 'afterResultProcessing'],
  ])('cleans the render transaction after injected %s failure', async (_label, hook) => {
    const root = await mkdtemp(path.join(tmpdir(), 'shortsflow-staging-test-')); let tempDirectory = '';
    const child = fakeChild(); const output = path.join(root, 'output.mp4');
    const pending = service.runFFmpeg({ id: webContentsId, send: vi.fn() }, { ...internalRequest(output), subtitleContent: 'subtitle' }, {
      capabilities: { available: true, executable: 'ffmpeg-test' }, concatContent: "file 'main-known.mp4'", fsApi: trackedFs((value) => { tempDirectory = value; }),
      spawnImpl: (_executable: string, args: string[]) => { void writeFile(args.at(-1)!, 'rendered').then(() => setImmediate(() => child.emit('close', 0, null))); return child; },
      lifecycleHooks: { [hook]: () => { throw new Error(`injected-${hook}`); }, cleanupDelay: async () => undefined },
    });
    await expect(pending).rejects.toThrow(`injected-${hook}`);
    await expect(stat(tempDirectory)).rejects.toMatchObject({ code: 'ENOENT' });
    if (hook === 'afterFFmpegSpawn') expect(child.kill).toHaveBeenCalled();
    await fs.promises.rm(root, { recursive: true, force: true });
  });

  it('retries cleanup and turns permanent cleanup failure after success into failure', async () => {
    const rm = vi.fn().mockRejectedValueOnce(new Error('busy')).mockResolvedValue(undefined);
    await expect(service.removeWithRetry({ promises: { rm } }, 'opaque-temp', { recursive: true }, 2, async () => undefined)).resolves.toBeUndefined();
    expect(rm).toHaveBeenCalledTimes(2);
    const root = await mkdtemp(path.join(tmpdir(), 'shortsflow-cleanup-fail-')); let tempDirectory = '';
    const child = fakeChild(); const base = trackedFs((value) => { tempDirectory = value; });
    const fsApi = { ...base, promises: { ...base.promises, rm: async (target: string, options: unknown) => target === tempDirectory ? Promise.reject(new Error('permanent cleanup failure')) : fs.promises.rm(target, options as never) } };
    const pending = service.runFFmpeg({ id: webContentsId, send: vi.fn() }, internalRequest(path.join(root, 'output.mp4')), {
      capabilities: { available: true, executable: 'ffmpeg-test' }, fsApi,
      spawnImpl: (_executable: string, args: string[]) => { void writeFile(args.at(-1)!, 'rendered').then(() => setImmediate(() => child.emit('close', 0, null))); return child; },
      lifecycleHooks: { cleanupAttempts: 2, cleanupDelay: async () => undefined },
    });
    await expect(pending).rejects.toThrow(/cleanup failed/i);
    await fs.promises.rm(root, { recursive: true, force: true }); await fs.promises.rm(tempDirectory, { recursive: true, force: true });
  });

  it('preserves a primary error and exposes cleanup failure context', async () => {
    const base = trackedFs(() => undefined); const fsApi = { ...base, promises: { ...base.promises, rm: vi.fn(async () => { throw new Error('cleanup'); }) } };
    let error: any;
    try { await service.runFFmpeg({ id: webContentsId, send: vi.fn() }, internalRequest(path.resolve('unused.mp4')), {
      capabilities: { available: true, executable: 'ffmpeg-test' }, fsApi,
      lifecycleHooks: { afterOutputDirectory: () => { throw new Error('primary failure'); }, cleanupAttempts: 2, cleanupDelay: async () => undefined },
    }); } catch (caught) { error = caught; }
    expect(error?.message).toBe('primary failure'); expect(error?.cleanupFailure).toBeInstanceOf(Error);
  });

  it('preserves owner cancellation as primary when required cleanup also fails', async () => {
    const owner = ownerAuthority(); let tempDirectory = '';
    const base = trackedFs((value) => { tempDirectory = value; });
    const fsApi = { ...base, promises: { ...base.promises, rm: vi.fn(async () => { throw new Error('cleanup'); }) } };
    let error: any;
    try {
      await service.runFFmpeg({ id: webContentsId, send: vi.fn() }, internalRequest(path.resolve('unused-owner.mp4')), {
        capabilities: { available: true, executable: 'ffmpeg-test' }, fsApi,
        ownerContext: owner.context, executionOwner: owner.captured,
        lifecycleHooks: { afterOutputDirectory: () => owner.transition(), cleanupAttempts: 2, cleanupDelay: async () => undefined },
      });
    } catch (caught) { error = caught; }
    expect(error?.message).toMatch(/stale owner/i);
    expect(error?.cleanupFailure).toBeInstanceOf(Error);
    await fs.promises.rm(tempDirectory, { recursive: true, force: true });
  });

  it.each(['afterCopy', 'beforeCommit', 'afterCommit'])('rolls back owner transition during promotion: %s', async (phase) => {
    const root = await mkdtemp(path.join(tmpdir(), 'shortsflow-promotion-owner-'));
    const source = path.join(root, 'source.mp4'); const destination = path.join(root, 'destination.mp4');
    await writeFile(source, 'new-owner-a'); await writeFile(destination, 'original'); const owner = ownerAuthority();
    await expect(service.materializeFile(source, destination, fs, {
      ownerSignal: owner.captured.signal, assertAuthority: () => owner.context.assertCurrent(owner.captured),
      lifecycleHooks: { [phase]: async () => owner.transition() }, cleanupDelay: async () => undefined,
    })).rejects.toThrow();
    expect(await readFile(destination, 'utf8')).toBe('original'); await fs.promises.rm(root, { recursive: true, force: true });
  });

  it('removes a newly created destination when owner invalidates before commit', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'shortsflow-promotion-absent-'));
    const source = path.join(root, 'source.mp4'); const destination = path.join(root, 'destination.mp4'); await writeFile(source, 'owner-a');
    const owner = ownerAuthority();
    await expect(service.materializeFile(source, destination, fs, {
      ownerSignal: owner.captured.signal, assertAuthority: () => owner.context.assertCurrent(owner.captured),
      lifecycleHooks: { beforeCommit: async () => owner.transition() }, cleanupDelay: async () => undefined,
    })).rejects.toThrow();
    await expect(stat(destination)).rejects.toMatchObject({ code: 'ENOENT' }); await fs.promises.rm(root, { recursive: true, force: true });
  });

  it('holds the owner transition until a stale promotion has rolled back', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'shortsflow-promotion-critical-'));
    const source = path.join(root, 'source.mp4'); const destination = path.join(root, 'destination.mp4');
    await writeFile(source, 'owner-a'); await writeFile(destination, 'original');
    const ownerContext = createYouTubeOwnerContext({
      validateAccessToken: async () => ({ ownerId, expiresAt: Date.now() + 60_000 }),
    });
    await ownerContext.establish('a'.repeat(20));
    const captured = ownerContext.capture();
    let release!: () => void; let reached!: () => void;
    const paused = new Promise<void>((resolve) => { release = resolve; });
    const atCommit = new Promise<void>((resolve) => { reached = resolve; });
    const promotion = service.materializeWithOwnerTransaction(source, destination, fs, ownerContext, captured, {
      lifecycleHooks: { afterCommit: async () => { reached(); await paused; } },
      cleanupDelay: async () => undefined,
    });
    await atCommit;
    let transitionFinished = false;
    const transition = ownerContext.clear().then(() => { transitionFinished = true; });
    await new Promise((resolve) => setImmediate(resolve));
    expect(transitionFinished).toBe(false);
    release();
    await expect(promotion).rejects.toThrow();
    await transition;
    expect(await readFile(destination, 'utf8')).toBe('original');
    await fs.promises.rm(root, { recursive: true, force: true });
  });

  it('activates the replacement owner only after a removal failure is safely overwritten from backup', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'shortsflow-promotion-safe-restore-'));
    const source = path.join(root, 'source.mp4'); const destination = path.join(root, 'destination.mp4');
    await writeFile(source, 'owner-a'); await writeFile(destination, 'original');
    const context = transitionContext(); await context.establish('owner-a-token-value-123'); const captured = context.capture();
    let reached!: () => void; let release!: () => void;
    const committed = new Promise<void>((resolve) => { reached = resolve; }); const gate = new Promise<void>((resolve) => { release = resolve; });
    const fsApi = { ...fs, promises: { ...fs.promises, rm: async (target: string, options: unknown) => target === destination ? Promise.reject(new Error('locked destination')) : fs.promises.rm(target, options as never) } };
    const promotion = service.materializeWithOwnerTransaction(source, destination, fsApi, context, captured, { lifecycleHooks: { afterCommit: async () => { reached(); await gate; } }, cleanupAttempts: 2, cleanupDelay: async () => undefined });
    await committed; const transition = context.establish('owner-b-token-value-123'); release();
    await expect(promotion).rejects.toThrow();
    await expect(transition).resolves.toMatchObject({ ownerId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' });
    expect(await readFile(destination, 'utf8')).toBe('original');
    await fs.promises.rm(root, { recursive: true, force: true });
  });

  it.each([true, false])('poisons owner transition when stale committed bytes cannot be recovered (preexisting=%s)', async (preexisting) => {
    const root = await mkdtemp(path.join(tmpdir(), 'shortsflow-promotion-unrecovered-'));
    const source = path.join(root, 'source.mp4'); const destination = path.join(root, 'destination.mp4');
    await writeFile(source, 'owner-a'); if (preexisting) await writeFile(destination, 'original');
    const context = transitionContext(); await context.establish('owner-a-token-value-123'); const captured = context.capture();
    let reached!: () => void; let release!: () => void;
    const committed = new Promise<void>((resolve) => { reached = resolve; }); const gate = new Promise<void>((resolve) => { release = resolve; });
    const fsApi = { ...fs, promises: { ...fs.promises,
      rm: async (target: string, options: unknown) => target === destination ? Promise.reject(new Error('locked destination')) : fs.promises.rm(target, options as never),
      copyFile: async (from: string, to: string) => from.endsWith('.bak') ? Promise.reject(new Error('restore blocked')) : fs.promises.copyFile(from, to),
    } };
    const promotion = service.materializeWithOwnerTransaction(source, destination, fsApi, context, captured, { lifecycleHooks: { afterCommit: async () => { reached(); await gate; } }, cleanupAttempts: 2, cleanupDelay: async () => undefined });
    await committed; const transition = context.establish('owner-b-token-value-123'); release();
    await expect(promotion).rejects.toMatchObject({ code: 'native-promotion-recovery-required', unrecoveredOwnerState: true });
    await expect(transition).rejects.toMatchObject({ code: 'youtube-owner-recovery-required' });
    expect(() => context.capture()).toThrow();
    expect(await readFile(destination, 'utf8')).toBe('owner-a');
    expect(service.authorityRegistryStats().renderedArtifacts).toBe(0);
    await fs.promises.rm(root, { recursive: true, force: true });
  });

  it('allows owner transition only when bounded destination-removal recovery eventually succeeds', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'shortsflow-promotion-retry-'));
    const source = path.join(root, 'source.mp4'); const destination = path.join(root, 'destination.mp4'); await writeFile(source, 'owner-a');
    const context = transitionContext(); await context.establish('owner-a-token-value-123'); const captured = context.capture(); let removalAttempts = 0;
    let reached!: () => void; let release!: () => void;
    const committed = new Promise<void>((resolve) => { reached = resolve; }); const gate = new Promise<void>((resolve) => { release = resolve; });
    const fsApi = { ...fs, promises: { ...fs.promises, rm: async (target: string, options: unknown) => {
      if (target === destination && ++removalAttempts < 3) throw new Error('temporarily locked');
      return fs.promises.rm(target, options as never);
    } } };
    const promotion = service.materializeWithOwnerTransaction(source, destination, fsApi, context, captured, { lifecycleHooks: { afterCommit: async () => { reached(); await gate; } }, cleanupAttempts: 3, cleanupDelay: async () => undefined });
    await committed; const transition = context.establish('owner-b-token-value-123'); release();
    await expect(promotion).rejects.toThrow(); await expect(transition).resolves.toMatchObject({ ownerId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' });
    expect(removalAttempts).toBe(3); await expect(stat(destination)).rejects.toMatchObject({ code: 'ENOENT' });
    await fs.promises.rm(root, { recursive: true, force: true });
  });

  it('reports rollback and backup cleanup failures without false success', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'shortsflow-promotion-failures-'));
    const source = path.join(root, 'source.mp4'); const destination = path.join(root, 'destination.mp4'); await writeFile(source, 'new'); await writeFile(destination, 'original');
    const owner = ownerAuthority();
    const rollbackFs = { ...fs, promises: { ...fs.promises, rm: async (target: string, options: unknown) => {
      if (target === destination) throw new Error('rollback blocked'); return fs.promises.rm(target, options as never);
    } } };
    let rollbackError: any;
    try { await service.materializeFile(source, destination, rollbackFs, {
      ownerSignal: owner.captured.signal, assertAuthority: () => owner.context.assertCurrent(owner.captured),
      lifecycleHooks: { afterCommit: async () => owner.transition() }, cleanupAttempts: 2, cleanupDelay: async () => undefined,
    }); } catch (error) { rollbackError = error; }
    expect(rollbackError?.rollbackFailure).toBeInstanceOf(Error);

    await writeFile(destination, 'original');
    const cleanupFs = { ...fs, rmSync: () => { throw new Error('backup cleanup blocked'); } };
    await expect(service.materializeFile(source, destination, cleanupFs, { cleanupDelay: async () => undefined })).rejects.toThrow(/backup cleanup blocked/i);
    expect(await readFile(destination, 'utf8')).toBe('original'); await fs.promises.rm(root, { recursive: true, force: true });
  });

  it('blocks a paused download and kills a child when owner authority changes', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'shortsflow-owner-races-')); const owner = ownerAuthority(); let notify!: () => void;
    const started = new Promise<void>((resolve) => { notify = resolve; }); const spawnImpl = vi.fn();
    const pending = service.runFFmpeg({ id: webContentsId, send: vi.fn() }, { ...internalRequest(path.join(root, 'download.mp4')), args: ['-stream_loop', '-1', '-i', 'https://cdn.example/extensionless', outputMarker] }, {
      capabilities: { available: true, executable: 'ffmpeg-test' }, ownerContext: owner.context, executionOwner: owner.captured, spawnImpl,
      fetchImpl: vi.fn((_url, options) => new Promise((_resolve, reject) => { notify(); options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }); })),
    });
    await started; owner.transition(); await expect(pending).rejects.toThrow(); expect(spawnImpl).not.toHaveBeenCalled();
    const runningOwner = ownerAuthority(); const child = fakeChild(); const output = path.join(root, 'child.mp4'); let notifySpawn!: () => void;
    const spawned = new Promise<void>((resolve) => { notifySpawn = resolve; });
    const running = service.runFFmpeg({ id: webContentsId, send: vi.fn() }, internalRequest(output), {
      capabilities: { available: true, executable: 'ffmpeg-test' }, ownerContext: runningOwner.context, executionOwner: runningOwner.captured, spawnImpl: () => child,
      lifecycleHooks: { afterFFmpegSpawn: notifySpawn },
    });
    await spawned; runningOwner.transition(); child.emit('close', 0, null);
    await expect(running).rejects.toThrow(/owner authority changed|stale owner/i); expect(child.kill).toHaveBeenCalled(); await fs.promises.rm(root, { recursive: true, force: true });
  });

  it('classifies staged bytes and never gives FFmpeg a mutable URL', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'shortsflow-external-stage-')); const output = path.join(root, 'output.mp4');
    const request = { ...internalRequest(output), args: ['-stream_loop', '-1', '-i', 'https://cdn.example/extensionless', outputMarker] };
    const fetchImpl = vi.fn(async () => new Response(Buffer.from('external-media-bytes'), { headers: { 'content-length': '20' } }));
    await expect(service.runFFmpeg({ id: webContentsId, send: vi.fn() }, request, { capabilities: { available: true, executable: 'ffmpeg-test' }, fetchImpl, probeInput: vi.fn(async () => 'image'), spawnImpl: vi.fn() })).rejects.toThrow(/external images/i);
    const child = fakeChild(); let spawnedArgs: string[] = [];
    await expect(service.runFFmpeg({ id: webContentsId, send: vi.fn() }, { ...request, jobId: 'external-video' }, {
      capabilities: { available: true, executable: 'ffmpeg-test' }, fetchImpl,
      probeInput: vi.fn(async (stagedPath: string) => { expect(await readFile(stagedPath, 'utf8')).toBe('external-media-bytes'); return 'video'; }),
      spawnImpl: (_executable: string, args: string[]) => { spawnedArgs = args; void writeFile(args.at(-1)!, 'rendered').then(() => setImmediate(() => child.emit('close', 0, null))); return child; },
    })).resolves.toMatchObject({ outputPath: output });
    expect(spawnedArgs).not.toContain('https://cdn.example/extensionless'); await fs.promises.rm(root, { recursive: true, force: true });
  });
});

function fullRequest(outputPath: string) { return { operation: 'full-render', jobId: `job-${Math.random().toString(16).slice(2)}`, outputPath, intent: intent('full') }; }
function concatRequest(outputPath: string, segmentReferences: string[]) { return { operation: 'segment-concat', jobId: `concat-${Math.random().toString(16).slice(2)}`, outputPath, intent: { ...intent('concat-segments'), durationMs: segmentReferences.length * 100, scenes: [], sceneDurationsMs: segmentReferences.map(() => 100), transitions: segmentReferences.map(() => ({ type: 'cut', overlapMs: 0 })), segmentReferences } }; }
function privateImageRequest(outputPath: string) { const request = fullRequest(outputPath); return { ...request, intent: { ...request.intent, scenes: [{ durationMs: 100, cameraMotion: 'none', source: { kind: 'private-image', url: privateSource, geometry: declaration() } }] } }; }
function intent(kind: 'full' | 'segment' | 'concat-segments') { return {
  version: 1, kind, width: 160, height: 90, durationMs: 100, scenes: [{ durationMs: 100, cameraMotion: 'none', source: { kind: 'color', paletteIndex: 0 } }], sceneDurationsMs: [100], transitions: [{ type: 'cut', overlapMs: 0 }], segmentReferences: [], branding: null, subtitleContent: '', audioTracks: [],
  audioSettings: { masterGain: 1, targetLufs: -14, duckingAttackMs: 25, duckingReleaseMs: 250 }, encoding: { videoCodec: 'h264', audioCodec: 'aac', quality: 'standard', hardwareAcceleration: 'disabled', encoder: null, encoderMode: null, bitrateKbps: null, maxBitrateKbps: null, bufferSizeKbps: null, crf: null, encoderPreset: null, frameRate: 30, pixelFormat: 'yuv420p', gopFrames: null, keyframeInterval: null, threads: null, audioBitrateKbps: 192, sampleRate: 48_000, audioChannels: 2, colorSpace: null, profile: null },
}; }
function internalRequest(outputPath: string) { return { jobId: `internal-${Math.random().toString(16).slice(2)}`, outputPath, args: ['-f', 'lavfi', '-i', 'color=c=0x000000:s=160x90:r=30', '-t', '0.1', '-progress', 'pipe:1', outputMarker], subtitleContent: '', imageGeometryAuthorities: [] }; }
function declaration() { return { inputIndex: 0, authorityReference: `idga1_${'A'.repeat(43)}`, mediaIdentity, expectedOrientation: 'identity', contentDigest: digest }; }
function geometryAuthority() { return { authorize: vi.fn(() => ({ geometry: { encodedToDisplay: 'identity' }, contentDigest: digest })) }; }
function fakeChild() { const child = new EventEmitter() as EventEmitter & { stdout: PassThrough; stderr: PassThrough; killed: boolean; kill: ReturnType<typeof vi.fn> }; child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.killed = false; child.kill = vi.fn(() => { child.killed = true; return true; }); return child; }
function trackedFs(onCreate: (directory: string) => void) { return { rmSync: fs.rmSync.bind(fs), promises: { mkdtemp: async (prefix: string) => { const directory = await fs.promises.mkdtemp(prefix); onCreate(directory); return directory; }, writeFile: fs.promises.writeFile.bind(fs.promises), mkdir: fs.promises.mkdir.bind(fs.promises), stat: fs.promises.stat.bind(fs.promises), rm: fs.promises.rm.bind(fs.promises), open: fs.promises.open.bind(fs.promises), copyFile: fs.promises.copyFile.bind(fs.promises), rename: fs.promises.rename.bind(fs.promises) } }; }
function ownerAuthority() { const controller = new AbortController(); let current = true; const captured = Object.freeze({ ownerId, generation: 1, signal: controller.signal }); const context = { capture: () => captured, assertCurrent: (candidate: typeof captured) => { if (!current || candidate !== captured || candidate.signal.aborted) throw new Error('stale owner'); }, isCurrent: (candidate: typeof captured) => current && candidate === captured && !candidate.signal.aborted }; return { captured, context, transition: () => { current = false; controller.abort(); } }; }
function transitionContext() { return createYouTubeOwnerContext({ validateAccessToken: async (token: string) => ({ ownerId: token.startsWith('owner-a') ? ownerId : 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', expiresAt: Date.now() + 60_000 }) }); }
