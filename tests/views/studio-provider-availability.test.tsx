import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/lib/i18n';
import { saveStudioDraft, type StudioDraft } from '@/lib/studioDraft';
import type { CanonicalChannelIdentity } from '@/services/canonicalChannelCatalog';
import { Studio } from '@/views/Studio';

const mocks = vi.hoisted(() => ({
  getProviderStatus: vi.fn(), searchImages: vi.fn(), searchVideos: vi.fn(),
  from: vi.fn(() => ({ select: vi.fn(async () => ({ data: [] })) })),
}));

vi.mock('@/lib/supabase', () => ({ isSupabaseConfigured: false, supabase: { from: mocks.from } }));
vi.mock('@/lib/api', () => ({
  getProviderStatus: mocks.getProviderStatus, generateVoiceover: vi.fn(), listVoices: vi.fn(async () => []), uploadMedia: vi.fn(),
  searchImages: mocks.searchImages, searchVideos: mocks.searchVideos, generateAIImage: vi.fn(), researchFootage: vi.fn(),
  generateSRT: vi.fn(), translateSubtitles: vi.fn(),
}));
vi.mock('@/core/di', () => ({ applicationContainer: { resolve: () => ({ generateScript: vi.fn() }) }, dependencyTokens: { aiApplicationService: Symbol('ai'), mediaEngine: Symbol('media') } }));
vi.mock('@/lib/videoRenderer', () => ({ renderVideo: vi.fn() }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('Studio provider availability', () => {
  let container: HTMLDivElement | null = null;

  afterEach(() => { container?.remove(); container = null; window.localStorage.clear(); vi.clearAllMocks(); });

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
    await act(async () => { fetchImages?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toContain('Unable to complete images');
    await act(async () => { root.unmount(); });
  });
});

function channel(): CanonicalChannelIdentity {
  return { id: 'youtube:UC-PROVIDER', source: 'native-youtube', legacyChannelId: null, publishingAccountId: 'youtube:provider', platform: 'youtube', channelRef: 'UC-PROVIDER', name: 'Provider channel', handle: null, niche: null, avatar_color: '#000', status: 'active', subscriber_count: 0, video_count: 0 };
}

function draft(step: StudioDraft['step']): StudioDraft {
  return { version: 1, projectId: 'provider-project', savedAt: '2026-08-13T00:00:00.000Z', step, channelId: 'youtube:UC-PROVIDER', topic: 'Provider test', niche: '', tone: 'engaging', duration: 30, title: 'Provider test', hook: '', script: 'Provider script', cta: '', scenes: [{ text: 'Scene', duration: 5, visual: 'Visual', keywords: [] }], captionStyle: 'karaoke', transitionStyle: 'crossfade', motionStyle: 'kenburns', useBroll: false, musicId: '', musicVolume: 0.25, visualMode: 'auto', selectedStyleId: '', characterName: '', characterAppearance: '', characterArtStyle: 'realistic', characterProfileId: '', watermarkText: '', watermarkPosition: 'bottom-right', showSubtitles: true, captionTextColor: '', captionHighlightColor: '', beatSync: false, voiceoverMode: 'none', selectedVoice: '', targetLanguage: 'tr' };
}
