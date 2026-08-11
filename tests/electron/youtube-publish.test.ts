import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
import { access, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { createYouTubePublishService, createYouTubeTransport, parseConfirmedOffset, parseRetryAfter, processingState, youtubeMetadata } = require('../../electron/youtube-publish-service.cjs') as any;
const { createYouTubeUploadCheckpointStore } = require('../../electron/youtube-upload-checkpoints.cjs') as any;
const { openVerifiedArtifact } = require('../../electron/artifact-integrity.cjs') as any;
const { createArtifactSnapshotStore } = require('../../electron/artifact-snapshot.cjs') as any;
type FetchOptions = RequestInit & { duplex?: 'half' };

const request = {
  jobId: 'publish-job', idempotencyKey: 'publish-idempotency', platform: 'youtube', approvalFingerprint: 'approval', approvedAt: '2026-08-11T10:00:00.000Z',
  target: { accountId: 'account', channelRef: 'UC-channel' },
  account: { platform: 'youtube', accountId: 'account', accountRef: 'UC-channel', channelRef: 'UC-channel', credentialRef: 'youtube_00000000-0000-0000-0000-000000000000' },
  artifact: { artifactPath: 'C:/exports/video.mp4', artifactFingerprint: 'publish-artifact-1', contentDigest: 'a'.repeat(64), sizeBytes: 100 },
  metadata: { title: 'Video', description: 'Description', caption: '', hashtags: ['#shorts'], visibility: 'private', language: null, category: null, audienceFlags: {}, thumbnailPath: null, playlistRef: null, commentsEnabled: null },
  outboundDescription: 'Description',
};
function checkpointStore(events: string[] = []) { const values = new Map<string, any>(); return { values, get: vi.fn(async (key: string) => values.get(key) ?? null), list: vi.fn(async () => [...values.values()]), put: vi.fn(async (key: string, value: any) => { events.push(`put:${value.status}`); values.set(key, structuredClone(value)); return value; }), remove: vi.fn(async (key: string) => values.delete(key)) }; }
function fakeArtifact(events: string[] = []) { return { assertUnchanged: vi.fn(async () => undefined), createReadStream: vi.fn(() => Readable.from(['approved'])), close: vi.fn(async () => { events.push('close'); }) }; }
function dependencies(overrides: Record<string, unknown> = {}) {
  const events: string[] = []; const checkpoints = checkpointStore(events); const artifact = fakeArtifact(events);
  const snapshots = { create: vi.fn(async () => ({ snapshotPath: 'C:/trusted/snapshot.bin', sizeBytes: 100 })), assertManagedPath: vi.fn((value: string) => value), cleanupOrphans: vi.fn(async () => ({ removed: 0, failed: 0 })), remove: vi.fn(async () => true) };
  const transport: any = {
    createSession: vi.fn(async () => { events.push('create'); return 'https://upload.example/session-secret'; }),
    querySession: vi.fn(async () => { events.push('query'); return { state: 'incomplete', nextOffset: 0 }; }),
    upload: vi.fn(async () => { events.push('upload'); return { state: 'complete', videoId: 'video-1' }; }),
    getVideoStatus: vi.fn(async () => { events.push('status'); return { state: 'processing', reason: null }; }),
  };
  const auth = { resolveExecutionCredential: vi.fn(async () => ({ accessToken: 'access-secret', refreshToken: 'refresh-secret', channelId: 'UC-channel' })) };
  const openArtifact = vi.fn(async () => { events.push('open'); return artifact; });
  return { events, checkpoints, snapshots, transport, auth, openArtifact, artifact, ...overrides };
}
async function streamContents(stream: NodeJS.ReadableStream): Promise<Buffer> { const chunks: Buffer[] = []; for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)); return Buffer.concat(chunks); }

describe('modern YouTube resumable publishing', () => {
  it('checkpoints accepted bytes and reports processing until YouTube verifies them', async () => {
    const deps = dependencies(); const service = createYouTubePublishService(deps);
    await expect(service.publish(request)).resolves.toMatchObject({ remotePublishId: 'video-1', state: 'processing' });
    expect(deps.events).toEqual(['open', 'create', 'put:active', 'query', 'upload', 'put:complete', 'close', 'status']);
    expect(deps.checkpoints.put.mock.calls[0][1].sessionUri).toContain('session-secret');
    expect(deps.checkpoints.put.mock.calls[0][1].snapshotPath).toBe('C:/trusted/snapshot.bin'); expect(deps.snapshots.remove).toHaveBeenCalledWith('C:/trusted/snapshot.bin');
    expect(deps.checkpoints.values.size).toBe(1);
  });
  it('does not send media when checkpoint persistence fails and closes the trusted artifact', async () => {
    const deps = dependencies(); deps.checkpoints.put.mockRejectedValueOnce(Object.assign(new Error('storage'), { code: 'upload-checkpoint-storage-failed' }));
    await expect(createYouTubePublishService(deps).publish(request)).rejects.toMatchObject({ code: 'upload-checkpoint-storage-failed' });
    expect(deps.transport.upload).not.toHaveBeenCalled(); expect(deps.artifact.close).toHaveBeenCalledOnce(); expect(deps.snapshots.remove).toHaveBeenCalledWith('C:/trusted/snapshot.bin');
  });
  it('serializes the same logical attempt and creates at most one session', async () => {
    const deps = dependencies(); let release!: () => void;
    deps.transport.querySession.mockImplementation(async () => { await new Promise<void>((resolve) => { release = resolve; }); return { state: 'complete', videoId: 'video-concurrent' }; });
    const service = createYouTubePublishService(deps); const first = service.publish(request); const second = service.publish(request);
    await vi.waitFor(() => expect(deps.transport.createSession).toHaveBeenCalledTimes(1)); release();
    await expect(Promise.all([first, second])).resolves.toHaveLength(2); expect(deps.transport.createSession).toHaveBeenCalledTimes(1);
  });
  it('keeps the durable checkpoint reachable when an active media upload is cancelled locally', async () => {
    const deps = dependencies();
    deps.transport.upload.mockImplementation(({ signal }: { signal: AbortSignal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('interrupted'), { code: 'youtube-upload-interrupted', retryable: true })), { once: true })));
    const service = createYouTubePublishService(deps); const publishing = service.publish(request);
    await vi.waitFor(() => expect(deps.checkpoints.values.size).toBe(1));
    expect(service.cancel(request.jobId)).toBe(true);
    await expect(publishing).rejects.toMatchObject({ code: 'youtube-upload-interrupted' });
    expect([...deps.checkpoints.values.values()][0]).toMatchObject({ status: 'active', videoId: null }); expect(deps.snapshots.remove).not.toHaveBeenCalled();
  });
  it('survives restart while processing and later verifies exactly one publication', async () => {
    const deps = dependencies(); const first = createYouTubePublishService(deps);
    await expect(first.publish(request)).resolves.toMatchObject({ state: 'processing', remotePublishId: 'video-1' });
    deps.transport.getVideoStatus.mockResolvedValueOnce({ state: 'processing' });
    await expect(createYouTubePublishService(deps).reconcile(request)).resolves.toMatchObject({ state: 'processing', remotePublishId: 'video-1' });
    deps.transport.getVideoStatus.mockResolvedValueOnce({ state: 'published' });
    await expect(createYouTubePublishService(deps).reconcile(request)).resolves.toMatchObject({ state: 'published', remotePublishId: 'video-1' });
    expect(deps.transport.createSession).toHaveBeenCalledTimes(1); expect(deps.transport.upload).toHaveBeenCalledTimes(1); expect(deps.openArtifact).toHaveBeenCalledTimes(1); expect(deps.checkpoints.values.size).toBe(1);
  });
  it('keeps a completed upload reconciling after status verification interruption without another videos.insert', async () => {
    const deps = dependencies(); deps.transport.getVideoStatus.mockRejectedValueOnce(Object.assign(new Error('network'), { code: 'youtube-network-failure', retryable: true, status: 503 }));
    await expect(createYouTubePublishService(deps).publish(request)).resolves.toMatchObject({ state: 'unknown', remotePublishId: 'video-1', found: true });
    expect([...deps.checkpoints.values.values()][0]).toMatchObject({ status: 'complete', videoId: 'video-1' });
    deps.transport.getVideoStatus.mockResolvedValueOnce({ state: 'published' });
    await expect(createYouTubePublishService(deps).reconcile(request)).resolves.toMatchObject({ state: 'published', remotePublishId: 'video-1' });
    expect(deps.transport.createSession).toHaveBeenCalledTimes(1); expect(deps.transport.upload).toHaveBeenCalledTimes(1);
  });
  it('returns terminal processing failure without creating or acknowledging a receipt', async () => {
    const deps = dependencies(); deps.transport.getVideoStatus.mockResolvedValueOnce({ state: 'failed', reason: 'rejected' }); const service = createYouTubePublishService(deps);
    await expect(service.publish(request)).resolves.toMatchObject({ state: 'failed', remotePublishId: 'video-1' });
    expect(deps.checkpoints.values.size).toBe(1);
  });
  it('resumes only from the server-confirmed offset and rejects malformed ranges', async () => {
    const deps = dependencies(); deps.transport.querySession.mockResolvedValueOnce({ state: 'incomplete', nextOffset: 40 }); await createYouTubePublishService(deps).publish(request);
    expect(deps.transport.upload).toHaveBeenCalledWith(expect.objectContaining({ artifact: deps.artifact, startOffset: 40, sizeBytes: 100 }));
    expect(parseConfirmedOffset('bytes=0-39', 100)).toBe(40); expect(() => parseConfirmedOffset('bytes=40-50', 100)).toThrow(/invalid/i); expect(() => parseConfirmedOffset('bytes=0-100', 100)).toThrow(/out-of-range/i);
  });
  it('retains and reuses the same immutable snapshot for restart resume', async () => {
    const deps = dependencies(); deps.transport.upload.mockRejectedValueOnce(Object.assign(new Error('ambiguous'), { code: 'youtube-upload-ambiguous', retryable: true }));
    await expect(createYouTubePublishService(deps).publish(request)).rejects.toMatchObject({ code: 'youtube-upload-ambiguous' });
    expect(deps.snapshots.remove).not.toHaveBeenCalled(); expect(deps.snapshots.create).toHaveBeenCalledOnce();
    deps.transport.querySession.mockResolvedValueOnce({ state: 'incomplete', nextOffset: 40 });
    await expect(createYouTubePublishService(deps).publish(request)).resolves.toMatchObject({ remotePublishId: 'video-1' });
    expect(deps.snapshots.create).toHaveBeenCalledOnce(); expect(deps.openArtifact).toHaveBeenLastCalledWith(expect.objectContaining({ artifactPath: 'C:/trusted/snapshot.bin' })); expect(deps.transport.createSession).toHaveBeenCalledOnce();
  });
  it('does not create a replacement upload when an active session loses its snapshot', async () => {
    const deps = dependencies(); deps.transport.upload.mockRejectedValueOnce(Object.assign(new Error('ambiguous'), { code: 'youtube-upload-ambiguous', retryable: true }));
    await expect(createYouTubePublishService(deps).publish(request)).rejects.toMatchObject({ code: 'youtube-upload-ambiguous' });
    deps.transport.querySession.mockClear();
    deps.openArtifact.mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'artifact-missing' }));
    await expect(createYouTubePublishService(deps).publish(request)).rejects.toMatchObject({ code: 'youtube-upload-snapshot-missing', retryable: false }); expect(deps.transport.querySession).toHaveBeenCalledOnce(); expect(deps.transport.createSession).toHaveBeenCalledOnce(); expect(deps.snapshots.create).toHaveBeenCalledOnce();
  });
  it('recovers a completed active session before consulting a missing snapshot', async () => {
    const deps = dependencies(); deps.transport.upload.mockRejectedValueOnce(Object.assign(new Error('ambiguous'), { code: 'youtube-upload-ambiguous', retryable: true }));
    await expect(createYouTubePublishService(deps).publish(request)).rejects.toMatchObject({ code: 'youtube-upload-ambiguous' });
    deps.openArtifact.mockClear(); deps.openArtifact.mockRejectedValue(Object.assign(new Error('missing'), { code: 'artifact-missing' }));
    deps.transport.querySession.mockResolvedValueOnce({ state: 'complete', videoId: 'video-recovered-without-snapshot' });
    await expect(createYouTubePublishService(deps).reconcile(request)).resolves.toMatchObject({ state: 'processing', remotePublishId: 'video-recovered-without-snapshot' });
    expect(deps.openArtifact).not.toHaveBeenCalled(); expect(deps.transport.createSession).toHaveBeenCalledOnce(); expect(deps.transport.upload).toHaveBeenCalledOnce();
    expect([...deps.checkpoints.values.values()][0]).toMatchObject({ status: 'complete', videoId: 'video-recovered-without-snapshot' });
  });
  it('does not consult a missing snapshot or create a new session for an ambiguous session query', async () => {
    const deps = dependencies(); deps.transport.upload.mockRejectedValueOnce(Object.assign(new Error('ambiguous'), { code: 'youtube-upload-ambiguous', retryable: true }));
    await expect(createYouTubePublishService(deps).publish(request)).rejects.toMatchObject({ code: 'youtube-upload-ambiguous' });
    deps.openArtifact.mockClear(); deps.transport.querySession.mockRejectedValueOnce(Object.assign(new Error('unknown'), { code: 'youtube-upload-ambiguous', retryable: true }));
    await expect(createYouTubePublishService(deps).publish(request)).rejects.toMatchObject({ code: 'youtube-upload-ambiguous' });
    expect(deps.openArtifact).not.toHaveBeenCalled(); expect(deps.transport.createSession).toHaveBeenCalledOnce();
  });
  it('streams a partial file from the validated handle without whole-file buffering', async () => {
    const artifact = fakeArtifact(); const fetchImpl = vi.fn(async (_url: string, options: FetchOptions) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ id: 'video-streamed' }), options }));
    const transport = createYouTubeTransport({ fetchImpl });
    await expect(transport.upload({ sessionUri: 'https://upload.example/session', accessToken: 'secret', artifact, startOffset: 40, sizeBytes: 100, signal: new AbortController().signal })).resolves.toMatchObject({ videoId: 'video-streamed' });
    expect(artifact.createReadStream).toHaveBeenCalledWith(40); expect(artifact.assertUnchanged).toHaveBeenCalledTimes(2); expect(fetchImpl.mock.calls[0][1].headers).toMatchObject({ 'Content-Length': '60', 'Content-Range': 'bytes 40-99/100' });
  });
  it('treats a malformed successful final media response as an ambiguous remote outcome', async () => {
    const artifact = fakeArtifact();
    const transport = createYouTubeTransport({ fetchImpl: vi.fn(async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({}) })) });
    await expect(transport.upload({ sessionUri: 'https://upload.example/session', accessToken: 'access-secret', artifact, startOffset: 0, sizeBytes: 100, signal: new AbortController().signal })).rejects.toMatchObject({ code: 'youtube-upload-ambiguous', retryable: true });
    await expect(transport.querySession({ sessionUri: 'https://upload.example/session', accessToken: 'access-secret', sizeBytes: 100, signal: new AbortController().signal })).rejects.toMatchObject({ code: 'youtube-upload-response-invalid', retryable: true });
  });
  it('uploads immutable approved bytes even when the original path is replaced', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'shortsflow-toctou-')); const artifactPath = join(directory, 'video.mp4'); const movedPath = join(directory, 'approved-open.mp4');
    const approved = Buffer.from('approved-bytes'); const replacement = Buffer.from('replaced-bytes'); await writeFile(artifactPath, approved);
    const artifactRequest = { ...request.artifact, artifactPath, sizeBytes: approved.length, contentDigest: createHash('sha256').update(approved).digest('hex') }; let uploaded = Buffer.alloc(0);
    const deps = dependencies(); deps.openArtifact = openVerifiedArtifact; deps.snapshots = createArtifactSnapshotStore({ directory: join(directory, 'snapshots') });
    deps.transport.createSession = vi.fn(async () => { await rename(artifactPath, movedPath); await writeFile(artifactPath, replacement); return 'https://upload.example/session-secret'; });
    deps.transport.upload = vi.fn(async ({ artifact, startOffset }: any) => { await artifact.assertUnchanged(); uploaded = await streamContents(artifact.createReadStream(startOffset)); return { state: 'complete', videoId: 'video-original' }; });
    try { await createYouTubePublishService(deps).publish({ ...request, artifact: artifactRequest }); expect(uploaded).toEqual(approved); expect(await readFile(artifactPath)).toEqual(replacement); }
    finally { await rm(directory, { recursive: true, force: true }); }
  });
  it('keeps upload bytes immutable when the original is modified in place during upload', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'shortsflow-in-place-')); const artifactPath = join(directory, 'video.mp4'); const approved = Buffer.from('approved-bytes'); const replacement = Buffer.from('replaced-bytes'); await writeFile(artifactPath, approved);
    const artifactRequest = { ...request.artifact, artifactPath, sizeBytes: approved.length, contentDigest: createHash('sha256').update(approved).digest('hex') }; const deps = dependencies(); deps.openArtifact = openVerifiedArtifact; deps.snapshots = createArtifactSnapshotStore({ directory: join(directory, 'snapshots') }); let uploaded = Buffer.alloc(0);
    deps.transport.upload = vi.fn(async ({ artifact, startOffset }: { artifact: { createReadStream(offset: number): NodeJS.ReadableStream }; startOffset: number }) => { await writeFile(artifactPath, replacement); uploaded = await streamContents(artifact.createReadStream(startOffset)); return { state: 'complete', videoId: 'video-immutable' }; });
    try { await createYouTubePublishService(deps).publish({ ...request, artifact: artifactRequest }); expect(uploaded).toEqual(approved); expect(await readFile(artifactPath)).toEqual(replacement); }
    finally { await rm(directory, { recursive: true, force: true }); }
  });
  it('blocks every publishing remote side effect when the immutable snapshot digest mismatches', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'shortsflow-snapshot-mismatch-')); const artifactPath = join(directory, 'video.mp4'); await writeFile(artifactPath, Buffer.from('unapproved-bytes'));
    const deps = dependencies(); deps.openArtifact = openVerifiedArtifact; deps.snapshots = createArtifactSnapshotStore({ directory: join(directory, 'snapshots') });
    try { await expect(createYouTubePublishService(deps).publish({ ...request, artifact: { ...request.artifact, artifactPath, sizeBytes: 16, contentDigest: createHash('sha256').update('approved-content').digest('hex') } })).rejects.toMatchObject({ code: 'artifact-integrity-mismatch' }); expect(deps.transport.createSession).not.toHaveBeenCalled(); expect(deps.transport.querySession).not.toHaveBeenCalled(); expect(deps.transport.upload).not.toHaveBeenCalled(); expect(await readFile(artifactPath, 'utf8')).toBe('unapproved-bytes'); }
    finally { await rm(directory, { recursive: true, force: true }); }
  });
  it('closes the trusted handle after upload/provider failures and never opens it for auth failure', async () => {
    const uploadFailure = dependencies(); uploadFailure.transport.upload.mockRejectedValueOnce(Object.assign(new Error('ambiguous'), { code: 'youtube-upload-ambiguous', retryable: true }));
    await expect(createYouTubePublishService(uploadFailure).publish(request)).rejects.toMatchObject({ code: 'youtube-upload-ambiguous' }); expect(uploadFailure.artifact.close).toHaveBeenCalledOnce();
    const providerFailure = dependencies(); providerFailure.transport.createSession.mockRejectedValueOnce(Object.assign(new Error('rate'), { code: 'youtube-rate-limited', status: 429, retryable: true }));
    await expect(createYouTubePublishService(providerFailure).publish(request)).rejects.toMatchObject({ code: 'youtube-rate-limited' }); expect(providerFailure.artifact.close).toHaveBeenCalledOnce();
    const authFailure = dependencies({ auth: { resolveExecutionCredential: vi.fn(async () => { throw Object.assign(new Error('auth'), { code: 'credential-reconnect-required' }); }) } });
    await expect(createYouTubePublishService(authFailure).publish(request)).rejects.toMatchObject({ code: 'credential-reconnect-required' }); expect(authFailure.openArtifact).not.toHaveBeenCalled();
  });
  it('keeps completed recovery state until a matching durable receipt is acknowledged', async () => {
    const deps = dependencies(); deps.transport.getVideoStatus.mockResolvedValue({ state: 'published' }); const service = createYouTubePublishService(deps); await service.publish(request);
    expect(await service.acknowledgeReceipt({ ...request, remotePublishId: 'other' })).toBe(false); expect(deps.checkpoints.values.size).toBe(1);
    expect(await service.acknowledgeReceipt({ ...request, remotePublishId: 'video-1' })).toBe(true); expect(deps.checkpoints.values.size).toBe(0);
  });
  it('returns a definitively expired empty session to the fresh-upload path exactly once', async () => {
    const deps = dependencies(); deps.transport.upload.mockRejectedValueOnce(Object.assign(new Error('ambiguous'), { code: 'youtube-upload-ambiguous', retryable: true })); const service = createYouTubePublishService(deps);
    await expect(service.publish(request)).rejects.toMatchObject({ code: 'youtube-upload-ambiguous' }); deps.transport.querySession.mockRejectedValueOnce(Object.assign(new Error('expired'), { code: 'youtube-upload-session-expired', retryable: true }));
    await expect(service.reconcile(request)).resolves.toMatchObject({ found: false, state: 'unknown', restartRequired: true }); expect(deps.checkpoints.values.size).toBe(0); deps.transport.querySession.mockResolvedValueOnce({ state: 'complete', videoId: 'replacement-video' });
    await expect(service.publish(request)).resolves.toMatchObject({ remotePublishId: 'replacement-video', state: 'processing' }); expect(deps.transport.createSession).toHaveBeenCalledTimes(2);
  });
  it('returns an interrupted job with no checkpoint to fresh upload while retaining ambiguous evidence', async () => {
    const clean = dependencies(); const cleanService = createYouTubePublishService(clean);
    await expect(cleanService.reconcile({ ...request, recovery: { jobState: 'interrupted', remoteState: null, failureCode: null } })).resolves.toMatchObject({ found: false, restartRequired: true });
    expect(clean.transport.createSession).not.toHaveBeenCalled();
    await expect(cleanService.publish({ ...request, recovery: { jobState: 'queued', remoteState: null, failureCode: null } })).resolves.toMatchObject({ remotePublishId: 'video-1' });
    expect(clean.transport.createSession).toHaveBeenCalledOnce();

    const ambiguous = dependencies();
    const result = await createYouTubePublishService(ambiguous).reconcile({ ...request, recovery: { jobState: 'reconciling', remoteState: 'unknown', failureCode: 'youtube-upload-ambiguous' } });
    expect(result).toMatchObject({ found: false, state: 'unknown' }); expect(result).not.toHaveProperty('restartRequired');
    expect(ambiguous.transport.createSession).not.toHaveBeenCalled();
  });
  it.each([
    ['title', { metadata: { ...request.metadata, title: 'Changed title' } }],
    ['description', { metadata: { ...request.metadata, description: 'Changed description' }, outboundDescription: 'Changed description' }],
    ['tags', { metadata: { ...request.metadata, hashtags: ['#changed'] } }],
    ['visibility', { metadata: { ...request.metadata, visibility: 'unlisted' } }],
  ])('does not reuse a partially uploaded session after approved %s changes', async (_field, change) => {
    const deps = dependencies(); deps.transport.upload.mockRejectedValueOnce(Object.assign(new Error('ambiguous'), { code: 'youtube-upload-ambiguous', retryable: true }));
    await expect(createYouTubePublishService(deps).publish(request)).rejects.toMatchObject({ code: 'youtube-upload-ambiguous' });
    expect([...deps.checkpoints.values.values()][0]).toMatchObject({ approvalFingerprint: 'approval', status: 'active' });
    deps.transport.querySession.mockResolvedValueOnce({ state: 'incomplete', nextOffset: 20 });
    const changed = { ...request, ...change, approvalFingerprint: `approval-${_field}` };
    await expect(createYouTubePublishService(deps).reconcile(changed)).resolves.toMatchObject({ state: 'unknown', approvalMismatch: true });
    expect(deps.transport.createSession).toHaveBeenCalledOnce(); expect(deps.transport.upload).toHaveBeenCalledOnce();
    expect([...deps.checkpoints.values.values()][0]).toMatchObject({ approvalFingerprint: 'approval' });
  });
  it('retires only a zero-byte prior-approval session and never hijacks a remote-complete one', async () => {
    const empty = dependencies(); empty.transport.upload.mockRejectedValueOnce(Object.assign(new Error('ambiguous'), { code: 'youtube-upload-ambiguous', retryable: true }));
    await expect(createYouTubePublishService(empty).publish(request)).rejects.toMatchObject({ code: 'youtube-upload-ambiguous' });
    empty.transport.querySession.mockResolvedValueOnce({ state: 'incomplete', nextOffset: 0 });
    const changed = { ...request, approvalFingerprint: 'approval-new', metadata: { ...request.metadata, title: 'New title' } };
    await expect(createYouTubePublishService(empty).reconcile(changed)).resolves.toMatchObject({ restartRequired: true });
    expect(empty.checkpoints.values.size).toBe(0);

    const completed = dependencies(); await createYouTubePublishService(completed).publish(request);
    completed.transport.getVideoStatus.mockResolvedValueOnce({ state: 'published', reason: null });
    await expect(createYouTubePublishService(completed).reconcile(changed)).resolves.toMatchObject({ remotePublishId: 'video-1', state: 'published', approvalMismatch: true });
    expect(completed.transport.createSession).toHaveBeenCalledOnce(); expect(completed.checkpoints.values.size).toBe(1);
  });
  it('immediately starts one current-approval upload after retiring an authoritative zero-byte session', async () => {
    const deps = dependencies();
    deps.snapshots.create.mockResolvedValueOnce({ snapshotPath: 'C:/trusted/obsolete.bin', sizeBytes: 100 }).mockResolvedValueOnce({ snapshotPath: 'C:/trusted/current.bin', sizeBytes: 100 });
    deps.transport.upload.mockRejectedValueOnce(Object.assign(new Error('ambiguous'), { code: 'youtube-upload-ambiguous', retryable: true }));
    await expect(createYouTubePublishService(deps).publish(request)).rejects.toMatchObject({ code: 'youtube-upload-ambiguous' });
    expect([...deps.checkpoints.values.values()][0]).toMatchObject({ approvalFingerprint: 'approval', snapshotPath: 'C:/trusted/obsolete.bin', status: 'active' });
    deps.transport.querySession.mockResolvedValueOnce({ state: 'incomplete', nextOffset: 0 });
    const changed = { ...request, approvalFingerprint: 'approval-current', metadata: { ...request.metadata, title: 'Current approved title' } };
    const service = createYouTubePublishService(deps);
    const [first, second] = await Promise.all([service.publish(changed), service.publish(changed)]);
    expect(first).toMatchObject({ state: 'processing', remotePublishId: 'video-1' });
    expect(second).toEqual(first);
    expect(first).not.toHaveProperty('restartRequired'); expect(first).not.toHaveProperty('approvalMismatch');
    expect(deps.transport.createSession).toHaveBeenCalledTimes(2);
    expect(deps.transport.createSession.mock.calls[1][0].metadata.snippet.title).toBe('Current approved title');
    expect(deps.snapshots.remove).toHaveBeenCalledWith('C:/trusted/obsolete.bin');
    expect([...deps.checkpoints.values.values()][0]).toMatchObject({ approvalFingerprint: 'approval-current', status: 'complete', videoId: 'video-1' });
    const secondSessionPut = deps.checkpoints.put.mock.calls.findIndex(([, checkpoint]: [string, any]) => checkpoint.approvalFingerprint === 'approval-current' && checkpoint.status === 'active');
    const completedPut = deps.checkpoints.put.mock.calls.findIndex(([, checkpoint]: [string, any]) => checkpoint.approvalFingerprint === 'approval-current' && checkpoint.status === 'complete');
    expect(secondSessionPut).toBeGreaterThan(-1); expect(completedPut).toBeGreaterThan(secondSessionPut);
    expect(deps.transport.upload).toHaveBeenCalledTimes(2);
    expect(deps.checkpoints.put.mock.invocationCallOrder[secondSessionPut]).toBeLessThan(deps.transport.upload.mock.invocationCallOrder[1]);
  });
  it('never converts an ambiguous or known-video recovery into a fresh upload', async () => {
    const ambiguous = dependencies(); ambiguous.transport.upload.mockRejectedValueOnce(Object.assign(new Error('ambiguous'), { code: 'youtube-upload-ambiguous', retryable: true }));
    await expect(createYouTubePublishService(ambiguous).publish(request)).rejects.toMatchObject({ code: 'youtube-upload-ambiguous' }); ambiguous.transport.querySession.mockRejectedValueOnce(Object.assign(new Error('ambiguous'), { code: 'youtube-upload-ambiguous', retryable: true }));
    await expect(createYouTubePublishService(ambiguous).reconcile(request)).rejects.toMatchObject({ code: 'youtube-upload-ambiguous' }); expect(ambiguous.transport.createSession).toHaveBeenCalledOnce();
    const known = dependencies(); await createYouTubePublishService(known).publish(request); known.transport.getVideoStatus.mockRejectedValueOnce(Object.assign(new Error('transient'), { code: 'youtube-provider-transient', retryable: true }));
    await expect(createYouTubePublishService(known).reconcile(request)).resolves.toMatchObject({ state: 'unknown', remotePublishId: 'video-1' }); expect(known.transport.createSession).toHaveBeenCalledOnce();
  });
  it('classifies authoritative YouTube processing states', () => {
    expect(processingState({ items: [{ id: 'video', status: { uploadStatus: 'uploaded' }, processingDetails: { processingStatus: 'processing' } }] }, 'video')).toMatchObject({ state: 'processing' });
    expect(processingState({ items: [{ id: 'video', status: { uploadStatus: 'processed' }, processingDetails: { processingStatus: 'succeeded' } }] }, 'video')).toMatchObject({ state: 'published' });
    expect(processingState({ items: [{ id: 'video', status: { uploadStatus: 'rejected', rejectionReason: 'termsOfUse' } }] }, 'video')).toMatchObject({ state: 'failed' });
    expect(processingState({ items: [] }, 'video')).toMatchObject({ state: 'unknown', reason: 'video-unavailable' });
  });
  it('uses the exact prevalidated outbound description and blocks an over-limit value before session creation', async () => {
    const composed = `${'d'.repeat(4997)}\n\nc`;
    expect(youtubeMetadata(request.metadata, composed).snippet.description).toBe(composed);
    expect(youtubeMetadata({ ...request.metadata, description: 'description', caption: '' }, 'description').snippet.description).toBe('description');
    const deps = dependencies();
    await expect(createYouTubePublishService(deps).publish({ ...request, outboundDescription: 'x'.repeat(5001) })).rejects.toMatchObject({ code: 'youtube-description-too-long', retryable: false });
    expect(deps.transport.createSession).not.toHaveBeenCalled(); expect(deps.transport.querySession).not.toHaveBeenCalled(); expect(deps.transport.upload).not.toHaveBeenCalled();
  });
  it.each([
    { thumbnailPath: 'C:/thumb.jpg' },
    { playlistRef: 'playlist-1' },
    { commentsEnabled: false },
  ])('blocks unsupported approved YouTube options before creating a remote session', async (unsupportedMetadata) => {
    const deps = dependencies();
    await expect(createYouTubePublishService(deps).publish({ ...request, metadata: { ...request.metadata, ...unsupportedMetadata } })).rejects.toMatchObject({ code: 'youtube-option-unsupported', retryable: false });
    expect(deps.transport.createSession).not.toHaveBeenCalled(); expect(deps.transport.querySession).not.toHaveBeenCalled(); expect(deps.transport.upload).not.toHaveBeenCalled();
  });
  it('queries authoritative video status without exposing credentials in the URL', async () => {
    const fetchImpl = vi.fn(async (_url: string, _options: FetchOptions) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ items: [{ id: 'video/id', status: { uploadStatus: 'processed' }, processingDetails: { processingStatus: 'succeeded' } }] }) }));
    const transport = createYouTubeTransport({ fetchImpl }); await expect(transport.getVideoStatus({ accessToken: 'access-secret', videoId: 'video/id', signal: new AbortController().signal })).resolves.toMatchObject({ state: 'published' });
    const [calledUrl, calledOptions] = fetchImpl.mock.calls[0]!; expect(calledUrl).toContain('video%2Fid'); expect(calledUrl).not.toContain('access-secret'); expect((calledOptions.headers as Record<string, string>).Authorization).toBe('Bearer access-secret');
  });
  it('preserves provider cooldown and transient classification from processing-status lookup', async () => {
    const rateLimitedFetch = vi.fn(async (_url: string, _options: FetchOptions) => ({ ok: false, status: 429, headers: { get: (name: string) => name.toLowerCase() === 'retry-after' ? '120' : null }, json: async () => ({ error: { errors: [{ reason: 'rateLimitExceeded' }] } }) }));
    const rateLimited = createYouTubeTransport({ fetchImpl: rateLimitedFetch }); const before = Date.now();
    await expect(rateLimited.getVideoStatus({ accessToken: 'secret', videoId: 'video', signal: new AbortController().signal })).rejects.toMatchObject({ code: 'youtube-rate-limited', retryable: true, status: 429, retryAfterUtc: expect.any(String) });
    try { await rateLimited.getVideoStatus({ accessToken: 'secret', videoId: 'video', signal: new AbortController().signal }); } catch (error) { expect(Date.parse((error as { retryAfterUtc: string }).retryAfterUtc)).toBeGreaterThanOrEqual(before + 119_000); }
    const transientFetch = vi.fn(async (_url: string, _options: FetchOptions) => ({ ok: false, status: 503, headers: { get: () => null }, json: async () => ({}) }));
    await expect(createYouTubeTransport({ fetchImpl: transientFetch }).getVideoStatus({ accessToken: 'secret', videoId: 'video', signal: new AbortController().signal })).rejects.toMatchObject({ code: 'youtube-provider-transient', retryable: true, status: 503 });
  });
  it('preserves known remote identity and HTTP-date cooldown across status failures', async () => {
    const deps = dependencies(); await createYouTubePublishService(deps).publish(request);
    const retryAfterUtc = 'Tue, 11 Aug 2099 15:30:00 GMT';
    deps.transport.getVideoStatus.mockRejectedValueOnce(Object.assign(new Error('rate limited'), { code: 'youtube-rate-limited', retryable: true, status: 429, retryAfterUtc: new Date(retryAfterUtc).toISOString() }));
    await expect(createYouTubePublishService(deps).reconcile(request)).resolves.toMatchObject({ found: true, state: 'unknown', remotePublishId: 'video-1', retryAfterUtc: new Date(retryAfterUtc).toISOString() });
    deps.transport.getVideoStatus.mockRejectedValueOnce(Object.assign(new Error('provider'), { code: 'youtube-provider-transient', retryable: true, status: 503 }));
    await expect(createYouTubePublishService(deps).reconcile(request)).resolves.toMatchObject({ found: true, state: 'unknown', remotePublishId: 'video-1' });
    expect(deps.transport.createSession).toHaveBeenCalledOnce();
  });
  it('parses delta-seconds and HTTP-date Retry-After values without negative or invalid delays', () => {
    const nowMs = Date.parse('2026-08-11T12:00:00.000Z');
    expect(parseRetryAfter('120', nowMs)).toBe('2026-08-11T12:02:00.000Z');
    expect(parseRetryAfter('Tue, 11 Aug 2026 12:05:00 GMT', nowMs)).toBe('2026-08-11T12:05:00.000Z');
    expect(parseRetryAfter('not-a-date', nowMs)).toBeNull();
    expect(parseRetryAfter('Tue, 11 Aug 2026 11:59:00 GMT', nowMs)).toBeNull();
  });
  it.each([{ status: 401, code: 'credential-reconnect-required' }, { status: 429, code: 'youtube-rate-limited' }, { status: 400, code: 'youtube-publish-validation-failed' }, { status: 503, code: 'youtube-provider-transient' }])('classifies provider status $status as $code', async ({ status, code }) => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status, headers: { get: () => null }, json: async () => ({ error: { errors: [] } }) })); const transport = createYouTubeTransport({ fetchImpl });
    await expect(transport.createSession({ accessToken: 'secret', metadata: {}, sizeBytes: 100, signal: new AbortController().signal })).rejects.toMatchObject({ code });
  });
  it('encrypts resumable session URIs in restart-safe main-process storage', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'shortsflow-upload-checkpoint-')); const safeStorage = { isEncryptionAvailable: () => true, getSelectedStorageBackend: () => 'dpapi', encryptString: (value: string) => Buffer.from(`encrypted:${value}`), decryptString: (value: Buffer) => value.toString().replace(/^encrypted:/, '') };
    try { const store = createYouTubeUploadCheckpointStore({ userDataPath: directory, safeStorage }); await store.put('identity', { sessionUri: 'https://upload.example/private-session', status: 'active' }); const disk = await readFile(store.filePath, 'utf8'); expect(disk).not.toContain('private-session'); expect(await createYouTubeUploadCheckpointStore({ userDataPath: directory, safeStorage }).get('identity')).toMatchObject({ status: 'active' }); }
    finally { await rm(directory, { recursive: true, force: true }); }
  });
  it('cleans only unreferenced ShortsFlow upload snapshots and is idempotent', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'shortsflow-orphan-snapshots-')); const snapshotDirectory = join(directory, 'snapshots');
    const store = createArtifactSnapshotStore({ directory: snapshotDirectory });
    const referenced = join(snapshotDirectory, 'snapshot-11111111-1111-1111-1111-111111111111.bin'); const orphan = join(snapshotDirectory, 'snapshot-22222222-2222-2222-2222-222222222222.bin'); const unrelated = join(snapshotDirectory, 'user-file.bin');
    try {
      await mkdir(snapshotDirectory, { recursive: true });
      await writeFile(referenced, 'referenced'); await writeFile(orphan, 'orphan'); await writeFile(unrelated, 'unrelated');
      await expect(store.cleanupOrphans([referenced])).resolves.toEqual({ removed: 1, failed: 0 });
      await expect(access(referenced)).resolves.toBeUndefined(); await expect(access(orphan)).rejects.toMatchObject({ code: 'ENOENT' }); await expect(access(unrelated)).resolves.toBeUndefined();
      await expect(store.cleanupOrphans([referenced])).resolves.toEqual({ removed: 0, failed: 0 });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it('continues orphan cleanup after one owned snapshot deletion fails', async () => {
    const failed = 'snapshot-11111111-1111-1111-1111-111111111111.bin'; const removable = 'snapshot-22222222-2222-2222-2222-222222222222.bin'; const removed: string[] = [];
    const fsApi = { readdir: vi.fn(async () => [{ name: failed, isFile: () => true }, { name: removable, isFile: () => true }, { name: 'unrelated.txt', isFile: () => true }]), chmod: vi.fn(async () => undefined), rm: vi.fn(async (value: string) => { if (value.endsWith(failed)) throw new Error('locked'); removed.push(value); }) };
    const store = createArtifactSnapshotStore({ directory: 'C:/trusted/youtube-upload-snapshots', fsApi });
    await expect(store.cleanupOrphans([])).resolves.toEqual({ removed: 1, failed: 1 }); expect(removed).toHaveLength(1); expect(removed[0]).toContain(removable);
  });
  it('runs bounded orphan cleanup from service recovery initialization', async () => {
    const deps = dependencies(); const referenced = 'C:/trusted/snapshot.bin';
    deps.checkpoints.list = vi.fn(async () => [{ status: 'active', snapshotPath: referenced }, { status: 'complete', snapshotPath: 'C:/trusted/complete.bin' }]);
    deps.snapshots.cleanupOrphans = vi.fn(async () => ({ removed: 1, failed: 0 }));
    const service = createYouTubePublishService(deps);
    await expect(service.initialize()).resolves.toEqual({ removed: 1, failed: 0 });
    expect(deps.snapshots.cleanupOrphans).toHaveBeenCalledWith([referenced, 'C:/trusted/complete.bin']);
  });
  it('blocks every publishing remote call when artifact integrity or channel binding fails', async () => {
    const integrity = dependencies({ openArtifact: vi.fn(async () => { throw Object.assign(new Error('changed'), { code: 'artifact-integrity-mismatch' }); }) });
    await expect(createYouTubePublishService(integrity).publish(request)).rejects.toMatchObject({ code: 'artifact-integrity-mismatch' }); expect(integrity.transport.createSession).not.toHaveBeenCalled(); expect(integrity.transport.querySession).not.toHaveBeenCalled(); expect(integrity.transport.upload).not.toHaveBeenCalled();
    const mismatch = dependencies({ auth: { resolveExecutionCredential: vi.fn(async () => ({ accessToken: 'secret', channelId: 'UC-other' })) } });
    await expect(createYouTubePublishService(mismatch).publish(request)).rejects.toMatchObject({ code: 'youtube-channel-mismatch' }); expect(mismatch.transport.createSession).not.toHaveBeenCalled();
  });
});
