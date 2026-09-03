import { act } from 'react';
import type { ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthSessionStore } from '@/auth/session';
import { setValidatedOwnerId } from '@/auth/identity';
import type { PublishAccount } from '@/core/publishing';
import { Sidebar } from '@/components/Sidebar';
import { useChannels } from '@/hooks/useChannels';
import { I18nProvider } from '@/lib/i18n';
import { loadStudioDraft, saveStudioDraft, type StudioDraft } from '@/lib/studioDraft';
import { buildCanonicalChannelCatalog } from '@/services/canonicalChannelCatalog';
import { useChannelStore, useProjectStore, usePublishingStore } from '@/store';
import { Studio } from '@/views/Studio';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: false,
  supabase: {
    from: () => ({
      select: async () => ({ data: [] }),
    }),
  },
}));

vi.mock('@/lib/api', () => ({
  generateVoiceover: vi.fn(),
  getProviderStatus: vi.fn(async () => ({ openai: { configured: true }, elevenlabs: { configured: true }, pexels: { configured: true } })),
  listVoices: vi.fn(async () => []),
  uploadMedia: vi.fn(),
  searchImages: vi.fn(async () => []),
  searchVideos: vi.fn(async () => []),
  generateAIImage: vi.fn(),
  researchFootage: vi.fn(),
  translateSubtitles: vi.fn(),
}));

vi.mock('@/core/di', () => ({
  applicationContainer: {
    resolve: () => ({ generateScript: vi.fn() }),
  },
  dependencyTokens: {
    aiApplicationService: Symbol('aiApplicationService'),
    mediaEngine: Symbol('mediaEngine'),
  },
}));

function account(overrides: Partial<PublishAccount> = {}): PublishAccount {
  return {
    id: 'youtube:darwin-account',
    platform: 'youtube',
    accountRef: 'darwin-account',
    channelRef: 'UC-DARWIN',
    displayName: 'Darwin',
    credentialRef: 'youtube_11111111-1111-1111-1111-111111111111',
    authenticated: true,
    createdAt: '2026-08-12T09:00:00.000Z',
    ...overrides,
  };
}

function restoredDraft(channelId: string, step: StudioDraft['step'] = 'topic'): StudioDraft {
  return {
    version: 1,
    projectId: 'restored-project',
    savedAt: '2026-08-12T09:00:00.000Z',
    step,
    channelId,
    topic: 'Restored topic',
    niche: '',
    tone: 'engaging',
    duration: 30,
    title: 'Restored title',
    hook: '',
    script: 'Restored script',
    cta: '',
    scenes: [{ sceneId: 'visual-scene-00000000-0000-4000-8000-000000000001', text: 'Restored scene', duration: 3, visual: 'Visual' }],
    captionStyle: 'karaoke',
    transitionStyle: 'crossfade',
    motionStyle: 'kenburns',
    useBroll: false,
    musicId: '',
    musicVolume: 0.25,
    visualMode: 'auto',
    selectedStyleId: '',
    characterName: '',
    characterAppearance: '',
    characterArtStyle: 'realistic',
    characterProfileId: '',
    watermarkText: '',
    watermarkPosition: 'bottom-right',
    showSubtitles: true,
    captionTextColor: '',
    captionHighlightColor: '',
    beatSync: false,
    voiceoverMode: 'none',
    selectedVoice: '',
    targetLanguage: 'tr',
  };
}

describe('native channel UI catalog', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    container?.remove();
    root = null;
    container = null;
    window.localStorage.clear();
    usePublishingStore.setState({ accounts: [] });
    useChannelStore.setState({ channels: [], initialized: true, loading: false });
    useProjectStore.setState({ currentProject: null, drafts: [] });
  });

  function mount(node: ReactNode) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    return act(async () => { root?.render(node); });
  }

  it('shows the canonical native channel in Video Studio and unlocks script creation after topic input', async () => {
    const channels = buildCanonicalChannelCatalog([], [account()]);
    await mount(<I18nProvider><Studio channels={channels} onNavigateDirector={vi.fn()} /></I18nProvider>);
    await act(async () => {});

    const channelSelect = container!.querySelector('select');
    expect(channelSelect?.value).toBe('youtube:UC-DARWIN');
    expect(channelSelect?.textContent).toContain('Darwin');
    expect(channelSelect?.querySelectorAll('option')).toHaveLength(1);

    const generateButton = Array.from(container!.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Generate Script'));
    expect(generateButton?.disabled).toBe(true);

    const topicInput = container!.querySelector('textarea') as HTMLTextAreaElement | null;
    expect(topicInput).not.toBeNull();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
        ?.call(topicInput, 'A real V1 smoke topic');
      topicInput!.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(generateButton?.disabled).toBe(false);
  });

  it('requires an explicit selection when multiple connected channels are available', async () => {
    const channels = buildCanonicalChannelCatalog([], [
      account(),
      account({ id: 'youtube:second', accountRef: 'second', channelRef: 'UC-SECOND', displayName: 'Second channel' }),
    ]);
    await mount(<I18nProvider><Studio channels={channels} onNavigateDirector={vi.fn()} /></I18nProvider>);
    await act(async () => {});

    const channelSelect = container!.querySelector('select')!;
    expect(channelSelect.value).toBe('');
    expect(channelSelect.textContent).toContain('Darwin');
    expect(channelSelect.textContent).toContain('Second channel');
    expect(channelSelect.querySelectorAll('option')).toHaveLength(3);

    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
        ?.call(channelSelect, 'youtube:UC-SECOND');
      channelSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(channelSelect.value).toBe('youtube:UC-SECOND');
  });

  it('restores the exact saved canonical channel when it remains available', async () => {
    saveStudioDraft(restoredDraft('youtube:UC-DARWIN'));
    const channels = buildCanonicalChannelCatalog([], [
      account(),
      account({ id: 'youtube:second', accountRef: 'second', channelRef: 'UC-SECOND', displayName: 'Second channel' }),
    ]);
    await mount(<I18nProvider><Studio channels={channels} onNavigateDirector={vi.fn()} /></I18nProvider>);
    await act(async () => {});

    expect(container!.querySelector<HTMLSelectElement>('select')?.value).toBe('youtube:UC-DARWIN');
  });

  it('requires explicit reselection instead of substituting the sole remaining channel on restore', async () => {
    saveStudioDraft(restoredDraft('youtube:UC-MISSING', 'publish'));
    const channels = buildCanonicalChannelCatalog([], [
      account({ id: 'youtube:second', accountRef: 'second', channelRef: 'UC-SECOND', displayName: 'Second channel' }),
    ]);
    await mount(<I18nProvider><Studio channels={channels} onNavigateDirector={vi.fn()} /></I18nProvider>);
    await act(async () => {});

    const channelSelect = container!.querySelector<HTMLSelectElement>('select')!;
    expect(channelSelect.value).toBe('');
    expect(container!.textContent).toContain('will not substitute another channel');
    expect(container!.textContent).not.toContain('Export & publish safely');
    await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 700)); });
    expect(loadStudioDraft()?.channelId).toBe('youtube:UC-MISSING');

    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(channelSelect, 'youtube:UC-SECOND');
      channelSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(channelSelect.value).toBe('youtube:UC-SECOND');
    expect(container!.textContent).not.toContain('will not substitute another channel');
    await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 700)); });
    expect(loadStudioDraft()?.channelId).toBe('youtube:UC-SECOND');
  });

  it('shows the same canonical connected channel in the sidebar', async () => {
    const channels = buildCanonicalChannelCatalog([], [account()]);
    await mount(<I18nProvider><Sidebar current="studio" onNavigate={vi.fn()} items={[]} channels={channels} /></I18nProvider>);

    expect(container?.textContent).toContain('Darwin');
    expect(container?.querySelector('[style*="rgb(255, 0, 51)"]')).not.toBeNull();
  });

  it('reacts to disconnect and keeps multiple connected native channels distinct', async () => {
    function CatalogProbe() {
      const { canonicalChannels } = useChannels();
      return <ul>{canonicalChannels.map((channel) => <li key={channel.id}>{channel.name}</li>)}</ul>;
    }

    usePublishingStore.setState({ accounts: [
      account(),
      account({ id: 'youtube:second', accountRef: 'second', channelRef: 'UC-SECOND', displayName: 'Second channel' }),
    ] });
    await mount(<CatalogProbe />);
    expect(container?.textContent).toContain('Darwin');
    expect(container?.textContent).toContain('Second channel');

    await act(async () => {
      usePublishingStore.getState().upsertAccount({ ...account(), authenticated: false, credentialRef: null });
    });
    expect(container?.textContent).not.toContain('Darwin');
    expect(container?.textContent).toContain('Second channel');
  });
});
  beforeEach(() => { setValidatedOwnerId('catalog-test-user'); useAuthSessionStore.setState({ status: 'authenticated', user: { id: 'catalog-test-user' } as never, session: { access_token: 'token' } as never, error: null }); });
