import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthSessionStore } from '@/auth/session';
import { advanceValidatedOwnerGeneration, setValidatedOwnerId } from '@/auth/identity';
import { I18nProvider } from '@/lib/i18n';
import { saveStudioDraft, type StudioDraft } from '@/lib/studioDraft';
import type { CanonicalChannelIdentity } from '@/services/canonicalChannelCatalog';
import { reconcileCharacterProfileSelection } from '@/services/characterProfileSelection';
import { useProjectStore } from '@/store';
import { Studio } from '@/views/Studio';

const mocks = vi.hoisted(() => ({
  getProviderStatus: vi.fn(), searchImages: vi.fn(), searchVideos: vi.fn(),
  aiService: {
    generateScript: vi.fn(), generateHooks: vi.fn(), generateSEO: vi.fn(), analyzeScript: vi.fn(),
  },
  translateSubtitles: vi.fn(),
  from: vi.fn(() => ({
    select: vi.fn(() => Object.assign(Promise.resolve({ data: [] }), {
      eq: vi.fn(async () => ({ data: [] })),
    })),
  })),
}));

vi.mock('@/lib/supabase', () => ({ isSupabaseConfigured: false, supabase: { from: mocks.from } }));
vi.mock('@/lib/api', () => ({
  getProviderStatus: mocks.getProviderStatus, generateVoiceover: vi.fn(), listVoices: vi.fn(async () => []), uploadMedia: vi.fn(),
  searchImages: mocks.searchImages, searchVideos: mocks.searchVideos, generateAIImage: vi.fn(), researchFootage: vi.fn(),
  generateSRT: vi.fn(() => '1\\n00:00:00,000 --> 00:00:05,000\\nScene'), translateSubtitles: mocks.translateSubtitles,
}));
vi.mock('@/core/di', () => ({ applicationContainer: { resolve: () => mocks.aiService }, dependencyTokens: { aiApplicationService: Symbol('ai'), mediaEngine: Symbol('media') } }));
vi.mock('@/lib/videoRenderer', () => ({ renderVideo: vi.fn() }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('Studio provider availability', () => {
  let container: HTMLDivElement | null = null;

  beforeEach(() => {
    setValidatedOwnerId('studio-test-user');
    useAuthSessionStore.setState({ status: 'authenticated', user: { id: 'studio-test-user' } as never, session: { access_token: 'token' } as never, error: null });
    useProjectStore.setState({ currentProject: null, drafts: [] });
  });

  afterEach(() => {
    container?.remove();
    container = null;
    window.localStorage.clear();
    vi.clearAllMocks();
    useProjectStore.setState({ currentProject: null, drafts: [] });
  });

  it('derives credential-dependent controls from the safe status response while retaining template script generation', async () => {
    mocks.getProviderStatus.mockResolvedValue({ openai: { configured: false }, elevenlabs: { configured: false }, pexels: { configured: false } });
    saveStudioDraft(draft('topic'));
    container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Studio channels={[channel()]} onNavigateDirector={vi.fn()} /></I18nProvider>); });
    await act(async () => {});

    expect(mocks.getProviderStatus).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Built-in template engine');
    expect(Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Generate Script'))?.disabled).toBe(false);
    await act(async () => { root.unmount(); });
  });

  it('fails closed and reports a safe status error when the endpoint is unavailable', async () => {
    mocks.getProviderStatus.mockRejectedValue(new Error('database credentials should not leak'));
    saveStudioDraft(draft('script'));
    container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Studio channels={[channel()]} onNavigateDirector={vi.fn()} /></I18nProvider>); });
    await act(async () => {});

    expect(container.textContent).toContain('Provider availability could not be checked');
    expect(container.textContent).not.toContain('database credentials should not leak');
    expect(Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Generate AI Image'))?.disabled).toBe(true);
    expect(container.textContent).not.toContain('Auto-fetch images');
    expect(container.textContent).not.toContain('Auto-fetch B-roll');
    await act(async () => { root.unmount(); });
  });

  it('keeps the ElevenLabs control disabled when its server-side credential is absent', async () => {
    mocks.getProviderStatus.mockResolvedValue({ openai: { configured: false }, elevenlabs: { configured: false }, pexels: { configured: false } });
    saveStudioDraft(draft('voice'));
    container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Studio channels={[channel()]} onNavigateDirector={vi.fn()} /></I18nProvider>); });
    await act(async () => {});

    const elevenLabs = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('ElevenLabs'));
    expect(elevenLabs).toBeDefined();
    expect(elevenLabs?.disabled).toBe(true);
    await act(async () => { root.unmount(); });
  });

  it('reports an aggregated image-search failure instead of silently doing nothing', async () => {
    mocks.getProviderStatus.mockResolvedValue({ openai: { configured: false }, elevenlabs: { configured: false }, pexels: { configured: true } });
    mocks.searchImages.mockRejectedValue(new Error('Pexels unavailable'));
    saveStudioDraft(draft('script'));
    container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Studio channels={[channel()]} onNavigateDirector={vi.fn()} /></I18nProvider>); });
    await act(async () => {});
    const fetchImages = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Auto-fetch images'));
    expect(Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Auto-fetch B-roll'))).toBeDefined();
    await act(async () => { fetchImages?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toContain('Unable to complete images');
    await act(async () => { root.unmount(); });
  });

  it.each([
    ['Generate Hooks', 'generateHooks', 'Hook generation could not be completed. Try again.'],
    ['Analyze Script', 'analyzeScript', 'Script analysis could not be completed. Try again.'],
    ['Generate SEO Metadata', 'generateSEO', 'SEO metadata could not be generated. Try again.'],
  ] as const)('shows bounded feedback when %s fails', async (label, method, message) => {
    mocks.getProviderStatus.mockResolvedValue({ openai: { configured: true }, elevenlabs: { configured: false }, pexels: { configured: false } });
    mocks.aiService[method].mockRejectedValue(new Error('provider secret must not appear'));
    saveStudioDraft(draft('style'));
    const root = await renderStudio();

    await clickButton(label);
    expect(container?.textContent).toContain(message);
    expect(container?.textContent).not.toContain('provider secret must not appear');
    await act(async () => { root.unmount(); });
  });

  it('shows bounded feedback when subtitle translation fails', async () => {
    mocks.getProviderStatus.mockResolvedValue({ openai: { configured: false }, elevenlabs: { configured: false }, pexels: { configured: false } });
    mocks.translateSubtitles.mockRejectedValue(new Error('provider secret must not appear'));
    saveStudioDraft(draft('style'));
    const root = await renderStudio();

    await clickButton('Translate & Download');
    expect(container?.textContent).toContain('Subtitle translation could not be completed. Try again.');
    expect(container?.textContent).not.toContain('provider secret must not appear');
    await act(async () => { root.unmount(); });
  });

  it('does not show failure feedback for a successful generated result and prevents duplicate pending hooks', async () => {
    const pending = deferred<Array<{ text: string; formula: string; predictedScore: number }>>();
    mocks.getProviderStatus.mockResolvedValue({ openai: { configured: true }, elevenlabs: { configured: false }, pexels: { configured: false } });
    mocks.aiService.generateHooks.mockReturnValue(pending.promise);
    saveStudioDraft(draft('style'));
    const root = await renderStudio();

    const hooksButton = Array.from(container?.querySelectorAll('button') ?? []).find((candidate) => candidate.textContent?.includes('Generate Hooks'));
    expect(hooksButton).toBeDefined();
    await act(async () => { hooksButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const pendingButton = Array.from(container?.querySelectorAll('button') ?? []).find((candidate) => candidate.textContent?.includes('Generating hooks'));
    expect(pendingButton?.disabled).toBe(true);
    await act(async () => { pendingButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(mocks.aiService.generateHooks).toHaveBeenCalledTimes(1);

    await act(async () => { pending.resolve([{ text: 'Local fallback result', formula: 'Template', predictedScore: 85 }]); });
    expect(container?.textContent).toContain('Local fallback result');
    expect(container?.textContent).not.toContain('Hook generation could not be completed. Try again.');
    await act(async () => { root.unmount(); });
  });

  it('does not expose the style-step B-roll fetch control when Pexels is unavailable', async () => {
    mocks.getProviderStatus.mockResolvedValue({ openai: { configured: false }, elevenlabs: { configured: false }, pexels: { configured: false } });
    saveStudioDraft(draft('style'));
    const root = await renderStudio();

    expect(container?.textContent).not.toContain('Use stock video clips instead of images');
    expect(container?.textContent).not.toContain('Fetch B-roll clips for all scenes');
    await act(async () => { root.unmount(); });
  });

  it('does not apply a stale prior-owner character profile query after an A to B transition', async () => {
    const pendingA = deferred<{ data: Array<{ id: string; user_id: string; name: string; description: null; appearance: null; art_style: string; reference_url: null; created_at: string }> }>();
    mocks.getProviderStatus.mockResolvedValue({ openai: { configured: false }, elevenlabs: { configured: false }, pexels: { configured: false } });
    mocks.from.mockImplementation(((table: string) => {
      if (table === 'visual_styles') return { select: vi.fn(() => Promise.resolve({ data: [] })) };
      if (table === 'character_profiles') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((_column: string, ownerId: string) => ownerId === 'studio-test-user'
              ? pendingA.promise
              : Promise.resolve({ data: [profile('profile-b', 'studio-user-b', 'B profile')] })),
          })),
        };
      }
      return { select: vi.fn(() => Promise.resolve({ data: [] })) };
    }) as never);
    saveStudioDraft(draft('style'));
    container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Studio channels={[channel()]} onNavigateDirector={vi.fn()} /></I18nProvider>); });
    await act(async () => {});

    setValidatedOwnerId('studio-user-b');
    advanceValidatedOwnerGeneration();
    await act(async () => {
      useAuthSessionStore.setState({ status: 'authenticated', user: { id: 'studio-user-b' } as never, session: { access_token: 'token-b' } as never, error: null });
    });
    await act(async () => {});
    expect(container.textContent).toContain('B profile');

    await act(async () => { pendingA.resolve({ data: [profile('profile-a', 'studio-test-user', 'A profile')] }); });
    expect(container.textContent).toContain('B profile');
    expect(container.textContent).not.toContain('A profile');
    await act(async () => { root.unmount(); });
  });

  it('reconciles the selected profile only against the current owner profile list', () => {
    const owned = profile('owned-profile', 'studio-test-user', 'Owned profile');
    expect(reconcileCharacterProfileSelection('owned-profile', [owned])).toBe('owned-profile');
    expect(reconcileCharacterProfileSelection('missing-profile', [owned])).toBe('');
    expect(reconcileCharacterProfileSelection('owned-profile', [])).toBe('');
  });

  it('does not apply a stale prior-owner profile load failure after an A to B transition', async () => {
    const pendingA = deferred<{ data: Array<ReturnType<typeof profile>> }>();
    mocks.getProviderStatus.mockResolvedValue({ openai: { configured: false }, elevenlabs: { configured: false }, pexels: { configured: false } });
    mocks.from.mockImplementation(((table: string) => {
      if (table === 'visual_styles') return { select: vi.fn(() => Promise.resolve({ data: [] })) };
      if (table === 'character_profiles') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((_column: string, ownerId: string) => ownerId === 'studio-test-user'
              ? pendingA.promise
              : Promise.resolve({ data: [profile('profile-b', 'studio-user-b', 'B profile')] })),
          })),
        };
      }
      return { select: vi.fn(() => Promise.resolve({ data: [] })) };
    }) as never);
    saveStudioDraft(draft('style'));
    container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Studio channels={[channel()]} onNavigateDirector={vi.fn()} /></I18nProvider>); });
    await act(async () => {});

    setValidatedOwnerId('studio-user-b');
    advanceValidatedOwnerGeneration();
    await act(async () => {
      useAuthSessionStore.setState({ status: 'authenticated', user: { id: 'studio-user-b' } as never, session: { access_token: 'token-b' } as never, error: null });
    });
    await act(async () => {});
    await act(async () => { pendingA.reject(new Error('stale query failed')); });
    expect(container.textContent).toContain('B profile');
    await act(async () => { root.unmount(); });
  });

  async function renderStudio() {
    container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Studio channels={[channel()]} onNavigateDirector={vi.fn()} /></I18nProvider>); });
    await act(async () => {});
    return root;
  }

  async function clickButton(label: string) {
    const button = Array.from(container?.querySelectorAll('button') ?? []).find((candidate) => candidate.textContent?.includes(label));
    expect(button, `Missing ${label} button`).toBeDefined();
    await act(async () => { button?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  }
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((next, fail) => { resolve = next; reject = fail; });
  return { promise, resolve, reject };
}

function profile(id: string, userId: string, name: string) {
  return { id, user_id: userId, name, description: null, appearance: null, art_style: 'realistic', reference_url: null, created_at: '2026-08-15T00:00:00.000Z' };
}

function channel(): CanonicalChannelIdentity {
  return { id: 'youtube:UC-PROVIDER', source: 'native-youtube', legacyChannelId: null, publishingAccountId: 'youtube:provider', platform: 'youtube', channelRef: 'UC-PROVIDER', name: 'Provider channel', handle: null, niche: null, avatar_color: '#000', status: 'active', subscriber_count: 0, video_count: 0 };
}

function draft(step: StudioDraft['step']): StudioDraft {
  return { version: 1, projectId: 'provider-project', savedAt: '2026-08-13T00:00:00.000Z', step, channelId: 'youtube:UC-PROVIDER', topic: 'Provider test', niche: '', tone: 'engaging', duration: 30, title: 'Provider test', hook: '', script: 'Provider script', cta: '', scenes: [{ text: 'Scene', duration: 5, visual: 'Visual', keywords: [] }], captionStyle: 'karaoke', transitionStyle: 'crossfade', motionStyle: 'kenburns', useBroll: false, musicId: '', musicVolume: 0.25, visualMode: 'auto', selectedStyleId: '', characterName: '', characterAppearance: '', characterArtStyle: 'realistic', characterProfileId: '', watermarkText: '', watermarkPosition: 'bottom-right', showSubtitles: true, captionTextColor: '', captionHighlightColor: '', beatSync: false, voiceoverMode: 'none', selectedVoice: '', targetLanguage: 'tr' };
}
