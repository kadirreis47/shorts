import { useEffect, useMemo, useRef, useState } from 'react';
import { Palette, Key, Youtube, Loader2 } from 'lucide-react';
import type { Channel } from '@/lib/types';
import { Card, Button } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { usePublishingStore } from '@/store/publishingStore';
import { canRebindPublishJobCredential, type PublishAccount } from '@/core/publishing';
import { rebindPublishingAccountCredential } from '@/services/publishingController';

type NativeYouTubeBridge = NonNullable<Window['electronAPI']>['youtube'];

function hasNativeYouTubeConnectionBridge(value: unknown): value is NativeYouTubeBridge {
  if (!value || typeof value !== 'object') return false;
  const bridge = value as Partial<NativeYouTubeBridge>;
  return typeof bridge.connect === 'function'
    && typeof bridge.disconnect === 'function'
    && typeof bridge.status === 'function'
    && typeof bridge.finalizeSelection === 'function'
    && typeof bridge.cancelSelection === 'function';
}

export function Settings(_props: { channels?: Channel[] }) {
  const { t } = useI18n();

  // YouTube connections
  const [connecting, setConnecting] = useState('');
  const [youtubeConnectionError, setYoutubeConnectionError] = useState<string | null>(null);
  const [youtubeSelection, setYoutubeSelection] = useState<YouTubeSelectionRequired | null>(null);
  const accountStatusVersion = useRef(0);
  const reconciledCredentialRefs = useRef(new Set<string>());
  const publishingAccounts = usePublishingStore((state) => state.accounts);
  const upsertPublishingAccount = usePublishingStore((state) => state.upsertAccount);
  const nativeYouTube = hasNativeYouTubeConnectionBridge(window.electronAPI?.youtube);
  const nativeYouTubeAccounts = useMemo(() => publishingAccounts.filter((account) => account.platform === 'youtube'), [publishingAccounts]);

  useEffect(() => {
    if (!nativeYouTube || !window.electronAPI?.youtube) return;
    const accounts = nativeYouTubeAccounts.filter((account) => account.credentialRef && !reconciledCredentialRefs.current.has(account.credentialRef));
    if (!accounts.length) return;
    const version = ++accountStatusVersion.current;
    accounts.forEach((account) => reconciledCredentialRefs.current.add(account.credentialRef!));
    void Promise.all(accounts.map(async (account) => {
      try {
        const result = await window.electronAPI!.youtube.status(account.credentialRef!);
        if (accountStatusVersion.current !== version) return;
        if (!result.ok) {
          if ((result.error.code === 'credential-unavailable' || result.error.code === 'credential-missing' || result.error.code === 'credential-reconnect-required' || result.error.code === 'secure-storage-unavailable') && account.authenticated) upsertPublishingAccount({ ...account, authenticated: false });
          else setYoutubeConnectionError(result.error.message);
          return;
        }
        const status = result.status;
        if (!status.authenticated && account.authenticated) upsertPublishingAccount({ ...account, authenticated: false });
        if (status.authenticated && !account.authenticated) upsertPublishingAccount({ ...account, authenticated: true });
      } catch (error) {
        if (accountStatusVersion.current !== version) return;
        setYoutubeConnectionError('Unable to verify the YouTube account right now. Please try again later.');
      }
    }));
  }, [nativeYouTube, nativeYouTubeAccounts, upsertPublishingAccount]);

  async function persistYouTubeAccount(result: YouTubeConnectionResult) {
    const account: PublishAccount = {
      id: `youtube:${result.accountRef}`,
      platform: result.platform,
      accountRef: result.accountRef,
      channelRef: result.channelRef,
      displayName: result.displayName,
      credentialRef: result.credentialRef,
      authenticated: result.authenticated,
      createdAt: new Date().toISOString(),
    };
    const priorCredentialRef = usePublishingStore.getState().accounts.find((existing) => existing.id === account.id)?.credentialRef;
    if (priorCredentialRef && priorCredentialRef !== account.credentialRef && window.electronAPI?.youtube) {
      try {
        const safeToRemove = await rebindPublishingAccountCredential(account, priorCredentialRef);
        if (safeToRemove) await window.electronAPI.youtube.disconnect(priorCredentialRef);
        else setYoutubeConnectionError('The previous YouTube credential remains secured because a publishing job still references it.');
      } catch {
        setYoutubeConnectionError('The previous YouTube credential was retained because publishing bindings could not be updated safely.');
      }
    } else upsertPublishingAccount(account);
  }

  async function handleConnectYouTube() {
    if (!window.electronAPI?.youtube) {
      setYoutubeConnectionError('Native YouTube connection is available only in the ShortsFlow desktop app.');
      return;
    }
    accountStatusVersion.current += 1;
    setConnecting('youtube');
    setYoutubeConnectionError(null);
    try {
      const result = await window.electronAPI.youtube.connect();
      if ('credentialRef' in result) await persistYouTubeAccount(result);
      else setYoutubeSelection(result);
    } catch (error) {
      setYoutubeConnectionError(error instanceof Error ? error.message : 'YouTube authorization failed. You can try again.');
    } finally {
      setConnecting('');
    }
  }

  async function handleFinalizeYouTubeSelection(channelRef: string) {
    if (!window.electronAPI?.youtube || !youtubeSelection) return;
    accountStatusVersion.current += 1;
    setConnecting('youtube-selection');
    setYoutubeConnectionError(null);
    try {
      await persistYouTubeAccount(await window.electronAPI.youtube.finalizeSelection(youtubeSelection.selectionRef, channelRef));
      setYoutubeSelection(null);
    } catch (error) {
      setYoutubeSelection(null);
      setYoutubeConnectionError(error instanceof Error ? error.message : 'YouTube channel selection failed. Reconnect the account.');
    } finally {
      setConnecting('');
    }
  }

  async function handleCancelYouTubeSelection() {
    if (!window.electronAPI?.youtube || !youtubeSelection) return;
    setConnecting('youtube-selection');
    try { await window.electronAPI.youtube.cancelSelection(youtubeSelection.selectionRef); } catch { /* The main process treats an already-expired selection as cancelled. */ } finally { setYoutubeSelection(null); setConnecting(''); }
  }

  async function handleDisconnectYouTube(account: PublishAccount) {
    if (!window.electronAPI?.youtube || !account.credentialRef) return;
    accountStatusVersion.current += 1;
    setConnecting(account.id);
    setYoutubeConnectionError(null);
    try {
      const dependentJobs = usePublishingStore.getState().queue.jobs.filter((job) => canRebindPublishJobCredential(job, account, account.credentialRef!));
      if (dependentJobs.length > 0) {
        await rebindPublishingAccountCredential({ ...account, authenticated: false }, account.credentialRef);
        setYoutubeConnectionError('YouTube is disconnected for new publishing. Its secured credential is retained until dependent publishing jobs can be rebound.');
        return;
      }
      await window.electronAPI.youtube.disconnect(account.credentialRef);
      upsertPublishingAccount({ ...account, credentialRef: null, authenticated: false });
    } catch (error) {
      setYoutubeConnectionError(error instanceof Error ? error.message : 'YouTube disconnect failed. You can try again.');
    } finally {
      setConnecting('');
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('settings.title')}</h1>
          <p className="text-sm text-slate-500">{t('settings.subtitle')}</p>
        </div>
      </div>

      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <Key size={18} className="text-slate-500" />
          <h3 className="font-semibold text-slate-900">Provider credentials</h3>
        </div>
        <p className="mb-4 text-sm text-slate-500">
          Provider credentials are managed securely on the server and cannot be viewed or changed from this desktop app. Contact an administrator if a provider is unavailable.
        </p>
      </Card>

      {/* YouTube OAuth */}
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <Youtube size={18} className="text-red-500" />
          <h3 className="font-semibold text-slate-900">{t('settings.youtubeConnection')}</h3>
        </div>
        <p className="mb-4 text-sm text-slate-500">
          {t('settings.youtubeDesc')}
        </p>
        <div className="space-y-4">
          {nativeYouTube ? (
            <div className="space-y-2 border-t border-slate-100 pt-4">
              <p className="text-sm font-medium text-slate-700">YouTube desktop account</p>
              {youtubeSelection && (
                <div className="space-y-2 rounded-lg border border-slate-200 p-3">
                  <p className="text-sm text-slate-700">Choose the YouTube channel to connect.</p>
                  {youtubeSelection.channels.map((channel) => (
                    <Button key={channel.channelId} size="sm" variant="secondary" onClick={() => handleFinalizeYouTubeSelection(channel.channelId)} disabled={connecting === 'youtube-selection'}>
                      {connecting === 'youtube-selection' ? <Loader2 size={14} className="animate-spin" /> : null}
                      {channel.displayName} ({channel.channelId})
                    </Button>
                  ))}
                  <Button size="sm" variant="ghost" onClick={handleCancelYouTubeSelection} disabled={connecting === 'youtube-selection'}>Cancel</Button>
                </div>
              )}
              {nativeYouTubeAccounts.map((account) => (
                <div key={account.id} className="flex items-center justify-between rounded-lg border border-slate-100 p-3">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{account.displayName}</p>
                    <p className="text-xs text-emerald-600">{account.authenticated ? t('settings.connected') : 'Authentication required'}</p>
                  </div>
                  {account.authenticated && account.credentialRef ? (
                    <Button size="sm" variant="secondary" onClick={() => handleDisconnectYouTube(account)} disabled={connecting === account.id}>
                      {connecting === account.id ? <Loader2 size={14} className="animate-spin" /> : null}
                      Disconnect
                    </Button>
                  ) : null}
                </div>
              ))}
              <Button size="sm" variant="secondary" onClick={handleConnectYouTube} disabled={connecting === 'youtube' || Boolean(youtubeSelection)}>
                {connecting === 'youtube' ? <Loader2 size={14} className="animate-spin" /> : <Youtube size={14} />}
                {nativeYouTubeAccounts.some((account) => !account.authenticated) ? 'Reconnect YouTube' : nativeYouTubeAccounts.length > 0 ? 'Connect another account' : t('settings.connect')}
              </Button>
              {youtubeConnectionError && <p role="alert" className="text-sm text-red-600">{youtubeConnectionError}</p>}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Native YouTube connection is available in the ShortsFlow desktop app.</p>
          )}

        </div>
      </Card>

      {/* Brand */}
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <Palette size={18} className="text-slate-500" />
          <h3 className="font-semibold text-slate-900">{t('settings.brand')}</h3>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm">
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">ShortsFlow</p>
            <p className="text-xs text-slate-500">YouTube Shorts Studio</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
