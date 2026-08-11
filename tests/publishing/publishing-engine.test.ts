import { describe, expect, it, vi } from 'vitest';
import { approvalFingerprint, artifactFingerprint, classifyPublishFailure, composeYouTubeDescription, createPublishAdapterRegistry, createPublishQueue, evaluatePublishReadiness, idempotencyKey, isScheduleDue, isTerminalPublishJob, normalizePublishFailure, normalizePublishQueue, validatePublishMetadata, type PublishJob } from '@/core/publishing';
import { createPublishingApplicationService } from '@/services/publishingApplicationService';

const artifact = { path: 'C:/exports/video.mp4', sizeBytes: 100, durationMs: 1000, contentDigest: 'a'.repeat(64), verified: true, diagnostics: {}, createdAt: 'now' };
const metadata = { title: 'A title', description: 'Description', hashtags: ['#shorts'], caption: 'Caption', visibility: 'private' as const, language: null, category: null, audienceFlags: {}, thumbnailPath: null, playlistRef: null, commentsEnabled: null };
const baseJob = (state: PublishJob['state'] = 'queued'): PublishJob => { const value: PublishJob = { id: 'job-1', projectId: 'p1', variantId: 'v1', target: { platform: 'youtube', accountId: 'a1', channelRef: 'c1' }, accountBinding: { id: 'a1', platform: 'youtube', accountRef: 'account-1', displayName: 'Account', channelRef: 'c1', credentialRef: 'credential-ref', authenticated: true, createdAt: 'now' }, artifact: { artifactPath: artifact.path, artifactFingerprint: 'artifact-1', projectId: 'p1', variantId: 'v1', exportJobId: 'e1', verified: true, sizeBytes: 100, durationMs: 1000, contentDigest: artifact.contentDigest, diagnostics: {}, sourceManifestFingerprint: 'source-1' }, metadata, schedule: { mode: 'now', scheduledAtUtc: null, timezone: 'UTC' }, state, progress: { state, percent: 0, message: '', remoteState: null, updatedAt: 'now' }, readiness: { ready: true, status: 'safe', issues: [], warnings: [], diagnostics: [] }, idempotencyKey: 'idem-1', approvalFingerprint: null, approvedAt: 'now', attempts: [], maxAttempts: 3, failure: null, receipt: null, remotePublishId: null, createdAt: 'now', updatedAt: 'now' }; return { ...value, approvalFingerprint: approvalFingerprint(value) }; };

describe('Epic 7.8 publishing engine', () => {
  it.each(['youtube', 'tiktok', 'instagram'] as const)('reports honest capability for %s', (platform) => { const capability = createPublishAdapterRegistry().get(platform).capability(); expect(capability.adapterStatus).toBe(platform === 'youtube' ? 'implemented' : 'planned-only'); });
  it('routes the real YouTube adapter through the narrow trusted publishing client', async () => { const publish = vi.fn(async (_request: unknown) => ({ ok: true as const, result: { remotePublishId: 'video-1', remoteUrl: 'https://www.youtube.com/watch?v=video-1', state: 'published' as const } })); const client = { publish, reconcilePublish: vi.fn(), cancelPublish: vi.fn(), acknowledgeReceipt: vi.fn() } as any; const adapter = createPublishAdapterRegistry(client).get('youtube'); await expect(adapter.publish({ job: baseJob(), signal: new AbortController().signal, report: vi.fn() })).resolves.toMatchObject({ remotePublishId: 'video-1' }); const payload = publish.mock.calls[0][0]; expect(payload).toMatchObject({ jobId: 'job-1', platform: 'youtube', account: { credentialRef: 'credential-ref', channelRef: 'c1' }, artifact: { contentDigest: artifact.contentDigest, sizeBytes: 100 } }); expect(JSON.stringify(payload)).not.toContain('accessToken'); expect(JSON.stringify(payload)).not.toContain('sessionUri'); });
  it('keeps credential-resolution failures in authentication or retryable recovery classes before any upload side effect', () => {
    const missing = Object.assign(new Error('Missing credential.'), { code: 'credential-missing', status: 401, retryable: false });
    const unavailable = Object.assign(new Error('Secure storage unavailable.'), { code: 'secure-storage-unavailable', status: 503, retryable: true });
    const refresh = Object.assign(new Error('Refresh failed.'), { code: 'credential-refresh-failed', status: 503, retryable: true });
    expect(normalizePublishFailure(missing, 1, 3)).toMatchObject({ kind: 'authentication', code: 'credential-missing', retryable: false });
    expect(classifyPublishFailure(unavailable)).toBe('network'); expect(normalizePublishFailure(unavailable, 1, 3).retryable).toBe(true);
    expect(classifyPublishFailure(refresh)).toBe('network'); expect(normalizePublishFailure(refresh, 1, 3).retryable).toBe(true);
  });
  it('blocks unverified, zero-byte and pseudo artifacts', () => { const result = evaluatePublishReadiness({ artifact: { ...artifact, verified: false, sizeBytes: 0, path: 'render-plan://plan' }, target: { platform: 'youtube', accountId: 'a', channelRef: null }, metadata, projectId: 'p', sourceManifestFingerprint: 'f' }); expect(result.ready).toBe(false); expect(result.issues.length).toBeGreaterThan(2); });
  it.each(['', 'x'.repeat(101)])('validates title constraints', (title) => { const result = validatePublishMetadata({ ...metadata, title }, createPublishAdapterRegistry().get('youtube').capability()); expect(result.issues.some((item) => item.field === 'title')).toBe(true); });
  it('validates the exact composed YouTube description used by the adapter', () => {
    const capability = createPublishAdapterRegistry().get('youtube').capability();
    const exact = { ...metadata, description: 'd'.repeat(4997), caption: 'c' };
    const over = { ...metadata, description: 'd'.repeat(4998), caption: 'c' };
    expect(composeYouTubeDescription(exact)).toHaveLength(5000); expect(validatePublishMetadata(exact, capability).issues).toHaveLength(0);
    expect(composeYouTubeDescription(over)).toHaveLength(5001); expect(validatePublishMetadata(over, capability).issues).toContainEqual(expect.objectContaining({ code: 'description-too-long', field: 'description' }));
    expect(composeYouTubeDescription({ ...metadata, description: 'description', caption: '' })).toBe('description');
    expect(approvalFingerprint({ ...baseJob(), metadata: exact })).not.toBe(approvalFingerprint({ ...baseJob(), metadata: over }));
  });
  it.each([
    ['thumbnailPath', 'C:/thumb.jpg'],
    ['playlistRef', 'playlist-1'],
    ['commentsEnabled', true],
  ] as const)('blocks unsupported approved YouTube option %s before execution', (field, value) => {
    const result = validatePublishMetadata({ ...metadata, [field]: value }, createPublishAdapterRegistry().get('youtube').capability());
    expect(result.issues).toContainEqual(expect.objectContaining({ field }));
    expect(evaluatePublishReadiness({ artifact, target: baseJob().target, metadata: { ...metadata, [field]: value }, projectId: 'p1', sourceManifestFingerprint: 'source-1' }).ready).toBe(false);
  });
  it('keeps idempotency stable and target-bound', () => { const input = { artifactFingerprint: 'a', target: { platform: 'youtube' as const, accountId: 'account', channelRef: 'channel' }, intent: 'revision-1' }; expect(idempotencyKey(input)).toBe(idempotencyKey(input)); expect(idempotencyKey({ ...input, target: { ...input.target, accountId: 'other' } })).not.toBe(idempotencyKey(input)); });
  it('binds artifact and approval fingerprints to the verified content digest', () => { const job = baseJob(); const changed = { ...job, artifact: { ...job.artifact, contentDigest: 'b'.repeat(64) } }; expect(artifactFingerprint({ ...artifact, contentDigest: 'b'.repeat(64) })).not.toBe(artifactFingerprint(artifact)); expect(approvalFingerprint(changed)).not.toBe(approvalFingerprint(job)); expect(evaluatePublishReadiness({ artifact: { ...artifact, contentDigest: null }, target: job.target, metadata, projectId: job.projectId, sourceManifestFingerprint: 'source-1' }).ready).toBe(false); });
  it('normalizes in-flight jobs to interrupted and retains persisted artifact integrity metadata', () => { const snapshot = normalizePublishQueue({ jobs: [baseJob('uploading'), baseJob('processing')], activeJobId: 'job-1', paused: false }); expect(snapshot.activeJobId).toBeNull(); expect(snapshot.jobs.every((job) => job.state === 'interrupted')).toBe(true); expect(snapshot.jobs.every((job) => job.artifact.contentDigest === artifact.contentDigest && job.artifact.sizeBytes === artifact.sizeBytes)).toBe(true); expect(normalizePublishQueue(snapshot)).toEqual(snapshot); });
  it('does not run scheduled jobs before their UTC time', async () => { const run = vi.fn(async () => ({ jobId: 'job-1', remotePublishId: 'remote', platform: 'youtube' as const, accountRef: 'a', publishedAt: 'now', artifactFingerprint: 'a', metadataFingerprint: 'm', scheduleIntent: { mode: 'scheduled' as const, scheduledAtUtc: '2099-01-01T00:00:00.000Z', timezone: 'UTC' }, remoteUrl: null, verification: { valid: true, remotePublishId: 'remote', remoteState: 'published' as const, checkedAt: 'now', issues: [] } })); const queue = createPublishQueue({ run, reconcile: async (job) => job, cancel: async () => true }); queue.enqueue({ ...baseJob(), schedule: { mode: 'scheduled', scheduledAtUtc: '2099-01-01T00:00:00.000Z', timezone: 'UTC' }, state: 'scheduled' }); await queue.start(new Date('2026-01-01T00:00:00.000Z')); expect(run).not.toHaveBeenCalled(); expect(isScheduleDue(queue.list()[0].schedule, new Date('2026-01-01T00:00:00.000Z'))).toBe(false); });
  it('deduplicates enqueue by logical idempotency key', () => { const queue = createPublishQueue({ run: async () => { throw new Error('not called'); }, reconcile: async (job) => job, cancel: async () => true }); const first = baseJob(); expect(queue.enqueue(first)).toBe(first); expect(queue.enqueue({ ...first, id: 'different-id' })).toBe(first); expect(queue.list()).toHaveLength(1); });
  it('aborts an active upload locally but keeps its checkpoint-recoverable outcome under reconciliation', async () => {
    let rejectUpload!: (error: Error) => void; const checkpoint = { persisted: true };
    const run = vi.fn(async () => new Promise<never>((_resolve, reject) => { rejectUpload = reject; }));
    const cancel = vi.fn(async () => { rejectUpload(Object.assign(new Error('interrupted'), { code: 'youtube-upload-interrupted', retryable: true, status: 503 })); return true; });
    const reconcile = vi.fn(async (job: PublishJob) => ({
      ...job,
      state: 'published' as const,
      remotePublishId: 'recovered-video',
      receipt: { jobId: job.id, remotePublishId: 'recovered-video', platform: 'youtube' as const, accountRef: job.accountBinding.accountRef, publishedAt: 'later', artifactFingerprint: job.artifact.artifactFingerprint, metadataFingerprint: 'metadata', scheduleIntent: job.schedule, remoteUrl: null, verification: { valid: true, remotePublishId: 'recovered-video', remoteState: 'published' as const, checkedAt: 'later', issues: [] } },
    }));
    const queue = createPublishQueue({ run, reconcile, cancel }); const job = baseJob(); queue.enqueue(job); const started = queue.start(); await vi.waitFor(() => expect(queue.get(job.id)?.state).toBe('uploading'));
    await expect(queue.cancel(job.id)).resolves.toBe(false); await started;
    expect(cancel).toHaveBeenCalledWith(job.id); expect(checkpoint.persisted).toBe(true); expect(queue.get(job.id)).toMatchObject({ state: 'reconciling', receipt: null });
    await queue.reconcile(job.id); expect(queue.get(job.id)).toMatchObject({ state: 'published', remotePublishId: 'recovered-video', receipt: { remotePublishId: 'recovered-video' } });
  });
  it('keeps an accepted but unverified upload in reconciliation without a receipt', async () => { const queue = createPublishQueue({ run: async (job) => ({ jobId: job.id, remotePublishId: 'remote', platform: 'youtube' as const, accountRef: 'a', publishedAt: 'now', artifactFingerprint: 'a', metadataFingerprint: 'm', scheduleIntent: job.schedule, remoteUrl: null, verification: { valid: false, remotePublishId: 'remote', remoteState: 'processing' as const, checkedAt: 'now', issues: ['processing'] } }), reconcile: async (job) => job, cancel: async () => true }); const job = baseJob(); queue.enqueue(job); await queue.start(); expect(queue.get(job.id)).toMatchObject({ state: 'reconciling', remotePublishId: 'remote', receipt: null, progress: { remoteState: 'processing' } }); });
  it('keeps an accepted remote upload reconciling when local cancellation cannot delete it', async () => {
    const cancel = vi.fn(async () => false);
    const reconcile = vi.fn(async (job: PublishJob) => ({
      ...job,
      state: 'published' as const,
      receipt: { jobId: job.id, remotePublishId: job.remotePublishId!, platform: 'youtube' as const, accountRef: job.accountBinding.accountRef, publishedAt: 'later', artifactFingerprint: job.artifact.artifactFingerprint, metadataFingerprint: 'metadata', scheduleIntent: job.schedule, remoteUrl: null, verification: { valid: true, remotePublishId: job.remotePublishId!, remoteState: 'published' as const, checkedAt: 'later', issues: [] } },
    }));
    const queue = createPublishQueue({ run: async () => { throw new Error('not called'); }, reconcile, cancel });
    const accepted = { ...baseJob('reconciling'), remotePublishId: 'remote-video', nextReconcileAt: null, progress: { ...baseJob().progress, state: 'reconciling' as const, remoteState: 'processing' } };
    queue.hydrate({ jobs: [accepted], activeJobId: null, paused: true });
    await expect(queue.cancel(accepted.id)).resolves.toBe(false);
    expect(cancel).toHaveBeenCalledWith(accepted.id); expect(queue.get(accepted.id)).toMatchObject({ state: 'reconciling', remotePublishId: 'remote-video', receipt: null, progress: { remoteState: 'processing' } });
    await queue.reconcile(accepted.id); expect(reconcile).toHaveBeenCalledOnce(); expect(queue.get(accepted.id)).toMatchObject({ state: 'published', remotePublishId: 'remote-video', receipt: { remotePublishId: 'remote-video' } });
  });
  it('keeps ambiguous remote outcomes reconciling while ordinary queued jobs still cancel', async () => {
    const cancel = vi.fn(async () => false); const queue = createPublishQueue({ run: async () => { throw new Error('not called'); }, reconcile: async (job) => job, cancel });
    const ambiguous = { ...baseJob('failed'), failure: { kind: 'remote-processing' as const, code: 'youtube-upload-ambiguous', message: 'Unknown remote outcome.', retryable: true, attempt: 1, maxAttempts: 3, retryAfterUtc: null, stderrTail: [] } };
    queue.hydrate({ jobs: [ambiguous], activeJobId: null, paused: true }); await expect(queue.cancel(ambiguous.id)).resolves.toBe(false); expect(queue.get(ambiguous.id)?.state).toBe('reconciling'); expect(cancel).toHaveBeenCalledWith(ambiguous.id);
    const local = { ...baseJob(), id: 'local-job', idempotencyKey: 'local-idempotency' }; queue.hydrate({ jobs: [local], activeJobId: null, paused: true }); await expect(queue.cancel(local.id)).resolves.toBe(true); expect(queue.get(local.id)?.state).toBe('cancelled');
  });
  it('routes a newly ambiguous upload directly to reconciliation instead of a blind upload retry', async () => {
    const run = vi.fn(async () => { throw Object.assign(new Error('ambiguous'), { code: 'youtube-upload-ambiguous', status: 503, retryable: true }); });
    const reconcile = vi.fn(async (job: PublishJob) => ({ ...job, state: 'reconciling' as const, nextReconcileAt: '2099-01-01T00:00:00.000Z' }));
    const queue = createPublishQueue({ run, reconcile, cancel: async () => false }); queue.enqueue(baseJob());
    await queue.start(new Date('2026-08-11T00:00:00.000Z'));
    expect(queue.get('job-1')).toMatchObject({ state: 'reconciling', failure: null, progress: { remoteState: 'unknown' } }); expect(run).toHaveBeenCalledOnce();
    await queue.start(new Date('2099-01-01T00:00:01.000Z')); expect(reconcile).toHaveBeenCalledOnce(); expect(run).toHaveBeenCalledOnce();
  });
  it('separates processing reconciliation polls from upload attempts and honors provider cooldowns', async () => {
    const retryAfterUtc = '2099-01-01T01:00:00.000Z'; let polls = 0;
    const reconcile = vi.fn(async (job: PublishJob) => {
      polls += 1;
      if (polls <= 5) return { ...job, state: 'reconciling' as const, nextReconcileAt: null, progress: { ...job.progress, state: 'reconciling' as const, remoteState: 'processing', updatedAt: 'poll' } };
      if (polls === 6) throw Object.assign(new Error('rate limited'), { code: 'youtube-rate-limited', status: 429, retryable: true, retryAfterUtc });
      return { ...job, state: 'failed' as const, nextReconcileAt: null, failure: { kind: 'remote-processing' as const, code: 'youtube-processing-failed', message: 'rejected', retryable: false, attempt: job.attempts.length, maxAttempts: job.maxAttempts, retryAfterUtc: null, stderrTail: [] }, progress: { ...job.progress, state: 'failed' as const, remoteState: 'failed' } };
    });
    const run = vi.fn(async () => { throw new Error('must not upload'); }); const queue = createPublishQueue({ run, reconcile, cancel: async () => false });
    const accepted = { ...baseJob('reconciling'), attempts: [{ id: 'a1', attempt: 1, startedAt: 'now', endedAt: null, idempotencyKey: 'idem-1', remotePublishId: 'remote' }, { id: 'a2', attempt: 2, startedAt: 'now', endedAt: null, idempotencyKey: 'idem-1', remotePublishId: 'remote' }, { id: 'a3', attempt: 3, startedAt: 'now', endedAt: null, idempotencyKey: 'idem-1', remotePublishId: 'remote' }], remotePublishId: 'remote', nextReconcileAt: null, progress: { ...baseJob().progress, state: 'reconciling' as const, remoteState: 'processing' } };
    queue.hydrate({ jobs: [accepted], activeJobId: null, paused: false });
    for (let index = 0; index < 6; index += 1) await queue.start(new Date('2099-01-01T00:30:00.000Z'));
    expect(queue.get(accepted.id)).toMatchObject({ state: 'reconciling', attempts: accepted.attempts, nextReconcileAt: retryAfterUtc }); expect(run).not.toHaveBeenCalled(); expect(reconcile).toHaveBeenCalledTimes(6);
    await queue.start(new Date('2099-01-01T00:59:00.000Z')); expect(reconcile).toHaveBeenCalledTimes(6);
    await queue.start(new Date('2099-01-01T01:01:00.000Z')); expect(queue.get(accepted.id)).toMatchObject({ state: 'failed', failure: { code: 'youtube-processing-failed', retryable: false } }); expect(reconcile).toHaveBeenCalledTimes(7); expect(run).not.toHaveBeenCalled();
  });
  it('rebinds only matching nonterminal jobs in a live queue', () => {
    const oldRef = 'old-ref'; const account = { ...baseJob().accountBinding, credentialRef: 'new-ref' };
    const queued = { ...baseJob(), accountBinding: { ...baseJob().accountBinding, credentialRef: oldRef } };
    const published = { ...baseJob('published'), id: 'published', idempotencyKey: 'published', accountBinding: { ...baseJob().accountBinding, credentialRef: oldRef } };
    const unrelated = { ...baseJob('scheduled'), id: 'unrelated', idempotencyKey: 'unrelated', accountBinding: { ...baseJob().accountBinding, id: 'other', accountRef: 'other', channelRef: 'other', credentialRef: oldRef }, target: { platform: 'youtube' as const, accountId: 'other', channelRef: 'other' } };
    const queue = createPublishQueue({ run: async () => { throw new Error('not called'); }, reconcile: async (job) => job, cancel: async () => false }); queue.hydrate({ jobs: [queued, published, unrelated], activeJobId: null, paused: true });
    expect(queue.rebindAccountCredential(account, oldRef)).toBe(1); expect(queue.get(queued.id)?.accountBinding.credentialRef).toBe('new-ref'); expect(queue.get(published.id)?.accountBinding.credentialRef).toBe(oldRef); expect(queue.get(unrelated.id)?.accountBinding.credentialRef).toBe(oldRef);
  });
  it('keeps authentication-blocked jobs rebindable without making them auto-retryable', () => {
    const oldRef = 'old-ref'; const account = { ...baseJob().accountBinding, credentialRef: 'new-ref' };
    const authFailure = { ...baseJob('failed'), accountBinding: { ...baseJob().accountBinding, credentialRef: oldRef }, failure: { kind: 'authentication' as const, code: 'credential-reconnect-required', message: 'Reconnect.', retryable: false, attempt: 1, maxAttempts: 3, retryAfterUtc: null, stderrTail: [] } };
    const reconcilingAuthFailure = { ...authFailure, id: 'auth-remote', idempotencyKey: 'auth-remote', remotePublishId: 'remote-video', progress: { ...authFailure.progress, remoteState: 'unknown' } };
    const validationFailure = { ...authFailure, id: 'validation', idempotencyKey: 'validation', failure: { ...authFailure.failure!, kind: 'validation' as const, code: 'youtube-publish-validation-failed' } };
    const published = { ...baseJob('published'), id: 'published-auth', idempotencyKey: 'published-auth', accountBinding: { ...baseJob().accountBinding, credentialRef: oldRef } };
    const cancelled = { ...baseJob('cancelled'), id: 'cancelled-auth', idempotencyKey: 'cancelled-auth', accountBinding: { ...baseJob().accountBinding, credentialRef: oldRef } };
    const queue = createPublishQueue({ run: async () => { throw new Error('not called'); }, reconcile: async (job) => job, cancel: async () => false });
    queue.hydrate({ jobs: [authFailure, reconcilingAuthFailure, validationFailure, published, cancelled], activeJobId: null, paused: true });
    expect(isTerminalPublishJob(authFailure)).toBe(false); expect(isTerminalPublishJob(validationFailure)).toBe(true);
    expect(queue.rebindAccountCredential(account, oldRef)).toBe(2);
    expect(queue.get(authFailure.id)).toMatchObject({ state: 'failed', failure: { retryable: false }, accountBinding: { credentialRef: 'new-ref' } });
    expect(queue.get(reconcilingAuthFailure.id)?.accountBinding.credentialRef).toBe('new-ref');
    expect(queue.get(validationFailure.id)?.accountBinding.credentialRef).toBe(oldRef); expect(queue.get(published.id)?.accountBinding.credentialRef).toBe(oldRef); expect(queue.get(cancelled.id)?.accountBinding.credentialRef).toBe(oldRef);
  });
  it('allows deliberate auth recovery after rebinding and reconciles known remote uploads instead of re-uploading', async () => {
    const oldRef = 'old-ref'; const account = { ...baseJob().accountBinding, credentialRef: 'new-ref', authenticated: true };
    const failure = { kind: 'authentication' as const, code: 'credential-reconnect-required', message: 'Reconnect.', retryable: false, attempt: 1, maxAttempts: 3, retryAfterUtc: null, stderrTail: [] };
    const run = vi.fn(async () => { throw new Error('must not auto-run'); }); const reconcile = vi.fn(async (job: PublishJob) => ({ ...job, state: 'reconciling' as const, failure: null }));
    const local = { ...baseJob('failed'), accountBinding: { ...baseJob().accountBinding, credentialRef: oldRef, authenticated: false }, failure };
    const queue = createPublishQueue({ run, reconcile, cancel: async () => false }); queue.hydrate({ jobs: [local], activeJobId: null, paused: true });
    queue.rebindAccountCredential(account, oldRef); expect(run).not.toHaveBeenCalled();
    await expect(queue.retry(local.id)).resolves.toMatchObject({ state: 'queued', accountBinding: { credentialRef: 'new-ref', authenticated: true } }); expect(run).not.toHaveBeenCalled();

    const remoteInput = { ...local, id: 'remote-auth', idempotencyKey: 'remote-auth', remotePublishId: 'known-video', progress: { ...local.progress, remoteState: 'unknown' } };
    const remote = { ...remoteInput, approvalFingerprint: approvalFingerprint(remoteInput) };
    queue.hydrate({ jobs: [remote], activeJobId: null, paused: true }); queue.rebindAccountCredential(account, oldRef);
    await queue.retry(remote.id); expect(reconcile).toHaveBeenCalledOnce(); expect(run).not.toHaveBeenCalled();
  });
  it('preserves provider retry timing and does not execute before cooldown', async () => { const retryAfterUtc = '2099-01-01T00:02:00.000Z'; const run = vi.fn(async () => { throw Object.assign(new Error('rate limited'), { code: 'youtube-rate-limited', status: 429, retryable: true, retryAfterUtc }); }); const queue = createPublishQueue({ run, reconcile: async (job) => job, cancel: async () => true }); queue.enqueue(baseJob()); await queue.start(new Date('2099-01-01T00:00:00.000Z')); expect(queue.get('job-1')).toMatchObject({ state: 'failed', failure: { code: 'youtube-rate-limited', retryAfterUtc } }); await queue.start(new Date('2099-01-01T00:01:00.000Z')); expect(run).toHaveBeenCalledTimes(1); await queue.start(new Date('2099-01-01T00:03:00.000Z')); expect(run).toHaveBeenCalledTimes(2); });
  it('moves a definitively expired empty session back through normal upload execution', async () => {
    const publish = vi.fn(async () => ({ ok: true as const, result: { remotePublishId: 'replacement-video', state: 'published' as const } }));
    const reconcilePublish = vi.fn(async () => ({ ok: true as const, result: { found: false, state: 'unknown' as const, restartRequired: true } }));
    const client = { publish, reconcilePublish, cancelPublish: vi.fn(), acknowledgeReceipt: vi.fn() };
    const service = createPublishingApplicationService(undefined, { registry: createPublishAdapterRegistry(client) }); const queue = service.createQueue();
    queue.hydrate({ jobs: [{ ...baseJob('reconciling'), remotePublishId: null }], activeJobId: null, paused: true });
    await expect(queue.reconcile('job-1')).resolves.toMatchObject({ state: 'failed', failure: { code: 'youtube-upload-session-expired', retryable: true } });
    expect(publish).not.toHaveBeenCalled(); queue.resume(); await vi.waitFor(() => expect(publish).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(queue.get('job-1')?.state).toBe('published')); expect(reconcilePublish).toHaveBeenCalledOnce();
  });
  it('does not create a receipt when a completed session belongs to a previous approval', async () => {
    const client = { publish: vi.fn(), reconcilePublish: vi.fn(async () => ({ ok: true as const, result: { found: true, remotePublishId: 'old-video', state: 'published' as const, approvalMismatch: true } })), cancelPublish: vi.fn(), acknowledgeReceipt: vi.fn() };
    const queue = createPublishingApplicationService(undefined, { registry: createPublishAdapterRegistry(client) }).createQueue();
    queue.hydrate({ jobs: [{ ...baseJob('reconciling'), progress: { ...baseJob().progress, state: 'reconciling', remoteState: 'unknown' } }], activeJobId: null, paused: true });
    await queue.reconcile('job-1');
    expect(queue.get('job-1')).toMatchObject({ state: 'failed', receipt: null, remotePublishId: 'old-video', failure: { code: 'youtube-upload-approval-mismatch', retryable: false } });
    expect(client.publish).not.toHaveBeenCalled();
  });
  it('keeps known remote status failures reconciling with the provider cooldown', async () => {
    const retryAfterUtc = '2099-01-01T01:00:00.000Z';
    const client = { publish: vi.fn(), reconcilePublish: vi.fn(async () => ({ ok: true as const, result: { found: true, remotePublishId: 'known-video', state: 'unknown' as const, retryAfterUtc } })), cancelPublish: vi.fn(), acknowledgeReceipt: vi.fn() };
    const queue = createPublishingApplicationService(undefined, { registry: createPublishAdapterRegistry(client) }).createQueue();
    queue.hydrate({ jobs: [{ ...baseJob('reconciling'), remotePublishId: 'known-video', progress: { ...baseJob().progress, state: 'reconciling', remoteState: 'unknown' } }], activeJobId: null, paused: true });
    await expect(queue.reconcile('job-1')).resolves.toMatchObject({ state: 'reconciling', remotePublishId: 'known-video', nextReconcileAt: retryAfterUtc });
    expect(client.publish).not.toHaveBeenCalled(); expect(await queue.cancel('job-1')).toBe(false); expect(queue.get('job-1')).toMatchObject({ state: 'reconciling', remotePublishId: 'known-video' });
  });
});
