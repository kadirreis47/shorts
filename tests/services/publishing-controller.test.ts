import { afterEach, describe, expect, it, vi } from 'vitest';
import { applicationContainer, dependencyTokens } from '@/core/di';
import { approvalFingerprint, createPublishQueue, type PublishJob } from '@/core/publishing';
import { initializePublishingQueue, rebindPublishingAccountCredential } from '@/services/publishingController';
import { usePublishingStore } from '@/store/publishingStore';
import { setValidatedOwnerId } from '@/auth/identity';
import { privateOwnerGeneration, transitionPrivateOwner } from '@/app/ownerTransition';

const oldAccount = { id: 'youtube:UC-channel', platform: 'youtube' as const, accountRef: 'UC-channel', channelRef: 'UC-channel', displayName: 'Channel', credentialRef: 'youtube_old', authenticated: true, createdAt: 'now' };
const newAccount = { ...oldAccount, credentialRef: 'youtube_new' };

function job(): PublishJob {
  const value: PublishJob = {
    id: 'active-job', projectId: 'project', variantId: null, target: { platform: 'youtube', accountId: oldAccount.id, channelRef: oldAccount.channelRef }, accountBinding: oldAccount,
    artifact: { artifactPath: 'C:/video.mp4', artifactFingerprint: 'artifact', projectId: 'project', variantId: null, exportJobId: 'export', verified: true, contentDigest: 'a'.repeat(64), sizeBytes: 1, durationMs: 1, diagnostics: {}, sourceManifestFingerprint: 'manifest' },
    metadata: { title: 'Title', description: '', caption: '', hashtags: [], visibility: 'private', language: null, category: null, audienceFlags: {}, thumbnailPath: null, playlistRef: null, commentsEnabled: null },
    schedule: { mode: 'now', scheduledAtUtc: null, timezone: 'UTC' }, state: 'queued', progress: { state: 'queued', percent: 0, message: '', remoteState: null, updatedAt: 'now' }, readiness: { ready: true, status: 'safe', issues: [], warnings: [], diagnostics: [] },
    idempotencyKey: 'idempotency', approvalFingerprint: null, approvedAt: 'now', attempts: [], maxAttempts: 3, failure: null, receipt: null, remotePublishId: null, createdAt: 'now', updatedAt: 'now',
  };
  return { ...value, approvalFingerprint: approvalFingerprint(value) };
}

describe('publishing credential cleanup after active work', () => {
  afterEach(() => {
    setValidatedOwnerId(null);
    transitionPrivateOwner(null);
  });

  it('defers rebinding and credential deletion until an active same-channel attempt settles', async () => {
    setValidatedOwnerId('publishing-test-user');
    let complete!: () => void;
    const run = vi.fn(async () => new Promise<any>((resolve) => { complete = () => resolve({ jobId: 'active-job', remotePublishId: 'video', platform: 'youtube', accountRef: oldAccount.accountRef, publishedAt: 'now', artifactFingerprint: 'artifact', metadataFingerprint: 'metadata', scheduleIntent: { mode: 'now', scheduledAtUtc: null, timezone: 'UTC' }, remoteUrl: null, verification: { valid: true, remotePublishId: 'video', remoteState: 'published', checkedAt: 'now', issues: [] } }); }));
    applicationContainer.reset();
    applicationContainer.registerValue(dependencyTokens.publishingApplicationService, { createQueue: (_executor: unknown, update: (value: PublishJob) => void) => createPublishQueue({ run, reconcile: async (value) => value, cancel: async () => false }, update) } as never);
    const disconnect = vi.fn(async () => ({ disconnected: true }));
    (globalThis as unknown as { window: Window }).window = { electronAPI: { platform: 'win32', version: 'test', ffmpeg: {} as never, youtube: { disconnect, acknowledgeReceipt: vi.fn(), connect: vi.fn(), status: vi.fn(), finalizeSelection: vi.fn(), cancelSelection: vi.fn() } } } as unknown as Window;
    usePublishingStore.setState({ accounts: [oldAccount], queue: { jobs: [], activeJobId: null, paused: false } });
    const queue = await initializePublishingQueue();
    queue.enqueue(job());
    const processing = queue.start();
    await vi.waitFor(() => expect(queue.snapshot().activeJobId).toBe('active-job'));
    await expect(rebindPublishingAccountCredential(newAccount, oldAccount.credentialRef!)).resolves.toBe(false);
    expect(usePublishingStore.getState().accounts).toContainEqual(expect.objectContaining({ credentialRef: newAccount.credentialRef }));
    expect(queue.get('active-job')?.accountBinding.credentialRef).toBe(oldAccount.credentialRef);
    expect(disconnect).not.toHaveBeenCalled();
    complete();
    await processing;
    await vi.waitFor(() => expect(disconnect).toHaveBeenCalledWith(oldAccount.credentialRef));
    expect(queue.get('active-job')?.accountBinding.credentialRef).toBe(oldAccount.credentialRef);
    expect(usePublishingStore.getState().accounts).toContainEqual(expect.objectContaining({ credentialRef: newAccount.credentialRef }));
  });

  it('aborts an in-flight User A cleanup after the validated owner transitions to User B', async () => {
    setValidatedOwnerId('cleanup-user-a');
    transitionPrivateOwner('cleanup-user-a');
    let complete!: () => void;
    const run = vi.fn(async () => new Promise<any>((resolve) => {
      complete = () => resolve({ jobId: 'active-job', remotePublishId: 'video', platform: 'youtube', accountRef: oldAccount.accountRef, publishedAt: 'now', artifactFingerprint: 'artifact', metadataFingerprint: 'metadata', scheduleIntent: { mode: 'now', scheduledAtUtc: null, timezone: 'UTC' }, remoteUrl: null, verification: { valid: true, remotePublishId: 'video', remoteState: 'published', checkedAt: 'now', issues: [] } });
    }));
    applicationContainer.reset();
    applicationContainer.registerValue(dependencyTokens.publishingApplicationService, { createQueue: (_executor: unknown, update: (value: PublishJob) => void) => createPublishQueue({ run, reconcile: async (value) => value, cancel: async () => false }, update) } as never);
    const disconnect = vi.fn(async () => ({ disconnected: true }));
    (globalThis as unknown as { window: Window }).window = { electronAPI: { platform: 'win32', version: 'test', ffmpeg: {} as never, youtube: { disconnect, acknowledgeReceipt: vi.fn(), connect: vi.fn(), status: vi.fn(), finalizeSelection: vi.fn(), cancelSelection: vi.fn() } } } as unknown as Window;
    usePublishingStore.setState({ accounts: [oldAccount], queue: { jobs: [], activeJobId: null, paused: false } });
    const queue = await initializePublishingQueue();
    queue.enqueue(job());
    const processing = queue.start();
    await vi.waitFor(() => expect(queue.snapshot().activeJobId).toBe('active-job'));
    await expect(rebindPublishingAccountCredential(newAccount, oldAccount.credentialRef!)).resolves.toBe(false);

    let releaseStoreMutation!: (safeToRemove: boolean) => void;
    const deferredStoreMutation = vi.fn(() => new Promise<boolean>((resolve) => { releaseStoreMutation = resolve; }));
    usePublishingStore.setState({ rebindAccountCredential: deferredStoreMutation });
    complete();
    await processing;
    await vi.waitFor(() => expect(deferredStoreMutation).toHaveBeenCalledWith(newAccount, oldAccount.credentialRef));

    const sameOwnerGeneration = privateOwnerGeneration();
    expect(transitionPrivateOwner('cleanup-user-a')).toEqual({ changed: false, generation: sameOwnerGeneration });
    setValidatedOwnerId('cleanup-user-b');
    transitionPrivateOwner('cleanup-user-b');
    releaseStoreMutation(true);
    await Promise.resolve();
    await Promise.resolve();

    expect(disconnect).not.toHaveBeenCalled();
    expect(usePublishingStore.getState().accounts).toEqual([]);
    expect(usePublishingStore.getState().queue.jobs).toEqual([]);
  });
});
