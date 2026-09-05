import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthSessionStore } from '@/auth/session';
import { advanceValidatedOwnerGeneration, setValidatedOwnerId } from '@/auth/identity';
import { I18nProvider } from '@/lib/i18n';
import { loadStudioDraft, saveStudioDraft, type StudioDraft } from '@/lib/studioDraft';
import { isCanonicalSceneId } from '@/lib/sceneIdentity';
import { visualBriefFingerprint, type SceneVisualBinding } from '@/core/visual-intelligence';
import type { CanonicalChannelIdentity } from '@/services/canonicalChannelCatalog';
import { reconcileCharacterProfileSelection } from '@/services/characterProfileSelection';
import { useProjectStore } from '@/store';
import { Studio } from '@/views/Studio';

const mocks = vi.hoisted(() => ({
  getProviderStatus: vi.fn(), searchImages: vi.fn(), searchVideos: vi.fn(),
  ingestPexelsImage: vi.fn(), ingestPexelsVideo: vi.fn(), discardPexelsVideoQuarantine: vi.fn(),
  researchFootage: vi.fn(), uploadMedia: vi.fn(),
  resolveOwnedImageDisplayGeometry: vi.fn(),
  planVisualQueries: vi.fn(), issueOpaqueSpatialMediaAnalysisReference: vi.fn(),
  analyzeVisualSpatial: vi.fn(), analyzeDiscoveryCandidateSpatial: vi.fn(),
  aiService: {
    generateScript: vi.fn(), generateHooks: vi.fn(), generateSEO: vi.fn(), analyzeScript: vi.fn(),
  },
  translateSubtitles: vi.fn(),
  createSignedUrl: vi.fn(),
  from: vi.fn(() => ({
    select: vi.fn(() => Object.assign(Promise.resolve({ data: [] }), {
      eq: vi.fn(async () => ({ data: [] })),
    })),
  })),
}));

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: false,
  supabase: {
    from: mocks.from,
    storage: { from: vi.fn(() => ({ createSignedUrl: mocks.createSignedUrl })) },
  },
}));
vi.mock('@/lib/api', () => ({
  getProviderStatus: mocks.getProviderStatus, generateVoiceover: vi.fn(), listVoices: vi.fn(async () => []), uploadMedia: mocks.uploadMedia,
  searchImages: mocks.searchImages, searchVideos: mocks.searchVideos, ingestPexelsImage: mocks.ingestPexelsImage,
  ingestPexelsVideo: mocks.ingestPexelsVideo, discardPexelsVideoQuarantine: mocks.discardPexelsVideoQuarantine,
  generateAIImage: vi.fn(), researchFootage: mocks.researchFootage,
  translateSubtitles: mocks.translateSubtitles,
  planVisualQueries: mocks.planVisualQueries,
  issueOpaqueSpatialMediaAnalysisReference: mocks.issueOpaqueSpatialMediaAnalysisReference,
  analyzeVisualSpatial: mocks.analyzeVisualSpatial,
  analyzeDiscoveryCandidateSpatial: mocks.analyzeDiscoveryCandidateSpatial,
  resolveOwnedImageDisplayGeometry: mocks.resolveOwnedImageDisplayGeometry,
}));
vi.mock('@/core/di', () => ({ applicationContainer: { resolve: () => mocks.aiService }, dependencyTokens: { aiApplicationService: Symbol('ai'), mediaEngine: Symbol('media') } }));
vi.mock('@/lib/videoRenderer', () => ({ renderVideo: vi.fn() }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('Studio provider availability', () => {
  let container: HTMLDivElement | null = null;

  beforeEach(() => {
    setValidatedOwnerId('studio-test-user');
    mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed.example/restored.png' }, error: null });
    mocks.resolveOwnedImageDisplayGeometry.mockImplementation(async (media: { objectPath: string }) => displayGeometry(media.objectPath));
    useAuthSessionStore.setState({ status: 'authenticated', user: { id: 'studio-test-user' } as never, session: { access_token: 'token' } as never, error: null });
    useProjectStore.setState({ currentProject: null, drafts: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it('rejects candidate spatial evidence that resolves after Search Again', async () => {
    const pending = deferred<ReturnType<typeof spatialEvidence>>();
    configureSpatialDiscovery();
    mocks.analyzeDiscoveryCandidateSpatial.mockReturnValueOnce(pending.promise);
    saveStudioDraft(draft('script'));
    const root = await renderStudio();
    await discoverCandidates();

    await clickButton('Analyze framing');
    expect(mocks.analyzeDiscoveryCandidateSpatial).toHaveBeenCalledWith(expect.objectContaining({ candidate: expect.objectContaining({ providerAssetId: 42 }) }));
    await clickButton('Search Again');
    await flush();
    await act(async () => { pending.resolve(spatialEvidence(0.2, 0.3)); });

    expect(container?.textContent).not.toContain('Spatial evidence: focal (0.20, 0.30)');
    await act(async () => { root.unmount(); });
  });

  it('keeps candidate B evidence current when superseded candidate A resolves later', async () => {
    const pendingA = deferred<ReturnType<typeof spatialEvidence>>();
    const pendingB = deferred<ReturnType<typeof spatialEvidence>>();
    configureSpatialDiscovery();
    mocks.analyzeDiscoveryCandidateSpatial.mockReturnValueOnce(pendingA.promise).mockReturnValueOnce(pendingB.promise);
    saveStudioDraft(draft('script'));
    const root = await renderStudio();
    await discoverCandidates();

    await clickButton('Analyze framing');
    const candidateB = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? [])
      .find((button) => button.querySelector('img')?.getAttribute('src')?.includes('/43.jpg'));
    expect(candidateB).toBeDefined();
    await act(async () => { candidateB?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await clickButton('Analyze framing');
    expect(mocks.analyzeDiscoveryCandidateSpatial).toHaveBeenLastCalledWith(expect.objectContaining({ candidate: expect.objectContaining({ providerAssetId: 43 }) }));

    await act(async () => { pendingB.resolve(spatialEvidence(0.8, 0.7)); });
    expect(container?.textContent).toContain('Spatial evidence: focal (0.80, 0.70)');
    await act(async () => { pendingA.resolve(spatialEvidence(0.2, 0.3)); });
    expect(container?.textContent).toContain('Spatial evidence: focal (0.80, 0.70)');
    expect(container?.textContent).not.toContain('Spatial evidence: focal (0.20, 0.30)');
    await act(async () => { root.unmount(); });
  });

  it('clears candidate spatial evidence on Apply and requires fresh owned-media analysis', async () => {
    configureSpatialDiscovery();
    mocks.analyzeDiscoveryCandidateSpatial.mockResolvedValueOnce(spatialEvidence(0.25, 0.35));
    mocks.ingestPexelsImage.mockResolvedValueOnce({
      media: { bucket: 'media', objectPath: APPLIED_MEDIA_B },
      previewUrl: 'https://signed.example/applied-42.jpg',
      imageDisplayGeometry: displayGeometry(APPLIED_MEDIA_B),
      provenance: { provider: 'pexels', providerMediaId: 42, originalSourceUrl: 'https://images.pexels.com/photos/42/original.jpg', query: 'Visual' },
    });
    mocks.issueOpaqueSpatialMediaAnalysisReference.mockResolvedValue({ reference: 'owned-spatial-reference' });
    mocks.analyzeVisualSpatial.mockResolvedValueOnce(spatialEvidence(0.65, 0.55));
    saveStudioDraft(draft('script'));
    const root = await renderStudio();
    await discoverCandidates();

    await clickButton('Analyze framing');
    expect(container?.textContent).toContain('Spatial evidence: focal (0.25, 0.35)');
    expect(container?.textContent).not.toContain('Apply suggestion');
    await clickButton('Use This Visual');
    await flush();
    expect(container?.textContent).not.toContain('Spatial evidence: focal (0.25, 0.35)');
    expect(container?.textContent).not.toContain('Spatial evidence: focal (0.65, 0.55)');
    expect(mocks.issueOpaqueSpatialMediaAnalysisReference).not.toHaveBeenCalled();

    const framingButtons = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? [])
      .filter((button) => button.textContent?.includes('Analyze framing'));
    expect(framingButtons).toHaveLength(2);
    await act(async () => { framingButtons[0].dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush();
    expect(mocks.issueOpaqueSpatialMediaAnalysisReference).toHaveBeenCalledWith({ bucket: 'media', objectPath: APPLIED_MEDIA_B });
    expect(mocks.analyzeVisualSpatial).toHaveBeenCalledTimes(1);
    expect(container?.textContent).toContain('Spatial evidence: focal (0.65, 0.55)');
    expect(container?.textContent).toContain('1200×800 encoded raster');
    await act(async () => { root.unmount(); });
  });

  it('rejects applied spatial evidence after canonical media replacement', async () => {
    const pending = deferred<ReturnType<typeof spatialEvidence>>();
    mocks.getProviderStatus.mockResolvedValue({ openai: { configured: false }, elevenlabs: { configured: false }, pexels: { configured: false } });
    mocks.issueOpaqueSpatialMediaAnalysisReference.mockResolvedValue({ reference: 'owned-spatial-reference' });
    mocks.analyzeVisualSpatial.mockReturnValueOnce(pending.promise);
    mocks.uploadMedia.mockResolvedValueOnce({ imageUrl: 'https://signed.example/replacement.png', media: { bucket: 'media', objectPath: APPLIED_MEDIA_B } });
    saveStudioDraft(draftWithImage(APPLIED_MEDIA_A));
    const root = await renderStudio();
    await flush();

    await clickButton('Analyze framing');
    const input = container?.querySelector<HTMLInputElement>('input[type="file"][accept="image/png,image/jpeg"]');
    Object.defineProperty(input!, 'files', { configurable: true, value: [pngFile()] });
    await act(async () => { input?.dispatchEvent(new Event('change', { bubbles: true })); });
    await flush();
    await act(async () => { pending.resolve(spatialEvidence(0.2, 0.3)); });

    expect(container?.querySelector('img')?.getAttribute('src')).toContain('replacement.png');
    expect(container?.textContent).not.toContain('Spatial evidence: focal (0.20, 0.30)');
    await act(async () => { root.unmount(); });
  });

  it('rejects stale geometry reauthorization after same-path immutable digest replacement', async () => {
    vi.useFakeTimers();
    const now = Date.parse('2026-09-05T10:00:00.000Z');
    vi.setSystemTime(now);
    const digestA = 'a'.repeat(64);
    const digestB = 'b'.repeat(64);
    const pendingA = deferred<ReturnType<typeof displayGeometry>>();
    mocks.getProviderStatus.mockResolvedValue({ openai: { configured: false }, elevenlabs: { configured: false }, pexels: { configured: false } });
    mocks.resolveOwnedImageDisplayGeometry.mockReturnValueOnce(pendingA.promise);
    mocks.uploadMedia
      .mockResolvedValueOnce({
        imageUrl: 'https://signed.example/same-path-old-bytes.png',
        media: { bucket: 'media', objectPath: APPLIED_MEDIA_A },
        imageDisplayGeometry: displayGeometry(APPLIED_MEDIA_A, 'identity', digestA, new Date(now + 1_000).toISOString(), 'A'),
      })
      .mockResolvedValueOnce({
        imageUrl: 'https://signed.example/same-path-new-bytes.png',
        media: { bucket: 'media', objectPath: APPLIED_MEDIA_A },
        imageDisplayGeometry: displayGeometry(APPLIED_MEDIA_A, 'identity', digestB, new Date(now + 60_000).toISOString(), 'B'),
      });
    mocks.issueOpaqueSpatialMediaAnalysisReference.mockResolvedValue({ reference: 'owned-spatial-reference' });
    mocks.analyzeVisualSpatial.mockResolvedValueOnce(spatialEvidence(0.7, 0.6));
    saveStudioDraft(draft('script'));
    const root = await renderStudio();
    const input = container?.querySelector<HTMLInputElement>('input[type="file"][accept="image/png,image/jpeg"]');
    Object.defineProperty(input!, 'files', { configurable: true, value: [pngFile()] });
    await act(async () => { input?.dispatchEvent(new Event('change', { bubbles: true })); });
    await flush();
    expect(mocks.resolveOwnedImageDisplayGeometry).not.toHaveBeenCalled();

    await act(async () => { vi.advanceTimersByTime(1_000); await Promise.resolve(); });
    expect(mocks.resolveOwnedImageDisplayGeometry).toHaveBeenCalledTimes(1);

    Object.defineProperty(input!, 'files', { configurable: true, value: [pngFile()] });
    await act(async () => { input?.dispatchEvent(new Event('change', { bubbles: true })); });
    await flush();
    await act(async () => {
      pendingA.resolve(displayGeometry(APPLIED_MEDIA_A, 'identity', digestA, new Date(now + 60_000).toISOString(), 'C'));
      await Promise.resolve();
      await Promise.resolve();
    });

    await clickButton('Analyze framing');
    await flush();
    await clickButton('Apply suggestion');
    await flush();
    await act(async () => { vi.advanceTimersByTime(700); await Promise.resolve(); });
    expect(loadStudioDraft()?.scenes[0].imageStorage?.objectPath).toBe(APPLIED_MEDIA_A);
    expect(loadStudioDraft()?.scenes[0].imageFramingBinding?.contentDigest).toBe(digestB);
    await act(async () => { root.unmount(); });
  });

  it('rejects applied spatial evidence after a project transition', async () => {
    const pending = deferred<ReturnType<typeof spatialEvidence>>();
    mocks.getProviderStatus.mockResolvedValue({ openai: { configured: false }, elevenlabs: { configured: false }, pexels: { configured: false } });
    mocks.issueOpaqueSpatialMediaAnalysisReference.mockResolvedValue({ reference: 'owned-spatial-reference' });
    mocks.analyzeVisualSpatial.mockReturnValueOnce(pending.promise);
    saveStudioDraft(draftWithImage(APPLIED_MEDIA_A));
    const root = await renderStudio();
    await flush();

    await clickButton('Analyze framing');
    await act(async () => {
      useProjectStore.setState({ currentProject: { id: 'project-b', name: 'Project B', updatedAt: '2026-09-03T00:00:00.000Z' }, drafts: [] });
    });
    await flush();
    await act(async () => { pending.resolve(spatialEvidence(0.2, 0.3)); });

    expect(container?.textContent).not.toContain('Spatial evidence: focal (0.20, 0.30)');
    await act(async () => { root.unmount(); });
  });

  it('hydrates source-derived display geometry without persisting the execution capability', async () => {
    mocks.getProviderStatus.mockResolvedValue({ openai: { configured: false }, elevenlabs: { configured: false }, pexels: { configured: false } });
    mocks.resolveOwnedImageDisplayGeometry.mockResolvedValue(displayGeometry(GEOMETRY_MEDIA_A, 'rotate-90-cw'));
    saveStudioDraft(draftWithImage(GEOMETRY_MEDIA_A));
    const root = await renderStudio();
    await flush();
    await new Promise((resolve) => window.setTimeout(resolve, 700));

    expect(mocks.resolveOwnedImageDisplayGeometry).toHaveBeenCalledWith({ bucket: 'media', objectPath: GEOMETRY_MEDIA_A });
    expect(loadStudioDraft()?.scenes[0].imageDisplayGeometry).toBeUndefined();
    await act(async () => { root.unmount(); });
  });

  it('replaces forged persisted orientation with geometry re-derived from owned bytes', async () => {
    mocks.getProviderStatus.mockResolvedValue({ openai: { configured: false }, elevenlabs: { configured: false }, pexels: { configured: false } });
    mocks.resolveOwnedImageDisplayGeometry.mockResolvedValue(displayGeometry(GEOMETRY_MEDIA_A, 'identity'));
    const persisted = draftWithImage(GEOMETRY_MEDIA_A);
    persisted.scenes[0].imageDisplayGeometry = displayGeometry(GEOMETRY_MEDIA_A, 'rotate-180');
    saveStudioDraft(persisted);
    const root = await renderStudio();
    await flush();
    await new Promise((resolve) => window.setTimeout(resolve, 700));

    expect(mocks.resolveOwnedImageDisplayGeometry).toHaveBeenCalledWith({ bucket: 'media', objectPath: GEOMETRY_MEDIA_A });
    expect(loadStudioDraft()?.scenes[0].imageDisplayGeometry).toBeUndefined();
    await act(async () => { root.unmount(); });
  });

  it('keeps legacy media viewable but without geometry authority when source resolution fails', async () => {
    mocks.getProviderStatus.mockResolvedValue({ openai: { configured: false }, elevenlabs: { configured: false }, pexels: { configured: false } });
    mocks.resolveOwnedImageDisplayGeometry.mockRejectedValue(new Error('temporarily unavailable'));
    saveStudioDraft(draftWithImage(GEOMETRY_MEDIA_A));
    const root = await renderStudio();
    await flush();

    expect(container?.querySelector('img')?.getAttribute('src')).toContain('restored.png');
    expect(loadStudioDraft()?.scenes[0].imageDisplayGeometry).toBeUndefined();
    await act(async () => { root.unmount(); });
  });

  it('rejects late source geometry after canonical media replacement', async () => {
    const pending = deferred<ReturnType<typeof displayGeometry>>();
    mocks.getProviderStatus.mockResolvedValue({ openai: { configured: false }, elevenlabs: { configured: false }, pexels: { configured: false } });
    mocks.resolveOwnedImageDisplayGeometry.mockReturnValueOnce(pending.promise);
    mocks.uploadMedia.mockResolvedValueOnce({
      imageUrl: 'https://signed.example/replacement.png',
      media: { bucket: 'media', objectPath: GEOMETRY_MEDIA_B },
      imageDisplayGeometry: displayGeometry(GEOMETRY_MEDIA_B, 'rotate-180'),
    });
    saveStudioDraft(draftWithImage(GEOMETRY_MEDIA_A));
    const root = await renderStudio();
    const input = container?.querySelector<HTMLInputElement>('input[type="file"][accept="image/png,image/jpeg"]');
    Object.defineProperty(input!, 'files', { configurable: true, value: [pngFile()] });
    await act(async () => { input?.dispatchEvent(new Event('change', { bubbles: true })); });
    await flush();
    await act(async () => { pending.resolve(displayGeometry(GEOMETRY_MEDIA_A, 'rotate-90-cw')); });
    await new Promise((resolve) => window.setTimeout(resolve, 700));

    expect(loadStudioDraft()?.scenes[0]).toMatchObject({
      imageStorage: { objectPath: GEOMETRY_MEDIA_B },
    });
    expect(loadStudioDraft()?.scenes[0].imageDisplayGeometry).toBeUndefined();
    await act(async () => { root.unmount(); });
  });

  it('rejects late source geometry after a project transition', async () => {
    const pending = deferred<ReturnType<typeof displayGeometry>>();
    mocks.getProviderStatus.mockResolvedValue({ openai: { configured: false }, elevenlabs: { configured: false }, pexels: { configured: false } });
    mocks.resolveOwnedImageDisplayGeometry.mockReturnValueOnce(pending.promise);
    saveStudioDraft(draftWithImage(GEOMETRY_MEDIA_A));
    const root = await renderStudio();
    await act(async () => {
      useProjectStore.setState({ currentProject: { id: 'geometry-project-b', name: 'Geometry B', updatedAt: '2026-09-03T00:00:00.000Z' }, drafts: [] });
    });
    await flush();
    await act(async () => { pending.resolve(displayGeometry(GEOMETRY_MEDIA_A, 'rotate-90-cw')); });
    await new Promise((resolve) => window.setTimeout(resolve, 700));

    expect(loadStudioDraft()?.scenes.some((scene) => scene.imageDisplayGeometry?.mediaIdentity === `media:${GEOMETRY_MEDIA_A}`) ?? false).toBe(false);
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
    expect(container.textContent).toContain('Unable to complete Pexels image ingestion');
    await act(async () => { root.unmount(); });
  });

  it('attaches only server-returned private Pexels image media after ingestion', async () => {
    mocks.getProviderStatus.mockResolvedValue({ openai: { configured: false }, elevenlabs: { configured: false }, pexels: { configured: true } });
    mocks.searchImages.mockResolvedValue([{ id: 42, url: 'https://images.pexels.com/transient.jpg' }]);
    mocks.ingestPexelsImage.mockResolvedValue({
      media: { bucket: 'media', objectPath: 'studio-test-user/generated-images/00000000-0000-4000-8000-000000000042.jpg' },
      previewUrl: 'https://signed.example/private-42.jpg',
      provenance: { provider: 'pexels', providerMediaId: 42, originalSourceUrl: 'https://images.pexels.com/photos/42/original.jpg', query: 'Visual' },
    });
    saveStudioDraft(draft('script'));
    const root = await renderStudio();
    await clickButton('Auto-fetch images');
    expect(mocks.ingestPexelsImage).toHaveBeenCalledWith(42, 'Visual');
    expect(container?.querySelector('img')?.getAttribute('src')).toContain('private-42.jpg');
    expect(container?.querySelector('img')?.getAttribute('src')).not.toContain('transient.jpg');
    await act(async () => { root.unmount(); });
  });

  it('does not attach a direct Pexels URL when durable ingestion fails', async () => {
    mocks.getProviderStatus.mockResolvedValue({ openai: { configured: false }, elevenlabs: { configured: false }, pexels: { configured: true } });
    mocks.searchImages.mockResolvedValue([{ id: 42, url: 'https://images.pexels.com/transient.jpg' }]);
    mocks.ingestPexelsImage.mockRejectedValue(new Error('download failed'));
    saveStudioDraft(draft('script'));
    const root = await renderStudio();
    await clickButton('Auto-fetch images');
    expect(container?.querySelector('img')).toBeNull();
    expect(container?.textContent).toContain('Unable to complete Pexels image ingestion');
    await act(async () => { root.unmount(); });
  });

  it('records a safe client diagnostic and keeps existing media when Research durable ingestion fails', async () => {
    const previousInfo = console.info;
    const diagnostic = vi.fn();
    console.info = diagnostic;
    mocks.getProviderStatus.mockResolvedValue({ openai: { configured: false }, elevenlabs: { configured: false }, pexels: { configured: true } });
    mocks.researchFootage.mockResolvedValue([{ sceneIndex: 0, kind: 'image', mediaId: 42, query: 'Visual' }]);
    mocks.ingestPexelsImage.mockRejectedValue(new Error('provider URL must not leak'));
    saveStudioDraft({ ...draft('style'), visualMode: 'real_footage', scenes: [{ ...draft('style').scenes[0], imageUrl: 'https://images.pexels.com/previous.jpg' }] });
    const root = await renderStudio();
    await clickButton('Research Real Footage');

    expect(diagnostic).toHaveBeenCalledWith('[research-footage]', { code: 'RESEARCH_IMAGE_INGEST_FAILED', sceneIndex: 0 });
    expect(diagnostic.mock.calls.flat().join(' ')).not.toContain('provider URL must not leak');
    await new Promise((resolve) => window.setTimeout(resolve, 700));
    expect(loadStudioDraft()?.scenes[0].imageUrl).toBe('https://images.pexels.com/previous.jpg');
    expect(container?.textContent).toContain('Unable to complete footage research');
    console.info = previousInfo;
    await act(async () => { root.unmount(); });
  });

  it('attaches Research image identities only through durable Pexels ingestion', async () => {
    mocks.getProviderStatus.mockResolvedValue({ openai: { configured: false }, elevenlabs: { configured: false }, pexels: { configured: true } });
    mocks.researchFootage.mockResolvedValue([{ sceneIndex: 0, kind: 'image', mediaId: 42, query: 'Visual', imageUrl: 'https://images.pexels.com/never-authoritative.jpg' }]);
    mocks.ingestPexelsImage.mockResolvedValue({
      media: { bucket: 'media', objectPath: 'studio-test-user/generated-images/00000000-0000-4000-8000-000000000042.jpg' },
      previewUrl: 'https://signed.example/research-private-42.jpg',
      provenance: { provider: 'pexels', providerMediaId: 42, originalSourceUrl: 'https://images.pexels.com/photos/42/original.jpg', query: 'Visual' },
    });
    saveStudioDraft({ ...draft('style'), visualMode: 'real_footage' });
    const root = await renderStudio();
    await clickButton('Research Real Footage');
    await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 0)); });
    expect(mocks.ingestPexelsImage).toHaveBeenCalledWith(42, 'Visual');
    await new Promise((resolve) => window.setTimeout(resolve, 700));
    expect(loadStudioDraft()?.scenes[0]).toMatchObject({ imageStorage: { bucket: 'media', objectPath: 'studio-test-user/generated-images/00000000-0000-4000-8000-000000000042.jpg' } });
    expect(loadStudioDraft()?.scenes[0].imageUrl).toBeUndefined();
    expect(container?.querySelector('img')?.getAttribute('src') ?? '').not.toContain('never-authoritative.jpg');
    await act(async () => { root.unmount(); });
  });

  it('probes quarantined Pexels B-roll and attaches only the resulting private video identity', async () => {
    mocks.getProviderStatus.mockResolvedValue({ openai: { configured: false }, elevenlabs: { configured: false }, pexels: { configured: true } });
    mocks.searchVideos.mockResolvedValue([{ id: 77, fileUrl: 'https://videos.pexels.com/transient.mp4' }]);
    mocks.ingestPexelsVideo.mockResolvedValue({
      quarantineId: '00000000-0000-4000-8000-000000000077', quarantineUrl: 'https://signed.example/quarantine-77.mp4',
      provenance: { provider: 'pexels', providerMediaId: 77, originalSourceUrl: 'https://www.pexels.com/video/77/', providerPageUrl: 'https://www.pexels.com/video/77/', query: 'Visual' },
    });
    mocks.uploadMedia.mockResolvedValue({
      videoUrl: 'https://signed.example/private-77.mp4',
      media: { bucket: 'media', objectPath: 'studio-test-user/videos/00000000-0000-4000-8000-000000000077.mp4' },
    });
    const previousFetch = globalThis.fetch;
    const previousElectron = window.electronAPI;
    const quarantineBytes = new Uint8Array([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
    const probeManualMp4 = vi.fn(async () => ({ container: 'mp4' as const, codec: 'h264' as const, width: 1080, height: 1920, fps: 30, durationMs: 5_000, hasAudio: false }));
    globalThis.fetch = vi.fn(async () => new Response(quarantineBytes, { status: 200 })) as typeof fetch;
    window.electronAPI = { ...previousElectron, ffmpeg: { ...previousElectron?.ffmpeg, probeManualMp4 } } as typeof window.electronAPI;
    saveStudioDraft(draft('script'));
    const root = await renderStudio();

    await clickButton('Auto-fetch B-roll');

    expect(mocks.ingestPexelsVideo).toHaveBeenCalledWith(77, 'Visual');
    expect(mocks.uploadMedia).toHaveBeenCalledWith(expect.any(Blob), 'videos');
    const probeCalls = probeManualMp4.mock.calls as unknown as Array<[ArrayBuffer]>;
    const uploadCalls = mocks.uploadMedia.mock.calls as unknown as Array<[Blob, string]>;
    const probedBytes = probeCalls[0]?.[0];
    const promotedBlob = uploadCalls[0]?.[0];
    expect(new Uint8Array(probedBytes)).toEqual(quarantineBytes);
    expect(promotedBlob.size).toBe(quarantineBytes.byteLength);
    expect(container?.textContent).toContain('B-roll video attached');
    await new Promise((resolve) => window.setTimeout(resolve, 700));
    const persisted = loadStudioDraft();
    expect(persisted?.scenes[0]).toMatchObject({
      videoStorage: { bucket: 'media', objectPath: 'studio-test-user/videos/00000000-0000-4000-8000-000000000077.mp4' },
    });
    expect(persisted?.scenes[0].videoUrl).toBeUndefined();
    expect(mocks.discardPexelsVideoQuarantine).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000077');
    globalThis.fetch = previousFetch;
    window.electronAPI = previousElectron;
    await act(async () => { root.unmount(); });
  });

  it('promotes Research video identities through the shared quarantine probe path', async () => {
    const previousInfo = console.info;
    const diagnostic = vi.fn();
    console.info = diagnostic;
    mocks.getProviderStatus.mockResolvedValue({ openai: { configured: false }, elevenlabs: { configured: false }, pexels: { configured: true } });
    mocks.researchFootage.mockResolvedValue([{ sceneIndex: 0, kind: 'video', mediaId: 77, query: 'Visual' }]);
    mocks.ingestPexelsVideo.mockResolvedValue({ quarantineId: '00000000-0000-4000-8000-000000000077', quarantineUrl: 'https://signed.example/research-quarantine.mp4', provenance: { provider: 'pexels', providerMediaId: 77, originalSourceUrl: 'https://www.pexels.com/video/77/', providerPageUrl: 'https://www.pexels.com/video/77/', query: 'Visual' } });
    mocks.uploadMedia.mockResolvedValue({ videoUrl: 'https://signed.example/research-private-77.mp4', media: { bucket: 'media', objectPath: 'studio-test-user/videos/00000000-0000-4000-8000-000000000077.mp4' } });
    const previousFetch = globalThis.fetch;
    const previousElectron = window.electronAPI;
    const bytes = new Uint8Array([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
    const probeManualMp4 = vi.fn(async () => ({ container: 'mp4' as const, codec: 'h264' as const, width: 1080, height: 1920, fps: 30, durationMs: 5_000, hasAudio: false }));
    globalThis.fetch = vi.fn(async () => new Response(bytes, { status: 200 })) as typeof fetch;
    window.electronAPI = { ...previousElectron, ffmpeg: { ...previousElectron?.ffmpeg, probeManualMp4 } } as typeof window.electronAPI;
    saveStudioDraft({ ...draft('style'), visualMode: 'real_footage' });
    const root = await renderStudio();
    await clickButton('Research Real Footage');
    await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 0)); });
    expect(mocks.ingestPexelsVideo).toHaveBeenCalledWith(77, 'Visual');
    expect(probeManualMp4).toHaveBeenCalledWith(expect.any(ArrayBuffer));
    expect(mocks.uploadMedia).toHaveBeenCalledWith(expect.any(Blob), 'videos');
    expect(mocks.discardPexelsVideoQuarantine).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000077');
    const probedBytes = (probeManualMp4.mock.calls as unknown as Array<[ArrayBuffer]>)[0]?.[0];
    const promotedBlob = (mocks.uploadMedia.mock.calls as unknown as Array<[Blob, string]>)[0]?.[0];
    expect(new Uint8Array(probedBytes)).toEqual(bytes);
    expect(promotedBlob.size).toBe(bytes.byteLength);
    expect(diagnostic).toHaveBeenCalledWith('[pexels-video-prepare]', { code: 'PEXELS_VIDEO_EDGE_INGEST_SUCCEEDED' });
    expect(diagnostic).toHaveBeenCalledWith('[pexels-video-prepare]', { code: 'PEXELS_VIDEO_QUARANTINE_FETCH_SUCCEEDED' });
    expect(diagnostic).toHaveBeenCalledWith('[pexels-video-prepare]', { code: 'PEXELS_VIDEO_PROBE_SUCCEEDED' });
    expect(diagnostic).toHaveBeenCalledWith('[pexels-video-prepare]', { code: 'PEXELS_VIDEO_PREPARE_SUCCEEDED' });
    expect(diagnostic).toHaveBeenCalledWith('[research-footage]', { code: 'RESEARCH_VIDEO_PREPARED', sceneIndex: 0 });
    expect(diagnostic).toHaveBeenCalledWith('[research-footage]', { code: 'RESEARCH_VIDEO_ATTACHED', sceneIndex: 0 });
    expect(container?.textContent).not.toContain('Unable to complete footage research');
    await new Promise((resolve) => window.setTimeout(resolve, 700));
    expect(loadStudioDraft()?.scenes[0].videoStorage).toMatchObject({
      bucket: 'media', objectPath: 'studio-test-user/videos/00000000-0000-4000-8000-000000000077.mp4',
    });
    globalThis.fetch = previousFetch;
    window.electronAPI = previousElectron;
    console.info = previousInfo;
    await act(async () => { root.unmount(); });
  });

  it('does not replace an existing canonical image when durable Pexels B-roll ingestion fails', async () => {
    mocks.getProviderStatus.mockResolvedValue({ openai: { configured: false }, elevenlabs: { configured: false }, pexels: { configured: true } });
    mocks.searchVideos.mockResolvedValue([{ id: 77, fileUrl: 'https://videos.pexels.com/transient.mp4' }]);
    mocks.ingestPexelsVideo.mockRejectedValue(new Error('provider failed'));
    saveStudioDraft({ ...draft('script'), scenes: [{ ...draft('script').scenes[0], imageUrl: 'https://images.pexels.com/old.png' }] });
    const root = await renderStudio();

    await clickButton('Auto-fetch B-roll');

    expect(container?.querySelector('img')?.getAttribute('src')).toContain('old.png');
    expect(container?.querySelector('video')).toBeNull();
    expect(container?.textContent).toContain('Unable to complete Pexels B-roll ingestion');
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

  it('uploads a selected image as a private scene identity without retaining its signed preview URL in the draft', async () => {
    mocks.getProviderStatus.mockResolvedValue({ openai: { configured: false }, elevenlabs: { configured: false }, pexels: { configured: false } });
    mocks.uploadMedia.mockResolvedValue({
      imageUrl: 'https://signed.example/imported.png?token=transient',
      media: { bucket: 'media', objectPath: 'studio-test-user/generated-images/00000000-0000-4000-8000-000000000000.png' },
    });
    saveStudioDraft(draft('script'));
    const root = await renderStudio();
    const input = container?.querySelector<HTMLInputElement>('input[type="file"][accept="image/png,image/jpeg"]');
    expect(input).toBeDefined();
    const selected = pngFile();
    Object.defineProperty(input!, 'files', { configurable: true, value: [selected] });
    await act(async () => { input?.dispatchEvent(new Event('change', { bubbles: true })); });
    await flush();

    expect(mocks.uploadMedia).toHaveBeenCalledWith(selected, 'generated-images');
    expect(container?.querySelector('img')?.getAttribute('src')).toContain('https://signed.example/imported.png');
    await act(async () => { root.unmount(); });
  });

  it('accepts a selected JPEG through the same bounded private scene import path', async () => {
    mocks.getProviderStatus.mockResolvedValue({ openai: { configured: false }, elevenlabs: { configured: false }, pexels: { configured: false } });
    mocks.uploadMedia.mockResolvedValue({
      imageUrl: 'https://signed.example/imported.jpg?token=transient',
      media: { bucket: 'media', objectPath: 'studio-test-user/generated-images/00000000-0000-4000-8000-000000000003.jpg' },
    });
    saveStudioDraft(draft('script'));
    const root = await renderStudio();
    const input = container?.querySelector<HTMLInputElement>('input[type="file"][accept="image/png,image/jpeg"]');
    const selected = jpegFile();
    Object.defineProperty(input!, 'files', { configurable: true, value: [selected] });
    await act(async () => { input?.dispatchEvent(new Event('change', { bubbles: true })); });
    await flush();

    expect(mocks.uploadMedia).toHaveBeenCalledWith(selected, 'generated-images');
    expect(container?.querySelector('img')?.getAttribute('src')).toContain('imported.jpg');
    await act(async () => { root.unmount(); });
  });

  it('shows a localized validation error and never uploads an unsupported scene file', async () => {
    mocks.getProviderStatus.mockResolvedValue({ openai: { configured: false }, elevenlabs: { configured: false }, pexels: { configured: false } });
    saveStudioDraft(draft('script'));
    const root = await renderStudio();
    const input = container?.querySelector<HTMLInputElement>('input[type="file"][accept="image/png,image/jpeg"]');
    Object.defineProperty(input!, 'files', {
      configurable: true,
      value: [{ ...pngFile(), type: 'image/webp' }],
    });
    await act(async () => { input?.dispatchEvent(new Event('change', { bubbles: true })); });
    await flush();

    expect(mocks.uploadMedia).not.toHaveBeenCalled();
    expect(container?.textContent).toContain('Only PNG or JPEG images can be imported.');
    await act(async () => { root.unmount(); });
  });

  it('does not let a stale owner import attach to the next owner scene', async () => {
    const pending = deferred<{ imageUrl: string; media: { bucket: 'media'; objectPath: string } }>();
    mocks.getProviderStatus.mockResolvedValue({ openai: { configured: false }, elevenlabs: { configured: false }, pexels: { configured: false } });
    mocks.uploadMedia.mockReturnValueOnce(pending.promise);
    saveStudioDraft(draft('script'));
    const root = await renderStudio();
    const input = container?.querySelector<HTMLInputElement>('input[type="file"][accept="image/png,image/jpeg"]');
    Object.defineProperty(input!, 'files', { configurable: true, value: [pngFile()] });
    await act(async () => { input?.dispatchEvent(new Event('change', { bubbles: true })); });
    await flush();
    setValidatedOwnerId('studio-user-b');
    advanceValidatedOwnerGeneration();
    await act(async () => { pending.resolve({ imageUrl: 'https://signed.example/a.png', media: { bucket: 'media', objectPath: 'studio-test-user/generated-images/00000000-0000-4000-8000-000000000000.png' } }); });

    expect(container?.querySelector('img')).toBeNull();
    await act(async () => { root.unmount(); });
  });

  it('rejects a late generated scene set after the Studio project is cleared', async () => {
    const pending = deferred<{ title: string; hook: string; script: string; cta: string; scenes: Array<{ text: string; duration: number; visual: string }> }>();
    mocks.getProviderStatus.mockResolvedValue({ openai: { configured: false }, elevenlabs: { configured: false }, pexels: { configured: false } });
    mocks.aiService.generateScript.mockReturnValueOnce(pending.promise);
    saveStudioDraft(draft('topic'));
    const root = await renderStudio();

    await clickButton('Generate Script');
    await clickButton('Sıfırla');
    expect(container?.textContent).not.toContain('Generating Script');
    await act(async () => { pending.resolve({ title: 'Late project title', hook: 'Late hook', script: 'Late script', cta: 'Late CTA', scenes: [{ text: 'Late scene', duration: 5, visual: 'Late visual' }] }); });
    await flush();

    expect(container?.textContent).not.toContain('Late project title');
    expect(loadStudioDraft()?.scenes.some((scene) => scene.text === 'Late scene') ?? false).toBe(false);
    await act(async () => { root.unmount(); });
  });

  it('assigns fresh canonical identities to a generated logical scene set', async () => {
    const suppliedSceneId = draft('topic').scenes[0].sceneId;
    mocks.getProviderStatus.mockResolvedValue({ openai: { configured: false }, elevenlabs: { configured: false }, pexels: { configured: false } });
    mocks.aiService.generateScript.mockResolvedValue({
      title: 'Fresh project title', hook: 'Fresh hook', script: 'Fresh script', cta: 'Fresh CTA',
      scenes: [{ sceneId: suppliedSceneId, text: 'Fresh logical scene', duration: 5, visual: 'Fresh visual', keywords: [] }],
    });
    saveStudioDraft(draft('topic'));
    const root = await renderStudio();

    await clickButton('Generate Script');
    await new Promise((resolve) => window.setTimeout(resolve, 700));
    const generatedId = loadStudioDraft()?.scenes[0]?.sceneId;

    expect(isCanonicalSceneId(generatedId)).toBe(true);
    expect(generatedId).not.toBe(suppliedSceneId);
    await act(async () => { root.unmount(); });
  });

  it('keeps pending scene state with its canonical ID and rejects a replacement at the same index', async () => {
    const pending = deferred<{ imageUrl: string; media: { bucket: 'media'; objectPath: string } }>();
    mocks.getProviderStatus.mockResolvedValue({ openai: { configured: false }, elevenlabs: { configured: false }, pexels: { configured: false } });
    mocks.uploadMedia.mockReturnValueOnce(pending.promise);
    saveStudioDraft(draft('script'));
    const root = await renderStudio();
    await clickButton('Add scene');
    const input = container?.querySelectorAll<HTMLInputElement>('input[type="file"][accept="image/png,image/jpeg"]')[0];
    Object.defineProperty(input!, 'files', { configurable: true, value: [pngFile()] });
    await act(async () => { input?.dispatchEvent(new Event('change', { bubbles: true })); });
    await flush();

    const deleteFirst = container?.querySelectorAll<HTMLButtonElement>('button.text-red-400')[0];
    await act(async () => { deleteFirst?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container?.textContent).not.toContain('Importing…');
    await act(async () => { pending.resolve({ imageUrl: 'https://signed.example/stale.png', media: { bucket: 'media', objectPath: 'studio-test-user/generated-images/00000000-0000-4000-8000-000000000099.png' } }); });

    expect(container?.querySelector('img')).toBeNull();
    expect(loadStudioDraft()?.scenes).toHaveLength(1);
    await act(async () => { root.unmount(); });
  });

  it('merges late restored-media signing by stable scene identity without replacing concurrent scenes', async () => {
    const pending = deferred<{ data: { signedUrl: string }; error: null }>();
    mocks.getProviderStatus.mockResolvedValue({ openai: { configured: false }, elevenlabs: { configured: false }, pexels: { configured: false } });
    mocks.createSignedUrl.mockReturnValueOnce(pending.promise);
    saveStudioDraft({
      ...draft('script'),
      scenes: [{
        ...draft('script').scenes[0],
        imageStorage: { bucket: 'media', objectPath: 'studio-test-user/generated-images/00000000-0000-4000-8000-000000000010.png' },
      }],
    });
    const root = await renderStudio();
    await clickButton('Add scene');
    expect(container?.querySelectorAll('button.text-red-400')).toHaveLength(2);

    await act(async () => { pending.resolve({ data: { signedUrl: 'https://signed.example/late-restored.png' }, error: null }); });
    await flush();

    expect(container?.querySelectorAll('button.text-red-400')).toHaveLength(2);
    expect(container?.querySelector('img')?.getAttribute('src') ?? '').toContain('late-restored.png');
    await act(async () => { root.unmount(); });
  });

  it('does not let a superseded PNG upload overwrite the newer scene selection', async () => {
    const first = deferred<{ imageUrl: string; media: { bucket: 'media'; objectPath: string } }>();
    const second = deferred<{ imageUrl: string; media: { bucket: 'media'; objectPath: string } }>();
    mocks.getProviderStatus.mockResolvedValue({ openai: { configured: false }, elevenlabs: { configured: false }, pexels: { configured: false } });
    mocks.uploadMedia.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    saveStudioDraft(draft('script'));
    const root = await renderStudio();
    const input = container?.querySelector<HTMLInputElement>('input[type="file"][accept="image/png,image/jpeg"]');
    Object.defineProperty(input!, 'files', { configurable: true, value: [pngFile()] });
    await act(async () => { input?.dispatchEvent(new Event('change', { bubbles: true })); });
    await flush();
    Object.defineProperty(input!, 'files', { configurable: true, value: [pngFile()] });
    await act(async () => { input?.dispatchEvent(new Event('change', { bubbles: true })); });
    await flush();
    await act(async () => { second.resolve({ imageUrl: 'https://signed.example/new.png', media: { bucket: 'media', objectPath: 'studio-test-user/generated-images/00000000-0000-4000-8000-000000000002.png' } }); });
    await act(async () => { first.resolve({ imageUrl: 'https://signed.example/old.png', media: { bucket: 'media', objectPath: 'studio-test-user/generated-images/00000000-0000-4000-8000-000000000001.png' } }); });

    expect(container?.querySelector('img')?.getAttribute('src')).toContain('new.png');
    await act(async () => { root.unmount(); });
  });

  it.each([
    ['Auto-fetch images', 'searchImages', [{ id: 1, url: 'https://images.pexels.com/a.png' }]],
    ['Auto-fetch B-roll', 'searchVideos', [{ id: 1, fileUrl: 'https://videos.pexels.com/a.mp4', preview: 'https://images.pexels.com/a.jpg' }]],
  ] as const)('does not apply stale prior-owner %s results', async (label, method, value) => {
    const pending = deferred<typeof value>();
    mocks.getProviderStatus.mockResolvedValue({ openai: { configured: false }, elevenlabs: { configured: false }, pexels: { configured: true } });
    mocks[method].mockReturnValueOnce(pending.promise);
    saveStudioDraft(draft('script'));
    const root = await renderStudio();
    await clickButton(label);
    setValidatedOwnerId('studio-user-b');
    advanceValidatedOwnerGeneration();
    await act(async () => { pending.resolve(value); });

    expect(container?.querySelector('img')).toBeNull();
    expect(container?.textContent).not.toContain('Unable to complete');
    await act(async () => { root.unmount(); });
  });

  it('does not apply stale prior-owner footage research results', async () => {
    const pending = deferred<Array<{ sceneIndex: number; kind: 'image'; mediaId: number; query: string }>>();
    mocks.getProviderStatus.mockResolvedValue({ openai: { configured: false }, elevenlabs: { configured: false }, pexels: { configured: true } });
    mocks.researchFootage.mockReturnValueOnce(pending.promise);
    saveStudioDraft({ ...draft('style'), visualMode: 'real_footage' });
    const root = await renderStudio();
    await clickButton('Research Real Footage');
    setValidatedOwnerId('studio-user-b');
    advanceValidatedOwnerGeneration();
    await act(async () => { pending.resolve([{ sceneIndex: 0, kind: 'image', mediaId: 1, query: 'Visual' }]); });

    expect(container?.querySelector('img')).toBeNull();
    expect(container?.textContent).not.toContain('Unable to complete footage research');
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

  function configureSpatialDiscovery(): void {
    mocks.getProviderStatus.mockResolvedValue({ openai: { configured: true }, elevenlabs: { configured: false }, pexels: { configured: true } });
    mocks.planVisualQueries.mockImplementation(async (input: unknown) => {
      const request = input as { readonly scenes: readonly [{ readonly sceneBinding: SceneVisualBinding }] };
      const sceneBinding = request.scenes[0].sceneBinding;
      const brief = {
        version: 1, sceneBinding, subject: 'Spatial subject', editorialRole: 'evidence', preferredMedia: 'image',
        visualStyleHints: [], visualExclusions: [], noveltyConstraints: [],
        sourceIntent: { allowedSourceKinds: ['licensed-stock'], commerciallyUsableSourceRequired: true, attributionPreference: 'no-preference' },
      } as const;
      return {
        status: 'planned',
        planning: {
          version: 1, briefs: [brief], queryPlans: [{
            version: 1, sceneBinding, briefFingerprint: visualBriefFingerprint(brief),
            concepts: [
              { query: 'spatial candidate', targetMedia: 'image', priority: 1, category: 'detail' },
              { query: 'spatial subject', targetMedia: 'image', priority: 2, category: 'evidence' },
              { query: 'spatial atmosphere', targetMedia: 'image', priority: 3, category: 'atmosphere' },
            ],
          }],
        },
      };
    });
    mocks.searchImages.mockResolvedValue([
      { id: 42, url: 'https://images.pexels.com/42.jpg', alt: 'Candidate A' },
      { id: 43, url: 'https://images.pexels.com/43.jpg', alt: 'Candidate B' },
    ]);
  }

  async function discoverCandidates(): Promise<void> {
    await clickButton('Find Visuals');
    await flush();
    expect(container?.querySelectorAll('img[src*="images.pexels.com"]')).toHaveLength(2);
  }

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

const APPLIED_MEDIA_A = '00000000-0000-4000-8000-000000000001/generated-images/00000000-0000-4000-8000-000000000010.png';
const APPLIED_MEDIA_B = '00000000-0000-4000-8000-000000000001/generated-images/00000000-0000-4000-8000-000000000011.png';
const GEOMETRY_MEDIA_A = 'studio-test-user/generated-images/00000000-0000-4000-8000-000000000010.png';
const GEOMETRY_MEDIA_B = 'studio-test-user/generated-images/00000000-0000-4000-8000-000000000011.png';

function displayGeometry(
  objectPath: string,
  encodedToDisplay: 'identity' | 'rotate-180' | 'rotate-90-cw' = 'identity',
  contentDigest = 'a'.repeat(64),
  expiresAt = '2099-01-01T00:00:00.000Z',
  referenceMarker = 'A',
) {
  const swaps = encodedToDisplay === 'rotate-90-cw';
  return {
    version: 1 as const,
    mediaIdentity: `media:${objectPath}`,
    encodedDimensions: { width: 1200, height: 800 },
    displayDimensions: swaps ? { width: 800, height: 1200 } : { width: 1200, height: 800 },
    encodedToDisplay,
    contentDigest,
    executionAuthority: {
      version: 1 as const,
      reference: `idga1_${referenceMarker.repeat(43)}`,
      expiresAt,
    },
  };
}

function spatialEvidence(x: number, y: number) {
  return {
    status: 'evaluated' as const, contractVersion: 'visual-spatial-v1' as const, analyzerVersion: 'openai:gpt-test',
    sourceDimensions: { width: 1200, height: 800 }, focalPoint: { x, y }, confidenceBand: 'medium' as const,
  };
}

function draftWithImage(objectPath: string): StudioDraft {
  const current = draft('script');
  return {
    ...current,
    scenes: [{
      ...current.scenes[0], imageUrl: 'https://signed.example/current.png',
      imageStorage: { bucket: 'media', objectPath },
    }],
  };
}

function pngFile() {
  return imageFile(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'image/png');
}

function jpegFile() {
  return imageFile(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x08, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]), 'image/jpeg');
}

function imageFile(bytes: Uint8Array, type: 'image/png' | 'image/jpeg') {
  // jsdom's Blob lacks arrayBuffer(); model the browser File surface consumed
  // by the image validator while the service tests cover real Blob byte parsing.
  return {
    type,
    size: bytes.byteLength,
    slice: (start = 0, end = bytes.byteLength) => {
      const selection = bytes.slice(start, end);
      return { arrayBuffer: async () => selection.buffer.slice(selection.byteOffset, selection.byteOffset + selection.byteLength) };
    },
  } as unknown as File;
}

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

function profile(id: string, userId: string, name: string) {
  return { id, user_id: userId, name, description: null, appearance: null, art_style: 'realistic', reference_url: null, created_at: '2026-08-15T00:00:00.000Z' };
}

function channel(): CanonicalChannelIdentity {
  return { id: 'youtube:UC-PROVIDER', source: 'native-youtube', legacyChannelId: null, publishingAccountId: 'youtube:provider', platform: 'youtube', channelRef: 'UC-PROVIDER', name: 'Provider channel', handle: null, niche: null, avatar_color: '#000', status: 'active', subscriber_count: 0, video_count: 0 };
}

function draft(step: StudioDraft['step']): StudioDraft {
  return { version: 1, projectId: 'provider-project', savedAt: '2026-08-13T00:00:00.000Z', step, channelId: 'youtube:UC-PROVIDER', topic: 'Provider test', niche: '', tone: 'engaging', duration: 30, title: 'Provider test', hook: '', script: 'Provider script', cta: '', scenes: [{ sceneId: 'visual-scene-00000000-0000-4000-8000-000000000003', text: 'Scene', duration: 5, visual: 'Visual', keywords: [] }], captionStyle: 'karaoke', transitionStyle: 'crossfade', motionStyle: 'kenburns', useBroll: false, musicId: '', musicVolume: 0.25, visualMode: 'auto', selectedStyleId: '', characterName: '', characterAppearance: '', characterArtStyle: 'realistic', characterProfileId: '', watermarkText: '', watermarkPosition: 'bottom-right', showSubtitles: true, captionTextColor: '', captionHighlightColor: '', beatSync: false, voiceoverMode: 'none', selectedVoice: '', targetLanguage: 'tr' };
}
