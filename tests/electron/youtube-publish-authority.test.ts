import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpeg = require('../../electron/ffmpeg-service.cjs') as any;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { registerYouTubeHandlers } = require('../../electron/youtube-ipc.cjs') as any;

const ownerA = Object.freeze({ ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', generation: 4, signal: new AbortController().signal });
const ownerB = Object.freeze({ ownerId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', generation: 5, signal: new AbortController().signal });
let directory = '';

afterEach(async () => {
  ffmpeg.resetFFmpegAuthorityStateForTests();
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = '';
});

describe('YouTube verified-export publishing capability', () => {
  it('binds opaque reusable authority to owner, generation, webContents, bytes, TTL, and operation', async () => {
    directory = await mkdtemp(join(tmpdir(), 'shortsflow-publish-authority-'));
    const artifactPath = join(directory, 'verified.mp4');
    const bytes = Buffer.from('verified-export-bytes');
    await writeFile(artifactPath, bytes);
    const artifact = { artifactPath, sizeBytes: bytes.length, contentDigest: createHash('sha256').update(bytes).digest('hex') };
    const capability = ffmpeg.rememberVerifiedExportArtifact(11, artifact, ownerA, 1_000);
    expect(capability.reference).toMatch(/^vea1_[A-Za-z0-9_-]{43}$/u);
    await expect(ffmpeg.resolveVerifiedExportPublishCapability(11, capability.reference, ownerA, 2_000)).resolves.toEqual(artifact);
    await expect(ffmpeg.resolveVerifiedExportPublishCapability(12, capability.reference, ownerA, 2_000)).rejects.toMatchObject({ code: 'artifact-unavailable' });
    await expect(ffmpeg.resolveVerifiedExportPublishCapability(11, capability.reference, { ...ownerA, generation: ownerA.generation + 1 }, 2_000)).rejects.toMatchObject({ code: 'artifact-unavailable' });
    await expect(ffmpeg.resolveVerifiedExportPublishCapability(11, capability.reference, ownerB, 2_000)).rejects.toMatchObject({ code: 'artifact-unavailable' });
    await expect(ffmpeg.resolveVerifiedExportPublishCapability(11, capability.reference, ownerA, 3_601_001)).rejects.toMatchObject({ code: 'artifact-unavailable' });

    const fresh = ffmpeg.rememberVerifiedExportArtifact(11, artifact, ownerA);
    await writeFile(artifactPath, 'changed-export-bytes');
    await expect(ffmpeg.resolveVerifiedExportPublishCapability(11, fresh.reference, ownerA)).rejects.toMatchObject({ code: 'artifact-integrity-mismatch' });
  });

  it('rejects renderer filesystem fields and resolves the exact main-issued file before publishing', async () => {
    directory = await mkdtemp(join(tmpdir(), 'shortsflow-publish-ipc-'));
    const artifactPath = join(directory, 'verified.mp4');
    const bytes = Buffer.from('approved-video');
    await writeFile(artifactPath, bytes);
    const artifact = { artifactPath, sizeBytes: bytes.length, contentDigest: createHash('sha256').update(bytes).digest('hex') };
    const capability = ffmpeg.rememberVerifiedExportArtifact(11, artifact, ownerA);
    const resolve = vi.fn(ffmpeg.resolveVerifiedExportPublishCapability);
    const publish = vi.fn(async () => ({ remotePublishId: 'video-1', remoteUrl: null, state: 'published' }));
    const handlers = new Map<string, (event: unknown, input: unknown) => Promise<any>>();
    const electron = { app: { getPath: () => directory }, safeStorage: {}, ipcMain: { handle: (name: string, handler: any) => handlers.set(name, handler), removeHandler: vi.fn() } };
    let activeOwner: { ownerId: string; generation: number; signal: AbortSignal } = ownerA;
    const ownerContext = {
      capture: () => activeOwner,
      assertCurrent: vi.fn((candidate) => {
        if (candidate.ownerId !== activeOwner.ownerId || candidate.generation !== activeOwner.generation) throw new Error('owner changed');
      }),
    };
    registerYouTubeHandlers({ electron, ownerContext, service: {}, publishService: { initialize: async () => undefined, publish }, verifiedExportAuthority: { resolve } });
    const invoke = (input: unknown, senderId = 11) => handlers.get('youtube:publish')!({ sender: { id: senderId } }, input);
    const valid = publishRequest({ verifiedExportReference: capability.reference, artifactFingerprint: 'artifact-1' });

    for (const rawPath of ['C:\\Windows\\win.ini', '..\\..\\secret.txt', '\\\\server\\share\\secret.mp4', 'file:///C:/Windows/win.ini', artifactPath]) {
      const result = await invoke(publishRequest({ ...valid.artifact, artifactPath: rawPath, sizeBytes: artifact.sizeBytes, contentDigest: artifact.contentDigest }));
      expect(result).toMatchObject({ ok: false, error: { code: 'invalid-request' } });
    }
    expect(resolve).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();

    expect(await invoke(publishRequest({ verifiedExportReference: `vea1_${'Z'.repeat(43)}`, artifactFingerprint: 'artifact-1' }))).toMatchObject({ ok: false });
    expect(await invoke(valid, 12)).toMatchObject({ ok: false });
    activeOwner = ownerB;
    expect(await invoke(valid)).toMatchObject({ ok: false });
    activeOwner = { ...ownerA, generation: ownerA.generation + 1 };
    expect(await invoke(valid)).toMatchObject({ ok: false });
    activeOwner = ownerA;

    const expiredPath = join(directory, 'expired.mp4');
    await writeFile(expiredPath, bytes);
    const expired = ffmpeg.rememberVerifiedExportArtifact(11, { ...artifact, artifactPath: expiredPath }, ownerA, 0);
    expect(await invoke(publishRequest({ verifiedExportReference: expired.reference, artifactFingerprint: 'artifact-1' }))).toMatchObject({ ok: false });
    expect(publish).not.toHaveBeenCalled();

    expect(await invoke(valid)).toMatchObject({ ok: true, result: { remotePublishId: 'video-1' } });
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ artifact: { ...artifact, artifactFingerprint: 'artifact-1' } }), ownerA);
    expect(await invoke(valid)).toMatchObject({ ok: true });
    await writeFile(artifactPath, 'changed-after-verification');
    expect(await invoke(valid)).toMatchObject({ ok: false, error: { code: 'artifact-integrity-mismatch' } });
    expect(publish).toHaveBeenCalledTimes(2);
  });
});

function publishRequest(artifact: Record<string, unknown>) {
  return {
    jobId: 'job-1', idempotencyKey: 'idempotency-1', platform: 'youtube', approvalFingerprint: 'approval-1', approvedAt: '2026-09-04T00:00:00.000Z',
    target: { accountId: 'account-1', channelRef: 'UC-channel' }, account: { platform: 'youtube', accountId: 'account-1', accountRef: 'account-ref', channelRef: 'UC-channel', credentialRef: 'youtube_11111111-1111-1111-1111-111111111111' },
    artifact, metadata: { title: 'Title', description: '', caption: '', hashtags: [], visibility: 'private', language: null, category: null, audienceFlags: {} }, outboundDescription: '', recovery: { jobState: 'queued', remoteState: null, failureCode: null },
  };
}
