import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthSessionStore } from '@/auth/session';
import { setValidatedOwnerId } from '@/auth/identity';
import { I18nProvider } from '@/lib/i18n';
import { saveStudioDraft, type StudioDraft } from '@/lib/studioDraft';
import type { CanonicalChannelIdentity } from '@/services/canonicalChannelCatalog';
import { useMediaStore, useProjectStore, usePublishingStore, useUIStore } from '@/store';
import { Studio } from '@/views/Studio';
import { editingFixture } from '../editing/fixtures';

const mocks = vi.hoisted(() => ({
  buildProject: vi.fn(),
  loadExportCapabilities: vi.fn(),
  planActiveExport: vi.fn(),
  enqueueActiveExport: vi.fn(),
  waitForActiveExport: vi.fn(),
  renderVideo: vi.fn(),
  uploadMedia: vi.fn(),
  getProviderStatus: vi.fn(async () => ({ openai: { configured: true }, elevenlabs: { configured: true }, pexels: { configured: true } })),
  from: vi.fn(() => ({
    select: vi.fn(() => Object.assign(Promise.resolve({ data: [] }), {
      eq: vi.fn(async () => ({ data: [] })),
    })),
  })),
}));

vi.mock('@/core/di', () => ({
  applicationContainer: { resolve: () => ({ buildProject: mocks.buildProject, generateScript: vi.fn() }) },
  dependencyTokens: { aiApplicationService: Symbol('aiApplicationService'), mediaEngine: Symbol('mediaEngine') },
}));
vi.mock('@/services/exportIntelligenceController', () => ({
  loadExportCapabilities: mocks.loadExportCapabilities,
  planActiveExport: mocks.planActiveExport,
  enqueueActiveExport: mocks.enqueueActiveExport,
  waitForActiveExport: mocks.waitForActiveExport,
}));
vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: false,
  supabase: { from: mocks.from },
}));
vi.mock('@/lib/api', () => ({
  generateVoiceover: vi.fn(), getProviderStatus: mocks.getProviderStatus, listVoices: vi.fn(async () => []), uploadMedia: mocks.uploadMedia,
  searchImages: vi.fn(async () => []),
  searchVideos: vi.fn(async () => []), generateAIImage: vi.fn(), researchFootage: vi.fn(),
  generateSRT: vi.fn(), translateSubtitles: vi.fn(),
}));
vi.mock('@/lib/videoRenderer', () => ({ renderVideo: mocks.renderVideo }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('Studio canonical silent export', () => {
  let container: HTMLDivElement | null = null;

  beforeEach(() => { setValidatedOwnerId('studio-test-user'); useAuthSessionStore.setState({ status: 'authenticated', user: { id: 'studio-test-user' } as never, session: { access_token: 'token' } as never, error: null }); });

  afterEach(() => {
    container?.remove();
    container = null;
    window.localStorage.clear();
    vi.clearAllMocks();
    useMediaStore.getState().clearMediaProject();
    usePublishingStore.setState({ handoff: null, videoExportLinks: {} });
    useProjectStore.setState({ currentProject: null, drafts: [] });
    useUIStore.setState({ currentView: 'dashboard' });
  });

  it('passes the explicit silent intent through the same canonical engine used by export', async () => {
    const fixture = await editingFixture();
    const validBuild = {
      ...fixture,
      renderReady: true,
      validation: { ...fixture.validation, valid: true, renderReady: true, errorCount: 0 },
    };
    mocks.buildProject.mockResolvedValue(validBuild);
    mocks.loadExportCapabilities.mockResolvedValue(undefined);
    mocks.planActiveExport.mockResolvedValue({ id: 'plan', blockingIssues: [] });
    mocks.enqueueActiveExport.mockResolvedValue({ id: 'export' });
    mocks.waitForActiveExport.mockResolvedValue({ id: 'export' });
    window.electronAPI = {
      ...window.electronAPI,
      ffmpeg: { ...window.electronAPI?.ffmpeg, pickOutputPath: vi.fn().mockResolvedValue('C:/exports/silent.mp4') },
    } as typeof window.electronAPI;
    saveStudioDraft(silentDraft());

    container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Studio channels={[channel()]} onNavigateDirector={vi.fn()} /></I18nProvider>); });

    const publish = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Export & publish safely'));
    expect(publish).toBeDefined();
    await act(async () => { publish?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    expect(mocks.buildProject).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'silent-project',
      audio: { narrationMode: 'silent' },
    }));
    expect(mocks.planActiveExport).toHaveBeenCalledWith('youtube-shorts');
    expect(mocks.enqueueActiveExport).toHaveBeenCalledWith(expect.anything(), 'C:/exports/silent.mp4');
    expect(mocks.waitForActiveExport).toHaveBeenCalledWith('export');
    await act(async () => { root.unmount(); });
  });

  it('identifies the blocking scene instead of showing only a generic canonical-media failure', async () => {
    const fixture = await editingFixture();
    mocks.buildProject.mockResolvedValue({
      ...fixture,
      renderReady: false,
      validation: {
        ...fixture.validation,
        valid: false,
        renderReady: false,
        issues: [{ code: 'SCENE_ASSET_UNRESOLVED', sceneId: fixture.project.scenes[0].id }],
      },
    });
    saveStudioDraft(silentDraft());

    container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Studio channels={[channel()]} onNavigateDirector={vi.fn()} /></I18nProvider>); });

    const publish = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Export & publish safely'));
    await act(async () => { publish?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    expect(container.textContent).toContain('Export requires supported canonical media for scene 1.');
    expect(mocks.planActiveExport).not.toHaveBeenCalled();
    await act(async () => { root.unmount(); });
  });

  it('routes render through the canonical silent export path', async () => {
    const insert = vi.fn(); const select = vi.fn(); const single = vi.fn();
    insert.mockReturnValue({ select }); select.mockReturnValue({ single }); single.mockResolvedValue({ data: { id: 'saved-silent-video' } });
    mocks.from.mockReturnValue({
      select: vi.fn(() => Object.assign(Promise.resolve({ data: [] }), {
        eq: vi.fn(async () => ({ data: [] })),
      })),
      insert,
    } as never);
    mocks.renderVideo.mockResolvedValue({ videoBlob: new Blob(['video']), duration: 3 });
    mocks.uploadMedia.mockResolvedValue({
      videoUrl: 'https://example.test/signed-silent.webm',
      media: { bucket: 'media', objectPath: 'studio-test-user/videos/silent.webm' },
    });
    saveStudioDraft({ ...silentDraft(), step: 'render' });
    container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Studio channels={[channel()]} onNavigateDirector={vi.fn()} /></I18nProvider>); });
    const render = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Render Video'));
    await act(async () => { render?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(mocks.buildProject).toHaveBeenCalledWith(expect.objectContaining({
      audio: { narrationMode: 'silent' },
      narration: undefined,
    }));
    expect(insert).not.toHaveBeenCalled();
    await act(async () => { root.unmount(); });
  });
});

function channel(): CanonicalChannelIdentity {
  return {
    id: 'youtube:UC-SILENT', source: 'native-youtube', legacyChannelId: null,
    publishingAccountId: 'youtube:silent-account', platform: 'youtube', channelRef: 'UC-SILENT',
    name: 'Silent channel', handle: null, niche: null, avatar_color: '#ff0033', status: 'active',
    subscriber_count: 0, video_count: 0,
  };
}

function silentDraft(): StudioDraft {
  return {
    version: 1, projectId: 'silent-project', savedAt: '2026-08-12T00:00:00.000Z', step: 'publish',
    channelId: 'youtube:UC-SILENT', topic: 'Silent topic', niche: '', tone: 'engaging', duration: 30,
    title: 'Silent video', hook: '', script: 'Silent script', cta: '',
    scenes: [{ text: 'Silent scene', duration: 3, visual: 'Silent visual', imageUrl: 'https://example.test/silent.jpg' }],
    captionStyle: 'karaoke', transitionStyle: 'crossfade', motionStyle: 'kenburns', useBroll: false,
    musicId: '', musicVolume: 0.25, visualMode: 'auto', selectedStyleId: '', characterName: '',
    characterAppearance: '', characterArtStyle: 'realistic', characterProfileId: '', watermarkText: '',
    watermarkPosition: 'bottom-right', showSubtitles: true, captionTextColor: '', captionHighlightColor: '',
    beatSync: false, voiceoverMode: 'none', selectedVoice: '', targetLanguage: 'tr',
  };
}
