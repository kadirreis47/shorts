import { describe, expect, it, vi } from 'vitest';
import { approvalFingerprint, type PublishJob } from '@/core/publishing';
import { createPublishingApplicationService } from '@/services/publishingApplicationService';

const digest = 'a'.repeat(64);
function job(): PublishJob {
  const value: PublishJob = {
    id: 'publish-integrity', projectId: 'project', variantId: null,
    target: { platform: 'youtube', accountId: 'account', channelRef: 'UC-channel' },
    accountBinding: { id: 'account', platform: 'youtube', accountRef: 'account', displayName: 'Channel', channelRef: 'UC-channel', credentialRef: 'youtube_00000000-0000-0000-0000-000000000000', authenticated: true, createdAt: 'now' },
    artifact: { artifactPath: 'C:/exports/approved.mp4', artifactFingerprint: 'artifact', projectId: 'project', variantId: null, exportJobId: 'export', verified: true, sizeBytes: 42, durationMs: 1_000, contentDigest: digest, diagnostics: {}, sourceManifestFingerprint: 'manifest' },
    metadata: { title: 'Approved', description: '', hashtags: [], caption: '', visibility: 'private', language: null, category: null, audienceFlags: {}, thumbnailPath: null, playlistRef: null, commentsEnabled: null },
    schedule: { mode: 'now', scheduledAtUtc: null, timezone: 'UTC' }, state: 'queued', progress: { state: 'queued', percent: 0, message: '', remoteState: null, updatedAt: 'now' }, readiness: { ready: true, status: 'safe', issues: [], warnings: [], diagnostics: [] },
    idempotencyKey: 'idempotency', approvalFingerprint: null, approvedAt: 'now', attempts: [], maxAttempts: 3, failure: null, receipt: null, remotePublishId: null, createdAt: 'now', updatedAt: 'now',
  };
  return { ...value, approvalFingerprint: approvalFingerprint(value) };
}

describe('publishing artifact execution boundary', () => {
  it('revalidates the canonical artifact before an adapter can create a remote side effect', async () => {
    const publish = vi.fn();
    const registry = { get: () => ({ publish, capability: () => ({}) }), list: () => [] } as any;
    const revalidateArtifact = vi.fn(async () => { throw Object.assign(new Error('Verified export no longer matches.'), { code: 'artifact-integrity-mismatch', retryable: false, status: 409 }); });
    const queue = createPublishingApplicationService(undefined, { registry, revalidateArtifact }).createQueue();
    const approved = job();
    queue.enqueue(approved);
    await queue.start();
    expect(revalidateArtifact).toHaveBeenCalledWith(approved.artifact);
    expect(publish).not.toHaveBeenCalled();
    expect(queue.get(approved.id)).toMatchObject({ state: 'failed', failure: { code: 'artifact-integrity-mismatch', retryable: false } });
  });
  it('maps confirmed YouTube completion into the existing verified PublishReceipt', async () => {
    const adapter = { trustedArtifactRevalidation: true, publish: vi.fn(async () => ({ remotePublishId: 'youtube-video', remoteUrl: 'https://www.youtube.com/watch?v=youtube-video', state: 'published' as const })), reconcile: vi.fn(), capability: vi.fn() };
    const registry = { get: () => adapter, list: () => [adapter] } as any;
    const queue = createPublishingApplicationService(undefined, { registry }).createQueue();
    const approved = job(); queue.enqueue(approved); await queue.start();
    expect(queue.get(approved.id)).toMatchObject({ state: 'published', remotePublishId: 'youtube-video', receipt: { jobId: approved.id, remotePublishId: 'youtube-video', platform: 'youtube', accountRef: 'account', artifactFingerprint: approved.artifact.artifactFingerprint, verification: { valid: true, remoteState: 'published' } } });
  });
  it('creates no receipt while processing, then creates exactly one after reconciliation verifies success', async () => {
    const publish = vi.fn(async () => ({ remotePublishId: 'youtube-processing', remoteUrl: 'https://www.youtube.com/watch?v=youtube-processing', state: 'processing' as const }));
    const reconcile = vi.fn(async () => ({ found: true, remotePublishId: 'youtube-processing', remoteUrl: 'https://www.youtube.com/watch?v=youtube-processing', state: 'published' as const }));
    const adapter = { trustedArtifactRevalidation: true, publish, reconcile, capability: vi.fn() };
    const registry = { get: () => adapter, list: () => [adapter] } as any;
    const queue = createPublishingApplicationService(undefined, { registry }).createQueue();
    const approved = job(); queue.enqueue(approved); await queue.start();
    expect(queue.get(approved.id)).toMatchObject({ state: 'reconciling', remotePublishId: 'youtube-processing', receipt: null });
    await queue.reconcile(approved.id);
    expect(queue.get(approved.id)).toMatchObject({ state: 'published', remotePublishId: 'youtube-processing', receipt: { remotePublishId: 'youtube-processing', verification: { valid: true, remoteState: 'published' } } });
    expect(publish).toHaveBeenCalledOnce(); expect(reconcile).toHaveBeenCalledOnce();
  });
  it('never creates a verified receipt when YouTube processing fails', async () => {
    const adapter = { trustedArtifactRevalidation: true, publish: vi.fn(async () => ({ remotePublishId: 'youtube-failed', state: 'failed' as const })), reconcile: vi.fn(), capability: vi.fn() };
    const registry = { get: () => adapter, list: () => [adapter] } as any;
    const queue = createPublishingApplicationService(undefined, { registry }).createQueue();
    const approved = job(); queue.enqueue(approved); await queue.start();
    expect(queue.get(approved.id)).toMatchObject({ state: 'failed', remotePublishId: 'youtube-failed', receipt: null, failure: { code: 'youtube-processing-failed', retryable: false } });
  });
});
