import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { advanceValidatedOwnerGeneration, setValidatedOwnerId } from '@/auth/identity';
import { useAuthSessionStore } from '@/auth/session';
import { I18nProvider } from '@/lib/i18n';
import { loadStudioDraft, saveStudioDraft, type StudioDraft } from '@/lib/studioDraft';
import type { CanonicalChannelIdentity } from '@/services/canonicalChannelCatalog';
import { Studio } from '@/views/Studio';

const mocks = vi.hoisted(() => ({
  buildProject: vi.fn(),
  resolveOwnedImageDisplayGeometry: vi.fn(),
  createSignedUrl: vi.fn(),
  issueOpaqueSpatialMediaAnalysisReference: vi.fn(),
  analyzeVisualSpatial: vi.fn(),
  analyzeDirector: vi.fn(),
}));

vi.mock('@/core/di', () => ({
  applicationContainer: { resolve: () => ({ buildProject: mocks.buildProject, generateScript: vi.fn() }) },
  dependencyTokens: { aiApplicationService: Symbol('aiApplicationService'), mediaEngine: Symbol('mediaEngine') },
}));
vi.mock('@/services/exportIntelligenceController', () => ({ loadExportCapabilities: vi.fn(), planActiveExport: vi.fn(), enqueueActiveExport: vi.fn(), waitForActiveExport: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ isSupabaseConfigured: false, supabase: { from: vi.fn(), storage: { from: vi.fn(() => ({ createSignedUrl: mocks.createSignedUrl })) } } }));
vi.mock('@/lib/api', () => ({
  generateVoiceover: vi.fn(), getProviderStatus: vi.fn(async () => ({ openai: { configured: true }, elevenlabs: { configured: true }, pexels: { configured: true } })), listVoices: vi.fn(async () => []), uploadMedia: vi.fn(),
  searchImages: vi.fn(async () => []), searchVideos: vi.fn(async () => []), ingestPexelsImage: vi.fn(), ingestPexelsVideo: vi.fn(), discardPexelsVideoQuarantine: vi.fn(), generateAIImage: vi.fn(), researchFootage: vi.fn(), translateSubtitles: vi.fn(),
  issueOpaqueSpatialMediaAnalysisReference: mocks.issueOpaqueSpatialMediaAnalysisReference, analyzeVisualSpatial: mocks.analyzeVisualSpatial, resolveOwnedImageDisplayGeometry: mocks.resolveOwnedImageDisplayGeometry,
}));
vi.mock('@/lib/videoRenderer', () => ({ renderVideo: vi.fn() }));
vi.mock('@/services/directorAnalysisController', () => ({
  analyzeActiveDirectorProject: mocks.analyzeDirector,
  cancelActiveDirectorAnalysis: vi.fn(),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('Studio Spatial Continuity Evidence V1', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    setValidatedOwnerId(OWNER);
    useAuthSessionStore.setState({ status: 'authenticated', user: { id: OWNER } as never, session: { access_token: 'token' } as never, error: null });
    mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed.example/image.png' }, error: null });
    mocks.resolveOwnedImageDisplayGeometry.mockImplementation(async (storage: { objectPath: string }) => geometry(storage.objectPath));
    mocks.issueOpaqueSpatialMediaAnalysisReference.mockResolvedValue({ reference: 'owned-spatial-reference' });
    mocks.analyzeVisualSpatial
      .mockResolvedValueOnce(spatial({ x: 0.5, y: 0.5 }))
      .mockResolvedValueOnce(spatial({ x: 0.5, y: 0.5 }));
    mocks.analyzeDirector.mockResolvedValue({ status: 'rejected', reason: 'source-unavailable' });
    saveStudioDraft(draft());
    container = document.createElement('div');
    document.body.append(container);
  });

  it('invalidates a captured Director current-source reader when its Studio instance unmounts', async () => {
    const base = draft();
    saveStudioDraft({
      ...base,
      step: 'render',
      scenes: base.scenes.map(({ imageStorage: _imageStorage, ...scene }) => scene),
    });
    const navigate = vi.fn();
    const pending = deferred<{ status: 'rejected'; reason: 'source-unavailable' }>();
    mocks.analyzeDirector.mockReturnValue(pending.promise);
    const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Studio channels={[channel()]} onNavigateDirector={navigate} /></I18nProvider>); await Promise.resolve(); });
    const analyze = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('AI Director'));
    expect(analyze).toBeDefined();
    await act(async () => { analyze?.dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); });
    expect(mocks.analyzeDirector).toHaveBeenCalledOnce();
    const source = mocks.analyzeDirector.mock.calls[0][0] as {
      readCurrentProjectId: () => string | null;
      readCurrentSource: () => unknown | null;
    };
    expect(source.readCurrentProjectId()).toBe(base.projectId);
    expect(source.readCurrentSource()).not.toBeNull();
    await act(async () => root.unmount());
    expect(source.readCurrentProjectId()).toBeNull();
    expect(source.readCurrentSource()).toBeNull();
    pending.resolve({ status: 'rejected', reason: 'source-unavailable' });
    await act(async () => { await pending.promise; });
    expect(navigate).not.toHaveBeenCalled();
  });

  afterEach(() => { vi.useRealTimers(); container.remove(); window.localStorage.clear(); vi.clearAllMocks(); });

  it('renders ordered advisory continuity conditions from applied Spatial evidence without an Apply or fix action', async () => {
    mocks.analyzeVisualSpatial
      .mockReset()
      .mockResolvedValueOnce(spatial({ x: 0.35, y: 0.5 }))
      .mockResolvedValueOnce(spatial({ x: 0.35, y: 0.5 }))
      .mockResolvedValueOnce(spatial({ x: 0.65, y: 0.5 }));
    const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Studio channels={[channel()]} onNavigateDirector={vi.fn()} /></I18nProvider>); await Promise.resolve(); });
    expect(container.querySelector('[data-testid="spatial-continuity-panel"]')).not.toBeNull();
    expect(container.textContent).toContain('0 analyzed · 2 evidence unavailable · 0 unsupported');
    expect(container.textContent).toContain('spatial evidence is unavailable for this comparison');
    const scenesBeforeAnalysis = structuredClone(loadStudioDraft()?.scenes);

    const analyze = () => Array.from(container.querySelectorAll<HTMLButtonElement>('button')).filter((button) => button.textContent?.trim() === 'Analyze framing');
    await act(async () => { analyze()[0].dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); });
    await act(async () => { analyze()[1].dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); });

    expect(container.textContent).toContain('2 analyzed · 0 evidence unavailable · 0 unsupported');
    expect(container.querySelectorAll('[data-testid="spatial-continuity-boundary"]')).toHaveLength(1);
    expect(container.textContent).toContain('Scenes 1 → 2');
    expect(container.textContent).toContain('same final crop window');
    expect(container.textContent).toContain('focal subject remains in the same visual zone');
    expect(container.textContent).not.toMatch(/Apply continuity|Fix continuity|Reframe all/u);
    const continuityRecommendation = container.querySelector('[data-testid="spatial-continuity-framing-recommendation"]');
    expect(continuityRecommendation?.textContent).toContain('Alternative framing available for Scene 2');
    expect(container.querySelectorAll('[data-testid="image-framing-suggestion"]')).toHaveLength(1);
    expect(loadStudioDraft()?.scenes).toEqual(scenesBeforeAnalysis);

    const dismiss = Array.from(continuityRecommendation!.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.trim() === 'Dismiss');
    await act(async () => { dismiss?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.querySelector('[data-testid="spatial-continuity-framing-recommendation"]')).toBeNull();
    expect(container.querySelectorAll('[data-testid="image-framing-suggestion"]')).toHaveLength(2);
    expect(loadStudioDraft()?.scenes).toEqual(scenesBeforeAnalysis);
    await act(async () => { analyze()[1].dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); });
    expect(container.querySelector('[data-testid="spatial-continuity-framing-recommendation"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-testid="image-framing-suggestion"]')).toHaveLength(1);
    await act(async () => root.unmount());
  });

  it('applies the shared 13B proposal only to the later scene and removes the repeated crop recommendation', async () => {
    mocks.analyzeVisualSpatial
      .mockReset()
      .mockResolvedValueOnce(spatial({ x: 0.35, y: 0.5 }))
      .mockResolvedValueOnce(spatial({ x: 0.35, y: 0.5 }));
    const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Studio channels={[channel()]} onNavigateDirector={vi.fn()} /></I18nProvider>); await Promise.resolve(); });
    const analyze = () => Array.from(container.querySelectorAll<HTMLButtonElement>('button')).filter((button) => button.textContent?.trim() === 'Analyze framing');
    await act(async () => { analyze()[0].dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); });
    await act(async () => { analyze()[1].dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); });
    const recommendation = container.querySelector('[data-testid="spatial-continuity-framing-recommendation"]');
    const apply = Array.from(recommendation!.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.trim() === 'Apply suggestion');
    expect(apply).toBeDefined();
    await act(async () => { apply?.dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 700)); });

    const saved = loadStudioDraft()?.scenes;
    expect(saved?.[0].imageFraming).toBeUndefined();
    expect(saved?.[0].imageFramingBinding).toBeUndefined();
    expect(saved?.[1].imageFraming).toBeDefined();
    expect(saved?.[1].imageFramingBinding?.contentDigest).toBe('a'.repeat(64));
    expect(container.querySelector('[data-testid="spatial-continuity-framing-recommendation"]')).toBeNull();
    expect(container.textContent).not.toContain('same final crop window');
    await act(async () => root.unmount());
  });

  it('uses the existing single manual framing editor for continuity Adjust without canonical mutation', async () => {
    mocks.analyzeVisualSpatial
      .mockReset()
      .mockResolvedValueOnce(spatial({ x: 0.35, y: 0.5 }))
      .mockResolvedValueOnce(spatial({ x: 0.35, y: 0.5 }));
    const scenesBefore = structuredClone(loadStudioDraft()?.scenes);
    const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Studio channels={[channel()]} onNavigateDirector={vi.fn()} /></I18nProvider>); await Promise.resolve(); });
    const analyze = () => Array.from(container.querySelectorAll<HTMLButtonElement>('button')).filter((button) => button.textContent?.trim() === 'Analyze framing');
    await act(async () => { analyze()[0].dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); });
    await act(async () => { analyze()[1].dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); });
    const recommendation = container.querySelector('[data-testid="spatial-continuity-framing-recommendation"]');
    const adjust = Array.from(recommendation!.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.trim() === 'Adjust suggestion');
    await act(async () => { adjust?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.querySelector('[data-testid="spatial-continuity-framing-recommendation"]')).toBeNull();
    expect(container.textContent?.match(/Pending — click or drag/gu)).toHaveLength(1);
    expect(loadStudioDraft()?.scenes).toEqual(scenesBefore);
    await act(async () => root.unmount());
  });

  it('fails a continuity Apply closed when the target reindexes before the existing 13B updater', async () => {
    mocks.analyzeVisualSpatial
      .mockReset()
      .mockResolvedValueOnce(spatial({ x: 0.35, y: 0.5 }))
      .mockResolvedValueOnce(spatial({ x: 0.35, y: 0.5 }));
    const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Studio channels={[channel()]} onNavigateDirector={vi.fn()} /></I18nProvider>); await Promise.resolve(); });
    const analyze = () => Array.from(container.querySelectorAll<HTMLButtonElement>('button')).filter((button) => button.textContent?.trim() === 'Analyze framing');
    await act(async () => { analyze()[0].dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); });
    await act(async () => { analyze()[1].dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); });
    const recommendation = container.querySelector('[data-testid="spatial-continuity-framing-recommendation"]');
    const apply = Array.from(recommendation!.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.trim() === 'Apply suggestion');
    const removePredecessor = container.querySelectorAll<HTMLButtonElement>('button.text-red-400')[0];
    expect(apply).toBeDefined();
    expect(removePredecessor).toBeDefined();
    await act(async () => {
      apply?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      removePredecessor.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(container.textContent).toContain('The framing suggestion is no longer current.');
    await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 700)); });
    const remaining = loadStudioDraft()?.scenes;
    expect(remaining).toHaveLength(1);
    expect(remaining?.[0].text).toBe('Scene 2');
    expect(remaining?.[0].imageFraming).toBeUndefined();
    expect(remaining?.[0].imageFramingBinding).toBeUndefined();
    await act(async () => root.unmount());
  });

  it('fails a continuity Apply closed when only the predecessor framing changes before the existing 13B updater', async () => {
    mocks.analyzeVisualSpatial
      .mockReset()
      .mockResolvedValueOnce(spatial({ x: 0.35, y: 0.5 }))
      .mockResolvedValueOnce(spatial({ x: 0.35, y: 0.5 }));
    const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Studio channels={[channel()]} onNavigateDirector={vi.fn()} /></I18nProvider>); await Promise.resolve(); });
    const analyze = () => Array.from(container.querySelectorAll<HTMLButtonElement>('button')).filter((button) => button.textContent?.trim() === 'Analyze framing');
    await act(async () => { analyze()[0].dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); });
    await act(async () => { analyze()[1].dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); });

    const predecessorSuggestion = container.querySelector('[data-testid="image-framing-suggestion"]');
    const adjustPredecessor = Array.from(predecessorSuggestion!.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.trim() === 'Adjust suggestion');
    await act(async () => { adjustPredecessor?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent?.match(/Pending — click or drag/gu)).toHaveLength(1);

    const recommendation = container.querySelector('[data-testid="spatial-continuity-framing-recommendation"]');
    const applyContinuity = Array.from(recommendation!.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.trim() === 'Apply suggestion');
    const applyPredecessor = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.trim() === 'Apply');
    expect(applyContinuity).toBeDefined();
    expect(applyPredecessor).toBeDefined();
    await act(async () => {
      applyContinuity?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      applyPredecessor?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.textContent).toContain('The framing suggestion is no longer current.');
    await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 700)); });
    const saved = loadStudioDraft()?.scenes;
    expect(saved).toHaveLength(2);
    expect(saved?.[0].imageFraming).toBeDefined();
    expect(saved?.[0].imageFramingBinding?.contentDigest).toBe('a'.repeat(64));
    expect(saved?.[1].imageFraming).toBeUndefined();
    expect(saved?.[1].imageFramingBinding).toBeUndefined();
    await act(async () => root.unmount());
  });

  it('rejects continuity Apply when predecessor evidence changes after its one-shot task is scheduled', async () => {
    vi.useFakeTimers();
    mocks.analyzeVisualSpatial
      .mockReset()
      .mockResolvedValueOnce(spatial({ x: 0.35, y: 0.5 }))
      .mockResolvedValueOnce(spatial({ x: 0.35, y: 0.5 }))
      .mockResolvedValueOnce(spatial({ x: 0.65, y: 0.5 }));
    const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Studio channels={[channel()]} onNavigateDirector={vi.fn()} /></I18nProvider>); await Promise.resolve(); });
    const analyze = () => Array.from(container.querySelectorAll<HTMLButtonElement>('button')).filter((button) => button.textContent?.trim() === 'Analyze framing');
    await act(async () => { analyze()[0].dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); });
    await act(async () => { analyze()[1].dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); });
    const recommendation = container.querySelector('[data-testid="spatial-continuity-framing-recommendation"]');
    const apply = Array.from(recommendation!.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.trim() === 'Apply suggestion');

    await act(async () => { apply?.dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); });
    await act(async () => { analyze()[0].dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); });
    await act(async () => { vi.advanceTimersByTime(0); });

    expect(container.textContent).toContain('The framing suggestion is no longer current.');
    await act(async () => { vi.advanceTimersByTime(700); });
    const saved = loadStudioDraft()?.scenes;
    expect(saved?.[0].imageFraming).toBeUndefined();
    expect(saved?.[1].imageFraming).toBeUndefined();
    expect(saved?.[1].imageFramingBinding).toBeUndefined();
    await act(async () => root.unmount());
  });

  it('rejects continuity Apply when validated-owner generation changes after its one-shot task is scheduled', async () => {
    vi.useFakeTimers();
    mocks.analyzeVisualSpatial
      .mockReset()
      .mockResolvedValueOnce(spatial({ x: 0.35, y: 0.5 }))
      .mockResolvedValueOnce(spatial({ x: 0.35, y: 0.5 }));
    const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Studio channels={[channel()]} onNavigateDirector={vi.fn()} /></I18nProvider>); await Promise.resolve(); });
    const analyze = () => Array.from(container.querySelectorAll<HTMLButtonElement>('button')).filter((button) => button.textContent?.trim() === 'Analyze framing');
    await act(async () => { analyze()[0].dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); });
    await act(async () => { analyze()[1].dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); });
    const recommendation = container.querySelector('[data-testid="spatial-continuity-framing-recommendation"]');
    const apply = Array.from(recommendation!.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.trim() === 'Apply suggestion');

    await act(async () => { apply?.dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); });
    advanceValidatedOwnerGeneration();
    await act(async () => { vi.advanceTimersByTime(0); });

    expect(container.textContent).toContain('The framing suggestion is no longer current.');
    await act(async () => { vi.advanceTimersByTime(700); });
    const saved = loadStudioDraft()?.scenes;
    expect(saved?.[0].imageFraming).toBeUndefined();
    expect(saved?.[1].imageFraming).toBeUndefined();
    expect(saved?.[1].imageFramingBinding).toBeUndefined();
    await act(async () => root.unmount());
  });

  it('rejects continuity Apply at transaction time when predecessor geometry expires but target geometry remains live', async () => {
    vi.useFakeTimers();
    const start = Date.parse('2026-09-06T10:00:00.000Z');
    vi.setSystemTime(start);
    mocks.resolveOwnedImageDisplayGeometry.mockImplementation(async (storage: { objectPath: string }) => geometry(
      storage.objectPath,
      'a'.repeat(64),
      new Date(start + (storage.objectPath.endsWith('101.png') ? 1_000 : 10_000)).toISOString(),
    ));
    mocks.analyzeVisualSpatial
      .mockReset()
      .mockResolvedValueOnce(spatial({ x: 0.35, y: 0.5 }))
      .mockResolvedValueOnce(spatial({ x: 0.35, y: 0.5 }));
    const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Studio channels={[channel()]} onNavigateDirector={vi.fn()} /></I18nProvider>); await Promise.resolve(); });
    const analyze = () => Array.from(container.querySelectorAll<HTMLButtonElement>('button')).filter((button) => button.textContent?.trim() === 'Analyze framing');
    await act(async () => { analyze()[0].dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); });
    await act(async () => { analyze()[1].dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); });
    const recommendation = container.querySelector('[data-testid="spatial-continuity-framing-recommendation"]');
    const apply = Array.from(recommendation!.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.trim() === 'Apply suggestion');

    await act(async () => { apply?.dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); });
    vi.setSystemTime(start + 1_000);
    await act(async () => { vi.advanceTimersByTime(0); });

    expect(container.textContent).toContain('The framing suggestion is no longer current.');
    vi.setSystemTime(start + 1_500);
    await act(async () => { vi.advanceTimersByTime(700); });
    const saved = loadStudioDraft()?.scenes;
    expect(saved?.[0].imageFraming).toBeUndefined();
    expect(saved?.[1].imageFraming).toBeUndefined();
    expect(saved?.[1].imageFramingBinding).toBeUndefined();
    await act(async () => root.unmount());
  });

  it('submits one continuity mutation under StrictMode effect replay', async () => {
    vi.useFakeTimers();
    mocks.analyzeVisualSpatial
      .mockReset()
      .mockResolvedValueOnce(spatial({ x: 0.35, y: 0.5 }))
      .mockResolvedValueOnce(spatial({ x: 0.35, y: 0.5 }));
    const root = createRoot(container);
    await act(async () => { root.render(<StrictMode><I18nProvider><Studio channels={[channel()]} onNavigateDirector={vi.fn()} /></I18nProvider></StrictMode>); await Promise.resolve(); });
    const analyze = () => Array.from(container.querySelectorAll<HTMLButtonElement>('button')).filter((button) => button.textContent?.trim() === 'Analyze framing');
    await act(async () => { analyze()[0].dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); });
    await act(async () => { analyze()[1].dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); });
    const recommendation = container.querySelector('[data-testid="spatial-continuity-framing-recommendation"]');
    const apply = Array.from(recommendation!.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.trim() === 'Apply suggestion');

    await act(async () => { apply?.dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); });
    await act(async () => { vi.advanceTimersByTime(0); });
    await act(async () => { vi.advanceTimersByTime(700); });

    const saved = loadStudioDraft()?.scenes;
    expect(saved?.[0].imageFraming).toBeUndefined();
    expect(saved?.[0].imageFramingBinding).toBeUndefined();
    expect(saved?.[1].imageFraming).toBeDefined();
    expect(saved?.[1].imageFramingBinding?.contentDigest).toBe('a'.repeat(64));
    expect(container.textContent).not.toContain('The framing suggestion is no longer current.');
    await act(async () => root.unmount());
  });

  it('shows analyzed, unavailable, and unsupported coverage in canonical boundary order', async () => {
    const base = draft();
    saveStudioDraft({
      ...base,
      scenes: [
        ...base.scenes,
        { sceneId: 'visual-scene-00000000-0000-4000-8000-000000000003', text: 'Video', duration: 4, visual: 'video', videoStorage: { bucket: 'media', objectPath: `${OWNER}/videos/00000000-0000-4000-8000-000000000103.mp4` } },
        { sceneId: 'visual-scene-00000000-0000-4000-8000-000000000004', text: 'Color', duration: 4, visual: 'color' },
      ],
    });
    const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Studio channels={[channel()]} onNavigateDirector={vi.fn()} /></I18nProvider>); await Promise.resolve(); });
    const analyze = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).filter((button) => button.textContent?.trim() === 'Analyze framing');
    await act(async () => { analyze[0].dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); });
    expect(container.textContent).toContain('1 analyzed');
    expect(container.textContent).toContain('1 evidence unavailable');
    expect(container.textContent).toContain('2 unsupported');
    const boundaries = Array.from(container.querySelectorAll('[data-testid="spatial-continuity-boundary"]')).map((item) => item.textContent);
    expect(boundaries).toHaveLength(3);
    expect(boundaries[0]).toContain('Scenes 1'); expect(boundaries[0]).toContain('2');
    expect(boundaries[1]).toContain('Scenes 2'); expect(boundaries[1]).toContain('3');
    expect(boundaries[2]).toContain('Scenes 3'); expect(boundaries[2]).toContain('4');
    expect(boundaries.every((item) => item?.includes('spatial evidence is unavailable for this comparison'))).toBe(true);
    expect(container.textContent).not.toContain('same final crop window');
    await act(async () => root.unmount());
  });

  it('automatically makes analyzed coverage unavailable at geometry expiry without scene mutation', async () => {
    vi.useFakeTimers();
    const start = Date.parse('2026-09-05T10:00:00.000Z');
    vi.setSystemTime(start);
    mocks.resolveOwnedImageDisplayGeometry.mockImplementation(async (storage: { objectPath: string }) => geometry(storage.objectPath, 'a'.repeat(64), new Date(start + 1_000).toISOString()));
    const scenesBefore = structuredClone(loadStudioDraft()?.scenes);
    const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Studio channels={[channel()]} onNavigateDirector={vi.fn()} /></I18nProvider>); await Promise.resolve(); });
    const analyze = () => Array.from(container.querySelectorAll<HTMLButtonElement>('button')).filter((button) => button.textContent?.trim() === 'Analyze framing');
    await act(async () => { analyze()[0].dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); });
    await act(async () => { analyze()[1].dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); });
    expect(container.textContent).toContain('2 analyzed');
    await act(async () => { vi.advanceTimersByTime(1_000); await Promise.resolve(); });
    expect(container.textContent).toContain('0 analyzed');
    expect(container.textContent).toContain('2 evidence unavailable');
    expect(container.textContent).toContain('spatial evidence is unavailable for this comparison');
    expect(loadStudioDraft()?.scenes).toEqual(scenesBefore);
    await act(async () => root.unmount());
  });
});

const OWNER = '00000000-0000-4000-8000-000000000001';
function spatial(focalPoint: { x: number; y: number }) {
  return { status: 'evaluated', contractVersion: 'visual-spatial-v1', analyzerVersion: 'openai:test', sourceDimensions: { width: 1200, height: 800 }, focalPoint, confidenceBand: 'medium' };
}
function geometry(objectPath: string, contentDigest = 'a'.repeat(64), expiresAt = '2099-01-01T00:00:00.000Z') {
  return {
    version: 1 as const, mediaIdentity: `media:${objectPath}`, encodedDimensions: { width: 1200, height: 800 }, displayDimensions: { width: 1200, height: 800 }, encodedToDisplay: 'identity' as const,
    contentDigest, executionAuthority: { version: 1 as const, reference: `idga1_${'a'.repeat(43)}`, expiresAt },
  };
}
function draft(): StudioDraft {
  return {
    version: 1, projectId: 'spatial-continuity-project', savedAt: '2026-09-05T00:00:00.000Z', step: 'script', channelId: 'youtube:UC-CONTINUITY', topic: 'Continuity', niche: '', tone: 'engaging', duration: 20, title: 'Continuity', hook: '', script: 'Continuity', cta: '',
    scenes: [1, 2].map((number) => ({ sceneId: `visual-scene-00000000-0000-4000-8000-0000000000${number}`, text: `Scene ${number}`, duration: 4, visual: 'visual', imageStorage: { bucket: 'media', objectPath: `${OWNER}/generated-images/00000000-0000-4000-8000-00000000010${number}.png` } })),
    captionStyle: 'karaoke', transitionStyle: 'crossfade', motionStyle: 'kenburns', useBroll: false, musicId: '', musicVolume: 0.25, visualMode: 'auto', selectedStyleId: '', characterName: '', characterAppearance: '', characterArtStyle: 'realistic', characterProfileId: '', watermarkText: '', watermarkPosition: 'bottom-right', showSubtitles: true, captionTextColor: '', captionHighlightColor: '', beatSync: false, voiceoverMode: 'none', selectedVoice: '', targetLanguage: 'en',
  };
}
function channel(): CanonicalChannelIdentity {
  return { id: 'youtube:UC-CONTINUITY', source: 'native-youtube', legacyChannelId: null, publishingAccountId: 'youtube:continuity', platform: 'youtube', channelRef: 'UC-CONTINUITY', name: 'Continuity', handle: null, niche: null, avatar_color: '#000000', status: 'active', subscriber_count: 0, video_count: 0 };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
