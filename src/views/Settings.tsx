import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Palette, Plug, Zap, Clock, Save, Check, Key, Youtube, Eye, EyeOff, ExternalLink, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { AppSetting, Channel } from '@/lib/types';
import { Card, Button, Toggle } from '@/components/ui';
import { saveApiKey } from '@/lib/api';
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
  const [settings, setSettings] = useState<Record<string, AppSetting>>({});
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  // API keys
  const [apiKeyStatus, setApiKeyStatus] = useState<Record<string, boolean>>({});
  const [openaiKey, setOpenaiKey] = useState('');
  const [elevenlabsKey, setElevenlabsKey] = useState('');
  const [pexelsKey, setPexelsKey] = useState('');
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [savingKey, setSavingKey] = useState('');
  const [keySaved, setKeySaved] = useState('');

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
    (async () => {
      const [{ data: s }, { data: keys }] = await Promise.all([
        supabase.from('app_settings').select('*'),
        supabase.from('api_keys').select('key'),
      ]);
      const map: Record<string, AppSetting> = {};
      s?.forEach((row) => { map[row.key] = row; });
      setSettings(map);
      const keyMap: Record<string, boolean> = {};
      keys?.forEach((row: { key: string }) => { keyMap[row.key] = true; });
      setApiKeyStatus(keyMap);
      setLoading(false);
    })();
  }, []);

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
          if ((result.error.code === 'credential-missing' || result.error.code === 'credential-reconnect-required' || result.error.code === 'secure-storage-unavailable') && account.authenticated) upsertPublishingAccount({ ...account, authenticated: false });
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

  async function updateSetting(key: string, value: Record<string, unknown>) {
    await supabase.from('app_settings').upsert({
      key,
      value,
      updated_at: new Date().toISOString(),
    });
    setSettings((prev) => ({ ...prev, [key]: { ...prev[key], value } }));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleSaveKey(key: string, value: string) {
    setSavingKey(key);
    try {
      await saveApiKey(key, value);
      setApiKeyStatus((prev) => ({ ...prev, [key]: true }));
      setKeySaved(key);
      setTimeout(() => setKeySaved(''), 2000);
      if (key === 'openai') setOpenaiKey('');
      if (key === 'elevenlabs') setElevenlabsKey('');
    } finally {
      setSavingKey('');
    }
  }

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

  if (loading) return <div className="py-16 text-center text-slate-400">{t('common.loading')}</div>;

  const notifications = (settings.notifications?.value ?? {}) as Record<string, boolean>;
  const integrations = (settings.integrations?.value ?? {}) as Record<string, boolean>;
  const automation = (settings.automation?.value ?? {}) as Record<string, boolean>;
  const postingSchedule = (settings.posting_schedule?.value ?? {}) as Record<string, string[]>;

  const notificationList = [
    { key: 'emailAlerts', label: t('settings.emailAlerts'), desc: t('settings.emailAlertsDesc') },
    { key: 'pushAlerts', label: t('settings.pushAlerts'), desc: t('settings.pushAlertsDesc') },
    { key: 'autoReplyComments', label: t('settings.autoReplyComments'), desc: t('settings.autoReplyCommentsDesc') },
    { key: 'weeklyReport', label: t('settings.weeklyReport'), desc: t('settings.weeklyReportDesc') },
  ];

  const automationList = [
    { key: 'autoGenerate', label: t('settings.autoGenerate'), desc: t('settings.autoGenerateDesc') },
    { key: 'autoPublish', label: t('settings.autoPublish'), desc: t('settings.autoPublishDesc') },
    { key: 'autoThumbnail', label: t('settings.autoThumbnail'), desc: t('settings.autoThumbnailDesc') },
    { key: 'autoHashtags', label: t('settings.autoHashtags'), desc: t('settings.autoHashtagsDesc') },
    { key: 'autoReply', label: t('settings.autoReply'), desc: t('settings.autoReplyDesc') },
  ];

  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('settings.title')}</h1>
          <p className="text-sm text-slate-500">{t('settings.subtitle')}</p>
        </div>
        {saved && (
          <span className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700">
            <Check size={16} /> {t('settings.saved')}
          </span>
        )}
      </div>

      {/* API Keys */}
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <Key size={18} className="text-slate-500" />
          <h3 className="font-semibold text-slate-900">{t('settings.apiKeys')}</h3>
        </div>
        <p className="mb-4 text-sm text-slate-500">
          {t('settings.apiKeysDesc')}
        </p>
        <div className="space-y-4">
          {/* OpenAI */}
          <ApiKeyRow
            label={t('settings.openaiKey')}
            desc={t('settings.openaiDesc')}
            placeholder="sk-..."
            value={openaiKey}
            onChange={setOpenaiKey}
            show={showKeys.openai}
            onToggleShow={() => setShowKeys((p) => ({ ...p, openai: !p.openai }))}
            configured={apiKeyStatus.openai}
            saving={savingKey === 'openai'}
            saved={keySaved === 'openai'}
            onSave={() => handleSaveKey('openai', openaiKey)}
            docsUrl="https://platform.openai.com/api-keys"
          />
          {/* ElevenLABS */}
          <ApiKeyRow
            label={t('settings.elevenlabsKey')}
            desc={t('settings.elevenlabsDesc')}
            placeholder="el-..."
            value={elevenlabsKey}
            onChange={setElevenlabsKey}
            show={showKeys.elevenlabs}
            onToggleShow={() => setShowKeys((p) => ({ ...p, elevenlabs: !p.elevenlabs }))}
            configured={apiKeyStatus.elevenlabs}
            saving={savingKey === 'elevenlabs'}
            saved={keySaved === 'elevenlabs'}
            onSave={() => handleSaveKey('elevenlabs', elevenlabsKey)}
            docsUrl="https://elevenlabs.io/app/settings/api-keys"
          />
          {/* Pexels */}
          <ApiKeyRow
            label={t('settings.pexelsKey')}
            desc={t('settings.pexelsDesc')}
            placeholder="Pexels API key..."
            value={pexelsKey}
            onChange={setPexelsKey}
            show={showKeys.pexels}
            onToggleShow={() => setShowKeys((p) => ({ ...p, pexels: !p.pexels }))}
            configured={apiKeyStatus.pexels}
            saving={savingKey === 'pexels'}
            saved={keySaved === 'pexels'}
            onSave={() => handleSaveKey('pexels', pexelsKey)}
            docsUrl="https://www.pexels.com/api/"
          />
        </div>
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

      {/* Integrations */}
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <Plug size={18} className="text-slate-500" />
          <h3 className="font-semibold text-slate-900">{t('settings.integrations')}</h3>
        </div>
        <div className="space-y-3">
          {[
            { key: 'youtube', label: t('settings.ytDataApi'), desc: t('settings.ytDataApiDesc') },
            { key: 'openai', label: t('settings.openaiIntegration'), desc: t('settings.openaiIntegrationDesc') },
            { key: 'elevenlabs', label: t('settings.elevenlabsIntegration'), desc: t('settings.elevenlabsIntegrationDesc') },
            { key: 'canva', label: t('settings.canva'), desc: t('settings.canvaDesc') },
            { key: 'rss', label: t('settings.rss'), desc: t('settings.rssDesc') },
          ].map((item) => (
            <div key={item.key} className="flex items-center justify-between rounded-lg border border-slate-100 p-3">
              <div>
                <p className="text-sm font-medium text-slate-800">{item.label}</p>
                <p className="text-xs text-slate-500">{item.desc}</p>
              </div>
              <Toggle
                checked={integrations[item.key] ?? false}
                onChange={(checked) => updateSetting('integrations', { ...integrations, [item.key]: checked })}
              />
            </div>
          ))}
        </div>
      </Card>

      {/* Automation */}
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <Zap size={18} className="text-slate-500" />
          <h3 className="font-semibold text-slate-900">{t('settings.automationDefaults')}</h3>
        </div>
        <div className="space-y-3">
          {automationList.map((item) => (
            <div key={item.key} className="flex items-center justify-between rounded-lg border border-slate-100 p-3">
              <div>
                <p className="text-sm font-medium text-slate-800">{item.label}</p>
                <p className="text-xs text-slate-500">{item.desc}</p>
              </div>
              <Toggle
                checked={automation[item.key] ?? false}
                onChange={(checked) => updateSetting('automation', { ...automation, [item.key]: checked })}
              />
            </div>
          ))}
        </div>
      </Card>

      {/* Notifications */}
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <Bell size={18} className="text-slate-500" />
          <h3 className="font-semibold text-slate-900">{t('settings.notifications')}</h3>
        </div>
        <div className="space-y-3">
          {notificationList.map((item) => (
            <div key={item.key} className="flex items-center justify-between rounded-lg border border-slate-100 p-3">
              <div>
                <p className="text-sm font-medium text-slate-800">{item.label}</p>
                <p className="text-xs text-slate-500">{item.desc}</p>
              </div>
              <Toggle
                checked={notifications[item.key] ?? false}
                onChange={(checked) => updateSetting('notifications', { ...notifications, [item.key]: checked })}
              />
            </div>
          ))}
        </div>
      </Card>

      {/* Posting Schedule */}
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <Clock size={18} className="text-slate-500" />
          <h3 className="font-semibold text-slate-900">{t('settings.postingSchedule')}</h3>
        </div>
        <div className="space-y-2">
          {days.map((day) => (
            <div key={day} className="flex items-center gap-3">
              <span className="w-24 text-sm font-medium capitalize text-slate-700">{day}</span>
              <div className="flex flex-wrap gap-1.5">
                {(postingSchedule[day] ?? []).map((time, i) => (
                  <span key={i} className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{time}</span>
                ))}
                {(postingSchedule[day] ?? []).length === 0 && (
                  <span className="text-xs text-slate-400">{t('settings.noPostsScheduled')}</span>
                )}
              </div>
            </div>
          ))}
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
            <p className="text-xs text-slate-500">Automation Studio</p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function ApiKeyRow({ label, desc, placeholder, value, onChange, show, onToggleShow, configured, saving, saved, onSave, docsUrl }: {
  label: string;
  desc: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggleShow: () => void;
  configured: boolean;
  saving: boolean;
  saved: boolean;
  onSave: () => void;
  docsUrl?: string;
}) {
  const { t } = useI18n();

  return (
    <div className="rounded-lg border border-slate-100 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-800">{label}</p>
          <p className="text-xs text-slate-500">{desc}</p>
        </div>
        {configured && (
          <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
            <Check size={10} /> {t('settings.configured')}
          </span>
        )}
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type={show ? 'text' : 'password'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={configured ? '•••••••• (enter new key to replace)' : placeholder}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 pr-10 text-sm outline-none focus:border-slate-400"
          />
          <button onClick={onToggleShow} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <Button size="sm" onClick={onSave} disabled={!value.trim() || saving}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : <Save size={14} />}
          {saved ? t('settings.saved') : t('settings.getApiKey').split(' ')[0]}
        </Button>
      </div>
      {docsUrl && (
        <a href={docsUrl} target="_blank" rel="noopener noreferrer"
          className="mt-1.5 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
          {t('settings.getApiKey')} <ExternalLink size={10} />
        </a>
      )}
    </div>
  );
}
