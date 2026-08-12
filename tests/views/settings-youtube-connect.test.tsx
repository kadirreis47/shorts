import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/lib/i18n';
import { usePublishingStore } from '@/store/publishingStore';
import { Settings } from '@/views/Settings';
import type { PublishJob, PublishState } from '@/core/publishing';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ select: async () => ({ data: [] }) }) },
}));

const connection = {
  platform: 'youtube' as const,
  credentialRef: 'youtube_11111111-1111-1111-1111-111111111111',
  accountRef: 'google-account-1',
  channelRef: 'UC-authoritative',
  displayName: 'Authoritative channel',
  authenticated: true,
  grantedScopes: ['https://www.googleapis.com/auth/youtube.upload'],
};
const persistedAccount = { id: 'youtube:UC-authoritative', platform: 'youtube' as const, accountRef: 'UC-authoritative', channelRef: 'UC-authoritative', displayName: 'Persisted channel', credentialRef: connection.credentialRef, authenticated: true, createdAt: 'now' };
const originalRebindAccountCredential = usePublishingStore.getState().rebindAccountCredential;
function publishingJob(id: string, state: PublishState, account: typeof persistedAccount): PublishJob {
  return {
    id, projectId: 'project', variantId: null,
    target: { platform: 'youtube', accountId: account.id, channelRef: account.channelRef }, accountBinding: account,
    artifact: { artifactPath: 'C:/video.mp4', artifactFingerprint: 'artifact', projectId: 'project', variantId: null, exportJobId: 'export', verified: true, contentDigest: 'a'.repeat(64), sizeBytes: 100, durationMs: 1000, diagnostics: {}, sourceManifestFingerprint: 'manifest' },
    metadata: { title: 'Title', description: '', hashtags: [], caption: '', visibility: 'private', language: null, category: null, audienceFlags: {}, thumbnailPath: null, playlistRef: null, commentsEnabled: null },
    schedule: state === 'scheduled' ? { mode: 'scheduled', scheduledAtUtc: '2099-01-01T00:00:00.000Z', timezone: 'UTC' } : { mode: 'now', scheduledAtUtc: null, timezone: 'UTC' },
    state, progress: { state, percent: 0, message: '', remoteState: state === 'reconciling' ? 'processing' : null, updatedAt: 'now' }, readiness: { ready: true, status: 'safe', issues: [], warnings: [], diagnostics: [] },
    idempotencyKey: `idempotency-${id}`, approvalFingerprint: 'approval', approvedAt: 'now', attempts: [], maxAttempts: 3, failure: null,
    receipt: state === 'published' ? { jobId: id, remotePublishId: 'remote', platform: 'youtube', accountRef: account.accountRef, publishedAt: 'now', artifactFingerprint: 'artifact', metadataFingerprint: 'metadata', scheduleIntent: { mode: 'now', scheduledAtUtc: null, timezone: 'UTC' }, remoteUrl: null, verification: { valid: true, remotePublishId: 'remote', remoteState: 'published', checkedAt: 'now', issues: [] } } : null,
    remotePublishId: state === 'reconciling' || state === 'published' ? 'remote' : null, createdAt: 'now', updatedAt: 'now',
  };
}

let container: HTMLDivElement | undefined;
afterEach(() => {
  container?.remove();
  container = undefined;
  usePublishingStore.setState({ accounts: [], queue: { jobs: [], activeJobId: null, paused: false }, selectedJobId: null, lastError: null, rebindAccountCredential: originalRebindAccountCredential });
  delete window.electronAPI;
});

describe('Settings native YouTube connection', () => {
  it('accepts the packaged preload connection shape and invokes only native connect', async () => {
    const connect = vi.fn(async () => connection);
    const nativeBridge = { connect, disconnect: vi.fn(), status: vi.fn(async () => ({ ok: true as const, status: { credentialRef: connection.credentialRef, authenticated: true } })), finalizeSelection: vi.fn(), cancelSelection: vi.fn() };
    window.electronAPI = { youtube: nativeBridge } as never;
    container = document.createElement('div'); document.body.append(container); const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Settings /></I18nProvider>); }); await act(async () => {});
    const connectButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Connect'));
    expect(connectButton).toBeDefined();
    await act(async () => { connectButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(connect).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('Authoritative channel');
    expect(container.textContent).not.toContain(connection.credentialRef);
    await act(async () => { root.unmount(); });
  });

  it('always clears the Connect loading state when native OAuth rejects', async () => {
    const connect = vi.fn(async () => { throw new Error('OAuth finalization timed out. Please try again.'); });
    window.electronAPI = { youtube: { connect, disconnect: vi.fn(), status: vi.fn(), finalizeSelection: vi.fn(), cancelSelection: vi.fn() } } as never;
    container = document.createElement('div'); document.body.append(container); const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Settings /></I18nProvider>); }); await act(async () => {});
    const connectButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Connect'));
    await act(async () => { connectButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const retryButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Connect'));
    expect(retryButton?.disabled).toBe(false); expect(container.textContent).toContain('OAuth finalization timed out. Please try again.');
    await act(async () => { root.unmount(); });
  });

  it('keeps the safe fallback when the native bridge is absent or incomplete', async () => {
    window.electronAPI = { youtube: { connect: vi.fn() } } as never;
    container = document.createElement('div'); document.body.append(container); const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Settings /></I18nProvider>); }); await act(async () => {});
    expect(container.textContent).toContain('Native YouTube connection is available in the ShortsFlow desktop app.');
    expect(Array.from(container.querySelectorAll('button')).some((button) => button.textContent?.includes('Connect YouTube'))).toBe(false);
    await act(async () => { root.unmount(); });
  });

  it('uses the Electron bridge and persists only a safe PublishAccount binding', async () => {
    const connect = vi.fn(async () => connection);
    const disconnect = vi.fn(async () => ({ credentialRef: connection.credentialRef, disconnected: true }));
    window.electronAPI = { platform: 'win32', version: 'test', ffmpeg: {} as never, youtube: { connect, disconnect, status: vi.fn(async () => ({ ok: true as const, status: { credentialRef: connection.credentialRef, authenticated: true } })), finalizeSelection: vi.fn(), cancelSelection: vi.fn() } };
    container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Settings /></I18nProvider>); });
    await act(async () => {});
    const connectButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Connect'));
    expect(connectButton).toBeDefined();
    await act(async () => { connectButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(connect).toHaveBeenCalledOnce();
    expect(usePublishingStore.getState().accounts).toEqual([expect.objectContaining({ id: 'youtube:google-account-1', credentialRef: connection.credentialRef, accountRef: 'google-account-1', channelRef: 'UC-authoritative', displayName: 'Authoritative channel', authenticated: true })]);
    expect(container.textContent).toContain('Authoritative channel');
    expect(JSON.stringify(usePublishingStore.getState().accounts)).not.toContain('accessToken');
    expect(JSON.stringify(usePublishingStore.getState().accounts)).not.toContain('refreshToken');
    const disconnectButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Disconnect'));
    await act(async () => { disconnectButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(disconnect).toHaveBeenCalledWith(connection.credentialRef);
    expect(usePublishingStore.getState().accounts[0]).toEqual(expect.objectContaining({ credentialRef: null, authenticated: false }));
    await act(async () => { root.unmount(); });
  });

  it('disconnects account usability without deleting the credential needed by dependent jobs, then rebinds on reconnect', async () => {
    const oldCredentialRef = 'youtube_22222222-2222-2222-2222-222222222222';
    const oldAccount = { ...persistedAccount, credentialRef: oldCredentialRef };
    const unrelatedAccount = { ...oldAccount, id: 'youtube:other', accountRef: 'UC-other', channelRef: 'UC-other', credentialRef: 'youtube_33333333-3333-3333-3333-333333333333' };
    const jobs = [publishingJob('queued-dependent', 'queued', oldAccount), publishingJob('scheduled-dependent', 'scheduled', oldAccount), publishingJob('reconciling-dependent', 'reconciling', oldAccount), publishingJob('unrelated-dependent', 'scheduled', unrelatedAccount)];
    const replacement = { ...connection, accountRef: oldAccount.accountRef, channelRef: oldAccount.channelRef!, credentialRef: connection.credentialRef };
    const disconnect = vi.fn(async (credentialRef: string) => ({ credentialRef, disconnected: true }));
    usePublishingStore.setState({ accounts: [oldAccount, unrelatedAccount], queue: { jobs, activeJobId: null, paused: false } });
    window.electronAPI = { platform: 'win32', version: 'test', ffmpeg: {} as never, youtube: { connect: vi.fn(async () => replacement), disconnect, status: vi.fn(async (credentialRef: string) => ({ ok: true as const, status: { credentialRef, authenticated: true } })), finalizeSelection: vi.fn(), cancelSelection: vi.fn() } };
    container = document.createElement('div'); document.body.append(container); const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Settings /></I18nProvider>); }); await vi.waitFor(() => expect(container!.textContent).toContain('Persisted channel'));
    const disconnectButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Disconnect'));
    await act(async () => { disconnectButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(disconnect).not.toHaveBeenCalled();
    expect(usePublishingStore.getState().accounts.find((account) => account.id === oldAccount.id)).toMatchObject({ authenticated: false, credentialRef: oldCredentialRef });
    const disconnectedJobs = usePublishingStore.getState().queue.jobs;
    expect(disconnectedJobs.filter((job) => job.id.endsWith('-dependent') && job.id !== 'unrelated-dependent').every((job) => job.accountBinding.credentialRef === oldCredentialRef && !job.accountBinding.authenticated)).toBe(true);
    expect(disconnectedJobs.find((job) => job.id === 'unrelated-dependent')?.accountBinding).toMatchObject({ credentialRef: unrelatedAccount.credentialRef, authenticated: true });
    expect(container.textContent).toContain('secured credential is retained');

    const reconnectButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Reconnect YouTube'));
    await act(async () => { reconnectButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await vi.waitFor(() => expect(disconnect).toHaveBeenCalledWith(oldCredentialRef));
    const rebound = usePublishingStore.getState().queue.jobs;
    expect(rebound.filter((job) => job.id !== 'unrelated-dependent').every((job) => job.accountBinding.credentialRef === replacement.credentialRef && job.accountBinding.authenticated)).toBe(true);
    expect(rebound.find((job) => job.id === 'unrelated-dependent')?.accountBinding.credentialRef).toBe(unrelatedAccount.credentialRef);
    expect(usePublishingStore.getState().accounts.find((account) => account.id === oldAccount.id)).toMatchObject({ authenticated: true, credentialRef: replacement.credentialRef });
    await act(async () => { root.unmount(); });
  });

  it('replaces a same-channel credential only after the new binding succeeds and removes the superseded reference', async () => {
    const oldCredentialRef = 'youtube_22222222-2222-2222-2222-222222222222';
    const existing = { ...persistedAccount, id: `youtube:${connection.accountRef}`, accountRef: connection.accountRef, credentialRef: oldCredentialRef };
    const disconnect = vi.fn(async () => ({ credentialRef: oldCredentialRef, disconnected: true }));
    usePublishingStore.setState({ accounts: [existing] });
    window.electronAPI = { platform: 'win32', version: 'test', ffmpeg: {} as never, youtube: { connect: vi.fn(async () => connection), disconnect, status: vi.fn(async () => ({ ok: true as const, status: { credentialRef: oldCredentialRef, authenticated: true } })), finalizeSelection: vi.fn(), cancelSelection: vi.fn() } };
    container = document.createElement('div'); document.body.append(container); const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Settings /></I18nProvider>); }); await act(async () => {});
    await act(async () => { Array.from(container!.querySelectorAll('button')).find((button) => button.textContent?.includes('Connect another account'))?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(usePublishingStore.getState().accounts).toEqual([expect.objectContaining({ id: existing.id, credentialRef: connection.credentialRef, authenticated: true })]);
    expect(disconnect).toHaveBeenCalledWith(oldCredentialRef);
    await act(async () => { Array.from(container!.querySelectorAll('button')).find((button) => button.textContent?.includes('Disconnect'))?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(disconnect).toHaveBeenLastCalledWith(connection.credentialRef);
    expect(JSON.stringify(usePublishingStore.getState().accounts)).not.toContain('accessToken');
    expect(JSON.stringify(usePublishingStore.getState().accounts)).not.toContain('refreshToken');
    await act(async () => { root.unmount(); });
  });

  it('rebinds matching nonterminal jobs before removing a superseded credential', async () => {
    const oldCredentialRef = 'youtube_22222222-2222-2222-2222-222222222222';
    const existing = { ...persistedAccount, id: `youtube:${connection.accountRef}`, accountRef: connection.accountRef, channelRef: connection.channelRef, credentialRef: oldCredentialRef };
    const unrelatedAccount = { ...existing, id: 'youtube:other', accountRef: 'other', channelRef: 'UC-other', credentialRef: 'youtube_33333333-3333-3333-3333-333333333333' };
    const jobs = [publishingJob('queued', 'queued', existing), publishingJob('scheduled', 'scheduled', existing), publishingJob('reconciling', 'reconciling', existing), publishingJob('published', 'published', existing), publishingJob('unrelated', 'scheduled', unrelatedAccount)];
    const disconnect = vi.fn(async (credentialRef: string) => ({ credentialRef, disconnected: true }));
    usePublishingStore.setState({ accounts: [existing], queue: { jobs, activeJobId: null, paused: false } });
    window.electronAPI = { platform: 'win32', version: 'test', ffmpeg: {} as never, youtube: { connect: vi.fn(async () => connection), disconnect, status: vi.fn(async () => ({ ok: true as const, status: { credentialRef: oldCredentialRef, authenticated: true } })), finalizeSelection: vi.fn(), cancelSelection: vi.fn() } };
    container = document.createElement('div'); document.body.append(container); const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Settings /></I18nProvider>); }); await act(async () => {});
    await act(async () => { Array.from(container!.querySelectorAll('button')).find((button) => button.textContent?.includes('Connect another account'))?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const persistedJobs = usePublishingStore.getState().queue.jobs;
    expect(persistedJobs.filter((job) => ['queued', 'scheduled', 'reconciling'].includes(job.id)).every((job) => job.accountBinding.credentialRef === connection.credentialRef)).toBe(true);
    expect(persistedJobs.find((job) => job.id === 'published')?.accountBinding.credentialRef).toBe(oldCredentialRef);
    expect(persistedJobs.find((job) => job.id === 'unrelated')?.accountBinding.credentialRef).toBe(unrelatedAccount.credentialRef);
    expect(disconnect).toHaveBeenCalledOnce(); expect(disconnect).toHaveBeenCalledWith(oldCredentialRef);
    await act(async () => { root.unmount(); });
  });

  it('retains the old credential when job rebinding fails', async () => {
    const oldCredentialRef = 'youtube_22222222-2222-2222-2222-222222222222'; const existing = { ...persistedAccount, id: `youtube:${connection.accountRef}`, accountRef: connection.accountRef, channelRef: connection.channelRef, credentialRef: oldCredentialRef };
    const disconnect = vi.fn(); usePublishingStore.setState({ accounts: [existing], queue: { jobs: [publishingJob('scheduled', 'scheduled', existing)], activeJobId: null, paused: false }, rebindAccountCredential: vi.fn(async () => { throw new Error('persistence failure'); }) });
    window.electronAPI = { platform: 'win32', version: 'test', ffmpeg: {} as never, youtube: { connect: vi.fn(async () => connection), disconnect, status: vi.fn(async () => ({ ok: true as const, status: { credentialRef: oldCredentialRef, authenticated: true } })), finalizeSelection: vi.fn(), cancelSelection: vi.fn() } };
    container = document.createElement('div'); document.body.append(container); const root = createRoot(container); await act(async () => { root.render(<I18nProvider><Settings /></I18nProvider>); }); await act(async () => {});
    await act(async () => { Array.from(container!.querySelectorAll('button')).find((button) => button.textContent?.includes('Connect another account'))?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(disconnect).not.toHaveBeenCalled(); expect(usePublishingStore.getState().accounts[0].credentialRef).toBe(oldCredentialRef); expect(usePublishingStore.getState().queue.jobs[0].accountBinding.credentialRef).toBe(oldCredentialRef); expect(container.textContent).toContain('retained');
    await act(async () => { root.unmount(); });
  });

  it('preserves an old binding when reconnect fails and keeps a new binding if stale cleanup fails', async () => {
    const oldCredentialRef = 'youtube_22222222-2222-2222-2222-222222222222';
    const existing = { ...persistedAccount, id: `youtube:${connection.accountRef}`, accountRef: connection.accountRef, credentialRef: oldCredentialRef };
    usePublishingStore.setState({ accounts: [existing] });
    const failedConnect = vi.fn(async () => { throw new Error('safe connection failure'); });
    const disconnect = vi.fn(async () => ({ credentialRef: oldCredentialRef, disconnected: true }));
    window.electronAPI = { platform: 'win32', version: 'test', ffmpeg: {} as never, youtube: { connect: failedConnect, disconnect, status: vi.fn(async () => ({ ok: true as const, status: { credentialRef: oldCredentialRef, authenticated: true } })), finalizeSelection: vi.fn(), cancelSelection: vi.fn() } };
    container = document.createElement('div'); document.body.append(container); const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Settings /></I18nProvider>); }); await act(async () => {});
    await act(async () => { Array.from(container!.querySelectorAll('button')).find((button) => button.textContent?.includes('Connect another account'))?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(usePublishingStore.getState().accounts[0]).toEqual(expect.objectContaining({ credentialRef: oldCredentialRef }));
    expect(disconnect).not.toHaveBeenCalled();
    window.electronAPI.youtube.connect = vi.fn(async () => connection);
    window.electronAPI.youtube.disconnect = vi.fn(async () => { throw new Error('cleanup failure'); });
    await act(async () => { Array.from(container!.querySelectorAll('button')).find((button) => button.textContent?.includes('Connect another account'))?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(usePublishingStore.getState().accounts[0]).toEqual(expect.objectContaining({ credentialRef: connection.credentialRef, authenticated: true }));
    expect(container.textContent).toContain('previous YouTube credential was retained');
    await act(async () => { root.unmount(); });
  });

  it('does not remove unrelated or identical credential references during a connection', async () => {
    const disconnect = vi.fn(async (credentialRef: string) => ({ credentialRef, disconnected: true }));
    usePublishingStore.setState({ accounts: [{ ...persistedAccount, id: 'youtube:unrelated', accountRef: 'unrelated', channelRef: 'unrelated', credentialRef: 'youtube_33333333-3333-3333-3333-333333333333' }] });
    window.electronAPI = { platform: 'win32', version: 'test', ffmpeg: {} as never, youtube: { connect: vi.fn(async () => connection), disconnect, status: vi.fn(async () => ({ ok: true as const, status: { credentialRef: 'youtube_33333333-3333-3333-3333-333333333333', authenticated: true } })), finalizeSelection: vi.fn(), cancelSelection: vi.fn() } };
    container = document.createElement('div'); document.body.append(container); const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Settings /></I18nProvider>); }); await act(async () => {});
    await act(async () => { Array.from(container!.querySelectorAll('button')).find((button) => button.textContent?.includes('Connect another account'))?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(disconnect).not.toHaveBeenCalled();
    await act(async () => { root.unmount(); });
    usePublishingStore.setState({ accounts: [{ ...persistedAccount, id: `youtube:${connection.accountRef}`, accountRef: connection.accountRef, credentialRef: connection.credentialRef }] });
    const identicalRoot = createRoot(container!);
    await act(async () => { identicalRoot.render(<I18nProvider><Settings /></I18nProvider>); }); await act(async () => {});
    await act(async () => { Array.from(container!.querySelectorAll('button')).find((button) => button.textContent?.includes('Connect another account'))?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(disconnect).not.toHaveBeenCalled();
    await act(async () => { identicalRoot.unmount(); });
  });

  it('presents a safe multi-channel selector, finalizes the chosen channel, and supports cancellation', async () => {
    const selection = { platform: 'youtube' as const, status: 'selection-required' as const, selectionRef: 'youtube_selection_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', channels: [{ channelId: 'UC-A', displayName: 'Channel A' }, { channelId: 'UC-B', displayName: 'Channel B' }] };
    const connect = vi.fn(async () => selection);
    const finalizeSelection = vi.fn(async () => ({ ...connection, accountRef: 'UC-B', channelRef: 'UC-B', displayName: 'Channel B' }));
    const cancelSelection = vi.fn(async () => ({ selectionRef: selection.selectionRef, cancelled: true }));
    window.electronAPI = { platform: 'win32', version: 'test', ffmpeg: {} as never, youtube: { connect, disconnect: vi.fn(), status: vi.fn(async () => ({ ok: true as const, status: { credentialRef: connection.credentialRef, authenticated: true } })), finalizeSelection, cancelSelection } };
    container = document.createElement('div'); document.body.append(container); const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Settings /></I18nProvider>); }); await act(async () => {});
    await act(async () => { Array.from(container!.querySelectorAll('button')).find((button) => button.textContent?.includes('Connect'))?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toContain('Channel A'); expect(container.textContent).toContain('Channel B');
    await act(async () => { Array.from(container!.querySelectorAll('button')).find((button) => button.textContent?.includes('Channel B'))?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(finalizeSelection).toHaveBeenCalledWith(selection.selectionRef, 'UC-B');
    expect(usePublishingStore.getState().accounts[0]).toEqual(expect.objectContaining({ channelRef: 'UC-B', displayName: 'Channel B', credentialRef: connection.credentialRef }));
    usePublishingStore.setState({ accounts: [] });
    await act(async () => { Array.from(container!.querySelectorAll('button')).find((button) => button.textContent?.includes('Connect another account'))?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await act(async () => { Array.from(container!.querySelectorAll('button')).find((button) => button.textContent === 'Cancel')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(cancelSelection).toHaveBeenCalledWith(selection.selectionRef);
    expect(usePublishingStore.getState().accounts).toEqual([]);
    await act(async () => { root.unmount(); });
  });

  it('reconciles persisted account authentication with the native vault without touching publishing queue state', async () => {
    const status = vi.fn(async () => ({ ok: true as const, status: { credentialRef: connection.credentialRef, authenticated: false } }));
    usePublishingStore.setState({ accounts: [persistedAccount], queue: { jobs: [{ id: 'preserved-job' } as never], activeJobId: null, paused: false } });
    window.electronAPI = { platform: 'win32', version: 'test', ffmpeg: {} as never, youtube: { connect: vi.fn(), disconnect: vi.fn(), status, finalizeSelection: vi.fn(), cancelSelection: vi.fn() } };
    container = document.createElement('div'); document.body.append(container); const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Settings /></I18nProvider>); });
    await vi.waitFor(() => expect(usePublishingStore.getState().accounts[0]).toEqual(expect.objectContaining({ authenticated: false, credentialRef: connection.credentialRef })));
    expect(usePublishingStore.getState().queue.jobs).toHaveLength(1);
    expect(container.textContent).toContain('Reconnect YouTube');
    await act(async () => { root.unmount(); });
  });

  it('uses the structured secure-storage failure code to require reconnect without parsing messages', async () => {
    const status = vi.fn(async () => ({ ok: false as const, error: { code: 'secure-storage-unavailable', message: 'A deliberately unrelated safe message.' } }));
    usePublishingStore.setState({ accounts: [persistedAccount] });
    window.electronAPI = { platform: 'win32', version: 'test', ffmpeg: {} as never, youtube: { connect: vi.fn(), disconnect: vi.fn(), status, finalizeSelection: vi.fn(), cancelSelection: vi.fn() } };
    container = document.createElement('div'); document.body.append(container); const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Settings /></I18nProvider>); });
    await vi.waitFor(() => expect(usePublishingStore.getState().accounts[0]).toEqual(expect.objectContaining({ authenticated: false, credentialRef: connection.credentialRef })));
    expect(container.textContent).toContain('Reconnect YouTube');
    await act(async () => { root.unmount(); });
  });

  it('keeps persisted accounts connected for valid status and preserves them on transient status failure', async () => {
    const status = vi.fn(async () => ({ ok: true as const, status: { credentialRef: connection.credentialRef, authenticated: true } }));
    usePublishingStore.setState({ accounts: [persistedAccount] });
    window.electronAPI = { platform: 'win32', version: 'test', ffmpeg: {} as never, youtube: { connect: vi.fn(), disconnect: vi.fn(), status, finalizeSelection: vi.fn(), cancelSelection: vi.fn() } };
    container = document.createElement('div'); document.body.append(container); const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Settings /></I18nProvider>); }); await vi.waitFor(() => expect(status).toHaveBeenCalled());
    expect(usePublishingStore.getState().accounts[0]).toEqual(expect.objectContaining({ authenticated: true, credentialRef: connection.credentialRef }));
    await act(async () => { root.unmount(); });
    const transient = vi.fn(async () => ({ ok: false as const, error: { code: 'youtube-network-failure', message: 'Unable to verify the YouTube account right now. Please try again later.' } }));
    window.electronAPI.youtube.status = transient;
    container = document.createElement('div'); document.body.append(container); const retryRoot = createRoot(container);
    await act(async () => { retryRoot.render(<I18nProvider><Settings /></I18nProvider>); }); await vi.waitFor(() => expect(transient).toHaveBeenCalled());
    expect(usePublishingStore.getState().accounts[0]).toEqual(expect.objectContaining({ authenticated: true, credentialRef: connection.credentialRef }));
    await act(async () => { retryRoot.unmount(); });
  });

  it('preserves an unusable credential reference so reconnect can rebind every nonterminal job', async () => {
    const oldCredentialRef = 'youtube_22222222-2222-2222-2222-222222222222';
    const oldAccount = { ...persistedAccount, credentialRef: oldCredentialRef };
    const unrelatedAccount = { ...oldAccount, id: 'youtube:other', accountRef: 'other', channelRef: 'UC-other', credentialRef: 'youtube_33333333-3333-3333-3333-333333333333' };
    const jobs = [publishingJob('queued', 'queued', oldAccount), publishingJob('scheduled', 'scheduled', oldAccount), publishingJob('reconciling', 'reconciling', oldAccount), publishingJob('published', 'published', oldAccount), publishingJob('unrelated', 'scheduled', unrelatedAccount)];
    const replacement = { ...connection, accountRef: oldAccount.accountRef, channelRef: oldAccount.channelRef!, credentialRef: connection.credentialRef };
    const disconnect = vi.fn(async (credentialRef: string) => ({ credentialRef, disconnected: true }));
    usePublishingStore.setState({ accounts: [oldAccount, unrelatedAccount], queue: { jobs, activeJobId: null, paused: false } });
    window.electronAPI = { platform: 'win32', version: 'test', ffmpeg: {} as never, youtube: { connect: vi.fn(async () => replacement), disconnect, status: vi.fn(async (credentialRef: string) => credentialRef === oldCredentialRef ? ({ ok: false as const, error: { code: 'credential-missing', message: 'Reconnect required.' } }) : ({ ok: true as const, status: { credentialRef, authenticated: true } })), finalizeSelection: vi.fn(), cancelSelection: vi.fn() } };
    container = document.createElement('div'); document.body.append(container); const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Settings /></I18nProvider>); });
    await vi.waitFor(() => expect(usePublishingStore.getState().accounts.find((account) => account.id === oldAccount.id)).toEqual(expect.objectContaining({ authenticated: false, credentialRef: oldCredentialRef })));
    await act(async () => { Array.from(container!.querySelectorAll('button')).find((button) => button.textContent?.includes('Reconnect YouTube'))?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const rebound = usePublishingStore.getState().queue.jobs;
    expect(rebound.filter((job) => ['queued', 'scheduled', 'reconciling'].includes(job.id)).every((job) => job.accountBinding.credentialRef === replacement.credentialRef)).toBe(true);
    expect(rebound.find((job) => job.id === 'published')?.accountBinding.credentialRef).toBe(oldCredentialRef);
    expect(rebound.find((job) => job.id === 'unrelated')?.accountBinding.credentialRef).toBe(unrelatedAccount.credentialRef);
    expect(disconnect).toHaveBeenCalledWith(oldCredentialRef);
    await act(async () => { root.unmount(); });
  });

  it('keeps an in-flight native status reconciliation valid across unrelated Settings renders', async () => {
    let resolveStatus!: (value: YouTubeStatusResult | YouTubeStatusFailure) => void;
    const status = vi.fn(() => new Promise<YouTubeStatusResult | YouTubeStatusFailure>((resolve) => { resolveStatus = resolve; }));
    usePublishingStore.setState({ accounts: [persistedAccount] });
    window.electronAPI = { platform: 'win32', version: 'test', ffmpeg: {} as never, youtube: { connect: vi.fn(), disconnect: vi.fn(), status, finalizeSelection: vi.fn(), cancelSelection: vi.fn() } };
    container = document.createElement('div'); document.body.append(container); const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Settings /></I18nProvider>); }); await vi.waitFor(() => expect(status).toHaveBeenCalledOnce());
    await act(async () => { root.render(<I18nProvider><Settings /></I18nProvider>); });
    expect(status).toHaveBeenCalledOnce();
    await act(async () => { resolveStatus({ ok: false, error: { code: 'credential-missing', message: 'Reconnect required.' } }); });
    expect(usePublishingStore.getState().accounts[0]).toEqual(expect.objectContaining({ authenticated: false, credentialRef: connection.credentialRef }));
    await act(async () => { root.unmount(); });
  });

  it('does not allow a stale initialization status response to overwrite a later disconnect', async () => {
    let resolveStatus!: (value: YouTubeStatusResult) => void;
    const status = vi.fn(() => new Promise<YouTubeStatusResult>((resolve) => { resolveStatus = resolve; }));
    const disconnect = vi.fn(async () => ({ credentialRef: connection.credentialRef, disconnected: true }));
    usePublishingStore.setState({ accounts: [persistedAccount] });
    window.electronAPI = { platform: 'win32', version: 'test', ffmpeg: {} as never, youtube: { connect: vi.fn(), disconnect, status, finalizeSelection: vi.fn(), cancelSelection: vi.fn() } };
    container = document.createElement('div'); document.body.append(container); const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Settings /></I18nProvider>); }); await vi.waitFor(() => expect(status).toHaveBeenCalled());
    await act(async () => { Array.from(container!.querySelectorAll('button')).find((button) => button.textContent?.includes('Disconnect'))?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await act(async () => { resolveStatus({ ok: true, status: { credentialRef: connection.credentialRef, authenticated: true } }); });
    expect(disconnect).toHaveBeenCalledWith(connection.credentialRef);
    expect(usePublishingStore.getState().accounts[0]).toEqual(expect.objectContaining({ authenticated: false, credentialRef: null }));
    await act(async () => { root.unmount(); });
  });

  it('does not expose a legacy browser OAuth fallback outside Electron', async () => {
    container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Settings /></I18nProvider>); });
    await act(async () => {});
    expect(container.textContent).toContain('Native YouTube connection is available in the ShortsFlow desktop app.');
    expect(Array.from(container.querySelectorAll('button')).some((button) => button.textContent?.includes('Connect'))).toBe(false);
    await act(async () => { root.unmount(); });
  });
});
