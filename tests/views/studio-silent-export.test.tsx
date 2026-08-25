import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthSessionStore } from '@/auth/session';
import { setValidatedOwnerId } from '@/auth/identity';
import { I18nProvider } from '@/lib/i18n';
import { loadStudioDraft, saveStudioDraft, type StudioDraft } from '@/lib/studioDraft';
import type { CanonicalChannelIdentity } from '@/services/canonicalChannelCatalog';
import { useMediaStore, useProjectStore, usePublishingStore, useUIStore } from '@/store';
import { Studio } from '@/views/Studio';
import { editingFixture } from '../editing/fixtures';
import type { ExportJob } from '@/core/export-intelligence';

const mocks = vi.hoisted(() => ({
  buildProject: vi.fn(),
  loadExportCapabilities: vi.fn(),
  planActiveExport: vi.fn(),
  enqueueActiveExport: vi.fn(),
  waitForActiveExport: vi.fn(),
  renderVideo: vi.fn(),
  uploadMedia: vi.fn(),
  translateSubtitles: vi.fn(),
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
  searchVideos: vi.fn(async () => []), ingestPexelsImage: vi.fn(), ingestPexelsVideo: vi.fn(), discardPexelsVideoQuarantine: vi.fn(), generateAIImage: vi.fn(), researchFootage: vi.fn(),
  translateSubtitles: mocks.translateSubtitles,
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
    mocks.enqueueActiveExport.mockResolvedValue(verifiedExportJob());
    mocks.waitForActiveExport.mockResolvedValue(verifiedExportJob());
    window.electronAPI = {
      ...window.electronAPI,
      ffmpeg: { ...window.electronAPI?.ffmpeg, pickOutputPath: vi.fn().mockResolvedValue('C:/exports/silent.mp4') },
    } as typeof window.electronAPI;
    saveStudioDraft({ ...silentDraft(), step: 'render' });

    container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Studio channels={[channel()]} onNavigateDirector={vi.fn()} /></I18nProvider>); });

    const render = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Render Video'));
    expect(render).toBeDefined();
    await act(async () => { render?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    expect(mocks.buildProject).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'silent-project',
      audio: { narrationMode: 'silent' },
      productionRecipe: expect.objectContaining({
        recipe: expect.objectContaining({ version: 1 }),
        identity: expect.stringMatching(/^studio-recipe-v1-/),
      }),
    }));
    expect(mocks.planActiveExport).toHaveBeenCalledWith('youtube-shorts');
    expect(mocks.enqueueActiveExport).toHaveBeenCalledWith(expect.anything(), 'C:/exports/silent.mp4');
    expect(mocks.waitForActiveExport).toHaveBeenCalledWith('verified-export');
    await act(async () => { root.unmount(); });
  });

  it.each([
    ['en', 'Beat Sync', 'Coming later', 'Beat synchronization is not available in verified exports yet.'],
    ['tr', 'Ritim Senkronu', 'Yakında', 'Ritim senkronizasyonu henüz doğrulanmış final dışa aktarımlarda kullanılamıyor.'],
  ])('shows Beat Sync as unavailable for verified export in %s', async (language, title, status, detail) => {
    window.localStorage.setItem('sf-lang', language);
    saveStudioDraft({
      ...silentDraft(),
      step: 'style',
      musicId: 'ambient',
      musicStorage: { bucket: 'media', objectPath: 'studio-test-user/music/00000000-0000-4000-8000-000000000000.mp3' },
    });
    container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Studio channels={[channel()]} onNavigateDirector={vi.fn()} /></I18nProvider>); });

    const unavailable = Array.from(container.querySelectorAll('button'))
      .find((button) => button.getAttribute('aria-label') === detail);
    expect(unavailable).toBeDefined();
    expect(unavailable?.disabled).toBe(true);
    expect(container.textContent).toContain(title);
    expect(container.textContent).toContain(status);
    expect(container.textContent).toContain(detail);
    await act(async () => { root.unmount(); });
  });

  it.each([
    ['en', 'Coming later', 'A saved transition is unavailable in V1.1. Verified export uses None.'],
    ['tr', 'Yakında', 'Kaydedilmiş geçiş V1.1’de kullanılamaz. Doğrulanmış dışa aktarma None kullanır.'],
  ])('keeps only None and Crossfade selectable while truthfully disabling legacy transitions in %s', async (language, comingLater, legacyDetail) => {
    window.localStorage.setItem('sf-lang', language);
    saveStudioDraft({ ...silentDraft(), step: 'style', transitionStyle: 'slide' });
    container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Studio channels={[channel()]} onNavigateDirector={vi.fn()} /></I18nProvider>); });

    const buttons = Array.from(container.querySelectorAll('button'));
    const byText = (text: string) => buttons.find((button) => button.textContent?.startsWith(text));
    expect(byText('None')?.disabled).toBe(false);
    expect(byText('Crossfade')?.disabled).toBe(false);
    await act(async () => { byText('Crossfade')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).not.toContain(legacyDetail);
    for (const label of ['Slide', 'Zoom Punch', 'Fade to Black', 'Glitch', 'Shake', 'Whip Pan']) {
      const choice = byText(label);
      expect(choice?.disabled).toBe(true);
      expect(choice?.textContent).toContain(comingLater);
      await act(async () => { choice?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    }
    expect(container.textContent).not.toContain(legacyDetail);
    expect(byText('Crossfade')?.className).toContain('border-slate-900');
    await act(async () => { root.unmount(); });
  });

  it.each([
    ['en', 'Highlight Box', 'Deterministic colored emphasis', 'Active word'],
    ['tr', 'Vurgu Kutusu', 'Belirli kelimeleri renkli vurgu ile öne çıkarır', 'Aktif kelime'],
  ])('keeps Highlight selectable with truthful static emphasis copy in %s', async (language, title, description, misleadingClaim) => {
    window.localStorage.setItem('sf-lang', language);
    saveStudioDraft({ ...silentDraft(), step: 'style', captionStyle: 'classic' });
    container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Studio channels={[channel()]} onNavigateDirector={vi.fn()} /></I18nProvider>); });

    const highlight = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.startsWith(title));
    expect(highlight?.disabled).toBe(false);
    expect(highlight?.textContent).toContain(description);
    expect(container.textContent).not.toContain(misleadingClaim);
    await act(async () => { highlight?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(highlight?.className).toContain('border-slate-900');
    await act(async () => { root.unmount(); });
  });

  it('sends the canonical subtitle cue timeline to translated SRT instead of estimating scene durations', async () => {
    mocks.buildProject.mockResolvedValue({
      subtitleTimeline: canonicalSrtTimeline(),
    });
    mocks.translateSubtitles.mockResolvedValue({ status: 'translated', translatedSrt: '1\n00:00:02,043 --> 00:00:02,345\nTranslated', language: 'English' });
    const createObjectURL = vi.fn(() => 'blob:translated-srt');
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = vi.fn();
    saveStudioDraft({ ...silentDraft(), step: 'style', targetLanguage: 'en' });
    container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Studio channels={[channel()]} onNavigateDirector={vi.fn()} /></I18nProvider>); });

    const translate = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Translate & Download'));
    await act(async () => { translate?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    expect(mocks.buildProject).toHaveBeenCalledWith(expect.objectContaining({
      subtitles: expect.objectContaining({ enabled: true }),
    }));
    expect(mocks.translateSubtitles).toHaveBeenCalledWith({
      srt: '1\n00:00:02,043 --> 00:00:02,345\nCanonical cue\n',
      targetLanguage: 'en',
    });
    await act(async () => { root.unmount(); });
  });

  it('does not download an unavailable translation and explains that the SRT is download-only', async () => {
    mocks.buildProject.mockResolvedValue({ subtitleTimeline: canonicalSrtTimeline() });
    mocks.translateSubtitles.mockResolvedValue({ status: 'unavailable', reason: 'unchanged-result' });
    const createObjectURL = vi.fn(() => 'blob:should-not-exist');
    URL.createObjectURL = createObjectURL;
    saveStudioDraft({ ...silentDraft(), step: 'style', targetLanguage: 'en' });
    container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Studio channels={[channel()]} onNavigateDirector={vi.fn()} /></I18nProvider>); });

    const translate = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Translate & Download'));
    await act(async () => { translate?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    expect(createObjectURL).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Translation produced no changes. Choose another language or try again.');
    expect(container.textContent).toContain('This does not change subtitles in the verified video.');
    await act(async () => { root.unmount(); });
  });

  it('blocks an ambiguous Browser TTS final export before the canonical engine', async () => {
    saveStudioDraft({ ...silentDraft(), step: 'render', voiceoverMode: 'browser' });
    container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Studio channels={[channel()]} onNavigateDirector={vi.fn()} /></I18nProvider>); });

    const render = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Render Video'));
    await act(async () => { render?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    expect(container.textContent).toContain('Browser TTS is for local preview only. Use ElevenLabs narration or choose Export without narration before rendering.');
    expect(container.textContent).toContain('Export without narration');
    expect(mocks.buildProject).not.toHaveBeenCalled();
    expect(mocks.planActiveExport).not.toHaveBeenCalled();
    await act(async () => { root.unmount(); });
  });

  it('labels Browser TTS as preview-only without the misleading unlimited export claim', async () => {
    saveStudioDraft({ ...silentDraft(), step: 'voice', voiceoverMode: 'browser' });
    container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Studio channels={[channel()]} onNavigateDirector={vi.fn()} /></I18nProvider>); });

    expect(container.textContent).toContain('Browser Text-to-Speech (Local preview)');
    expect(container.textContent).toContain('Speaks locally for preview. It is not included in verified or final exports.');
    expect(container.textContent).toContain('For final export, use ElevenLabs narration or explicitly export without narration.');
    expect(container.textContent).not.toContain('Free, Unlimited');
    await act(async () => { root.unmount(); });
  });

  it('permits an explicitly acknowledged Browser TTS no-narration export without persisting browser audio', async () => {
    const fixture = await editingFixture();
    const validBuild = {
      ...fixture,
      renderReady: true,
      validation: { ...fixture.validation, valid: true, renderReady: true, errorCount: 0 },
    };
    mocks.buildProject.mockResolvedValue(validBuild);
    mocks.loadExportCapabilities.mockResolvedValue(undefined);
    mocks.planActiveExport.mockResolvedValue({ id: 'plan', blockingIssues: [] });
    mocks.enqueueActiveExport.mockResolvedValue(verifiedExportJob());
    mocks.waitForActiveExport.mockResolvedValue(verifiedExportJob());
    window.electronAPI = {
      ...window.electronAPI,
      ffmpeg: { ...window.electronAPI?.ffmpeg, pickOutputPath: vi.fn().mockResolvedValue('C:/exports/browser-preview-only.mp4') },
    } as typeof window.electronAPI;
    saveStudioDraft({ ...silentDraft(), step: 'render', voiceoverMode: 'browser', browserTtsFinalIntent: 'without-narration' });

    container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Studio channels={[channel()]} onNavigateDirector={vi.fn()} /></I18nProvider>); });

    const render = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Render Video'));
    await act(async () => { render?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    expect(mocks.buildProject).toHaveBeenCalledWith(expect.objectContaining({
      audio: { narrationMode: 'silent' },
      narration: undefined,
    }));
    const persisted = loadStudioDraft();
    expect(persisted).toMatchObject({ voiceoverMode: 'browser', browserTtsFinalIntent: 'without-narration' });
    expect(JSON.stringify(persisted)).not.toContain('audioUrl');
    expect(JSON.stringify(persisted)).not.toContain('audioBlob');
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
    saveStudioDraft({ ...silentDraft(), step: 'render' });

    container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Studio channels={[channel()]} onNavigateDirector={vi.fn()} /></I18nProvider>); });

    const render = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Render Video'));
    await act(async () => { render?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

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

  it('shows Video Ready after verified render and reuses the same artifact for explicit actions', async () => {
    const fixture = await editingFixture();
    const validBuild = { ...fixture, renderReady: true, validation: { ...fixture.validation, valid: true, renderReady: true, errorCount: 0 } };
    const exportJob = verifiedExportJob();
    mocks.buildProject.mockResolvedValue(validBuild);
    mocks.loadExportCapabilities.mockResolvedValue(undefined);
    mocks.planActiveExport.mockResolvedValue({ id: 'plan', blockingIssues: [] });
    mocks.enqueueActiveExport.mockResolvedValue(exportJob);
    mocks.waitForActiveExport.mockResolvedValue(exportJob);
    const pickOutputPath = vi.fn().mockResolvedValueOnce('C:/exports/silent.mp4').mockResolvedValueOnce('C:/exports/silent-copy.mp4');
    const saveVerifiedExportAs = vi.fn(async (_artifact: { artifactPath: string; sizeBytes: number; contentDigest: string }, destination: string) => ({ ok: true, path: destination, sizeBytes: 1_024 }));
    const revalidateArtifact = vi.fn(async (artifact: { artifactPath: string; sizeBytes: number; contentDigest: string }) => ({ ok: true as const, artifact }));
    const openVerifiedExport = vi.fn(async () => ({ ok: true }));
    const revealVerifiedExport = vi.fn(async () => ({ ok: true }));
    window.electronAPI = { ...window.electronAPI, ffmpeg: { ...window.electronAPI?.ffmpeg, pickOutputPath, revalidateArtifact, openVerifiedExport, revealVerifiedExport, saveVerifiedExportAs } } as typeof window.electronAPI;
    saveStudioDraft({ ...silentDraft(), step: 'render' });
    container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Studio channels={[channel()]} onNavigateDirector={vi.fn()} /></I18nProvider>); });

    const render = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Render Video'));
    await act(async () => { render?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    expect(container.textContent).toContain('Video Ready');
    expect(useUIStore.getState().currentView).toBe('dashboard');
    expect(mocks.enqueueActiveExport).toHaveBeenCalledTimes(1);

    const click = async (label: string) => {
      const button = Array.from(container!.querySelectorAll('button')).find((candidate) => candidate.textContent?.includes(label));
      await act(async () => { button?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    };
    await click('Open Video'); await click('Show in Folder'); await click('Save As');
    expect(openVerifiedExport).toHaveBeenCalledWith(expect.objectContaining({ artifactPath: 'C:/exports/silent.mp4' }));
    expect(revealVerifiedExport).toHaveBeenCalledWith(expect.objectContaining({ contentDigest: 'a'.repeat(64) }));
    expect(saveVerifiedExportAs).toHaveBeenCalledWith(expect.objectContaining({ contentDigest: 'a'.repeat(64) }), 'C:/exports/silent-copy.mp4');
    expect(mocks.enqueueActiveExport).toHaveBeenCalledTimes(1);

    await click('Publish to YouTube');
    expect(usePublishingStore.getState().handoff).toMatchObject({ kind: 'verified-export', exportJobId: exportJob.id });
    expect(useUIStore.getState().currentView).toBe('publishing-studio');
    expect(mocks.enqueueActiveExport).toHaveBeenCalledTimes(1);
    await act(async () => { root.unmount(); });
  });

  it('drops a late post-render action when the authenticated owner changes', async () => {
    const fixture = await editingFixture();
    const validBuild = { ...fixture, renderReady: true, validation: { ...fixture.validation, valid: true, renderReady: true, errorCount: 0 } };
    const exportJob = verifiedExportJob();
    let resolveRevalidation: ((value: { ok: true; artifact: { artifactPath: string; sizeBytes: number; contentDigest: string } }) => void) | undefined;
    mocks.buildProject.mockResolvedValue(validBuild);
    mocks.loadExportCapabilities.mockResolvedValue(undefined);
    mocks.planActiveExport.mockResolvedValue({ id: 'plan', blockingIssues: [] });
    mocks.enqueueActiveExport.mockResolvedValue(exportJob);
    mocks.waitForActiveExport.mockResolvedValue(exportJob);
    window.electronAPI = { ...window.electronAPI, ffmpeg: {
      ...window.electronAPI?.ffmpeg,
      pickOutputPath: vi.fn().mockResolvedValue('C:/exports/silent.mp4'),
      revalidateArtifact: vi.fn(() => new Promise((resolve) => { resolveRevalidation = resolve as typeof resolveRevalidation; })),
      openVerifiedExport: vi.fn(async () => ({ ok: true })),
    } } as typeof window.electronAPI;
    saveStudioDraft({ ...silentDraft(), step: 'render' });
    container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Studio channels={[channel()]} onNavigateDirector={vi.fn()} /></I18nProvider>); });
    const render = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Render Video'));
    await act(async () => { render?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const open = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Open Video'));
    await act(async () => { open?.dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); });
    expect(resolveRevalidation).toBeDefined();
    setValidatedOwnerId('studio-user-b');
    await act(async () => {
      useAuthSessionStore.setState({ status: 'authenticated', user: { id: 'studio-user-b' } as never, session: { access_token: 'token-b' } as never, error: null });
      await Promise.resolve();
    });
    await act(async () => { resolveRevalidation?.({ ok: true, artifact: { artifactPath: 'C:/exports/silent.mp4', sizeBytes: 1_024, contentDigest: 'a'.repeat(64) } }); });
    expect(container.textContent).not.toContain('Video Ready');
    expect(container.textContent).not.toContain('Saved video could not be opened.');
    await act(async () => { root.unmount(); });
  });

  it('does not attach an A-owned render completion after an owner transition', async () => {
    const fixture = await editingFixture();
    const validBuild = { ...fixture, renderReady: true, validation: { ...fixture.validation, valid: true, renderReady: true, errorCount: 0 } };
    const exportJob = verifiedExportJob();
    let resolveCompletion: ((value: ExportJob) => void) | undefined;
    mocks.buildProject.mockResolvedValue(validBuild);
    mocks.loadExportCapabilities.mockResolvedValue(undefined);
    mocks.planActiveExport.mockResolvedValue({ id: 'plan', blockingIssues: [] });
    mocks.enqueueActiveExport.mockResolvedValue(exportJob);
    mocks.waitForActiveExport.mockImplementation(() => new Promise((resolve) => { resolveCompletion = resolve; }));
    window.electronAPI = { ...window.electronAPI, ffmpeg: { ...window.electronAPI?.ffmpeg, pickOutputPath: vi.fn().mockResolvedValue('C:/exports/a.mp4') } } as typeof window.electronAPI;
    saveStudioDraft({ ...silentDraft(), step: 'render' });
    container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Studio channels={[channel()]} onNavigateDirector={vi.fn()} /></I18nProvider>); });
    const render = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Render Video'));
    await act(async () => { render?.dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); });
    expect(resolveCompletion).toBeDefined();

    setValidatedOwnerId('studio-user-b');
    await act(async () => {
      useAuthSessionStore.setState({ status: 'authenticated', user: { id: 'studio-user-b' } as never, session: { access_token: 'token-b' } as never, error: null });
      await Promise.resolve();
    });
    await act(async () => { resolveCompletion?.(exportJob); await Promise.resolve(); });

    expect(container.textContent).not.toContain('Video Ready');
    await act(async () => { root.unmount(); });
  });
});

function verifiedExportJob(): ExportJob {
  return {
    id: 'verified-export', projectId: 'silent-project', platformId: 'youtube-shorts', sourceManifestFingerprint: 'manifest-revision', sourceManifestFingerprintVersion: 1,
    outputPath: 'C:/exports/silent.mp4', state: 'completed', stage: 'completed', attempts: 1, maxAttempts: 3,
    plan: {}, manifest: {}, progress: {}, failure: null, queuedAt: 'now', startedAt: 'now', completedAt: 'now',
    artifact: { path: 'C:/exports/silent.mp4', sizeBytes: 1_024, durationMs: 3_000, verified: true, contentDigest: 'a'.repeat(64), diagnostics: {}, createdAt: 'now' },
  } as unknown as ExportJob;
}

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

function canonicalSrtTimeline() {
  return {
    enabled: true,
    source: 'word-timestamps' as const,
    language: 'tr',
    durationMs: 7_497,
    words: [],
    cues: [{ id: 'cue', sceneId: 'scene', text: 'Canonical cue', startMs: 2_043, endMs: 2_345, durationMs: 302, wordIds: [], lineCount: 1, emphasisWordIds: [] }],
    style: {},
    metrics: {},
  };
}
