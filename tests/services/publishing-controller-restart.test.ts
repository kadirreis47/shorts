import { describe, expect, it, vi } from 'vitest';
import type { PublishJob } from '@/core/publishing';

const oldAccount = { id: 'youtube:UC-restart', platform: 'youtube' as const, accountRef: 'UC-restart', channelRef: 'UC-restart', displayName: 'Restart channel', credentialRef: 'youtube_old_restart', authenticated: true, createdAt: 'now' };
const replacementAccount = { ...oldAccount, credentialRef: 'youtube_new_restart' };

function interruptedJob(): PublishJob {
  return {
    id: 'interrupted-job', projectId: 'project', variantId: null, target: { platform: 'youtube', accountId: oldAccount.id, channelRef: oldAccount.channelRef }, accountBinding: oldAccount,
    artifact: { artifactPath: 'C:/video.mp4', artifactFingerprint: 'artifact', projectId: 'project', variantId: null, exportJobId: 'export', verified: true, contentDigest: 'a'.repeat(64), sizeBytes: 1, durationMs: 1, diagnostics: {}, sourceManifestFingerprint: 'manifest' },
    metadata: { title: 'Title', description: '', caption: '', hashtags: [], visibility: 'private', language: null, category: null, audienceFlags: {}, thumbnailPath: null, playlistRef: null, commentsEnabled: null },
    schedule: { mode: 'now', scheduledAtUtc: null, timezone: 'UTC' }, state: 'interrupted', progress: { state: 'interrupted', percent: 0, message: 'Restarted', remoteState: null, updatedAt: 'now' }, readiness: { ready: true, status: 'safe', issues: [], warnings: [], diagnostics: [] },
    idempotencyKey: 'restart-idempotency', approvalFingerprint: 'approval', approvedAt: 'now', attempts: [], maxAttempts: 3, failure: null, receipt: null, remotePublishId: null, createdAt: 'now', updatedAt: 'now', nextReconcileAt: null,
  };
}

describe('publishing credential recovery after restart', () => {
  it('reconstructs an active replacement from persisted account and job bindings, then cleans it up idempotently', async () => {
    vi.resetModules();
    const [{ applicationContainer, dependencyTokens }, { createPublishQueue }, controller, { usePublishingStore }] = await Promise.all([
      import('@/core/di'), import('@/core/publishing'), import('@/services/publishingController'), import('@/store/publishingStore'),
    ]);
    applicationContainer.reset();
    applicationContainer.registerValue(dependencyTokens.publishingApplicationService, { createQueue: (_executor: unknown, update: (job: PublishJob) => void) => createPublishQueue({ run: async () => { throw new Error('not called'); }, reconcile: async (job) => job, cancel: async () => false }, update) } as never);
    const disconnect = vi.fn(async () => ({ disconnected: true }));
    (globalThis as unknown as { window: Window }).window = { electronAPI: { platform: 'win32', version: 'test', ffmpeg: {} as never, youtube: { disconnect, acknowledgeReceipt: vi.fn(), connect: vi.fn(), status: vi.fn(), finalizeSelection: vi.fn(), cancelSelection: vi.fn() } } } as unknown as Window;
    const unrelated = { ...interruptedJob(), id: 'unrelated-job', idempotencyKey: 'unrelated-idempotency', target: { platform: 'youtube' as const, accountId: 'youtube:UC-other', channelRef: 'UC-other' }, accountBinding: { ...oldAccount, id: 'youtube:UC-other', accountRef: 'UC-other', channelRef: 'UC-other', credentialRef: 'youtube_other_restart' } };
    const history = { ...interruptedJob(), id: 'history-job', idempotencyKey: 'history-idempotency', state: 'published' as const, progress: { ...interruptedJob().progress, state: 'published' as const } };
    usePublishingStore.setState({ accounts: [replacementAccount], queue: { jobs: [interruptedJob(), unrelated, history], activeJobId: null, paused: true } });

    const queue = await controller.initializePublishingQueue();
    expect(queue.get('interrupted-job')?.accountBinding.credentialRef).toBe(replacementAccount.credentialRef);
    expect(usePublishingStore.getState().queue.jobs[0].accountBinding.credentialRef).toBe(replacementAccount.credentialRef);
    expect(queue.get('unrelated-job')?.accountBinding.credentialRef).toBe('youtube_other_restart');
    expect(queue.get('history-job')?.accountBinding.credentialRef).toBe(oldAccount.credentialRef);
    expect(disconnect).toHaveBeenCalledWith(oldAccount.credentialRef);

    await controller.initializePublishingQueue();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
