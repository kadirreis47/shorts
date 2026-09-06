import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setValidatedOwnerId } from '@/auth/identity';
import { useAuthSessionStore } from '@/auth/session';
import { I18nProvider } from '@/lib/i18n';
import { saveStudioDraft, type StudioDraft } from '@/lib/studioDraft';
import type { CanonicalChannelIdentity } from '@/services/canonicalChannelCatalog';
import { Studio } from '@/views/Studio';

const mocks = vi.hoisted(() => ({
  buildProject: vi.fn(), resolveOwnedImageDisplayGeometry: vi.fn(), createSignedUrl: vi.fn(),
  issueOpaqueSpatialMediaAnalysisReference: vi.fn(), analyzeVisualSpatial: vi.fn(),
}));

vi.mock('@/core/di', () => ({ applicationContainer: { resolve: () => ({ buildProject: mocks.buildProject, generateScript: vi.fn() }) }, dependencyTokens: { aiApplicationService: Symbol('aiApplicationService'), mediaEngine: Symbol('mediaEngine') } }));
vi.mock('@/services/exportIntelligenceController', () => ({ loadExportCapabilities: vi.fn(), planActiveExport: vi.fn(), enqueueActiveExport: vi.fn(), waitForActiveExport: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ isSupabaseConfigured: false, supabase: { from: vi.fn(), storage: { from: vi.fn(() => ({ createSignedUrl: mocks.createSignedUrl })) } } }));
vi.mock('@/lib/api', () => ({
  generateVoiceover: vi.fn(), getProviderStatus: vi.fn(async () => ({ openai: { configured: true }, elevenlabs: { configured: true }, pexels: { configured: true } })), listVoices: vi.fn(async () => []), uploadMedia: vi.fn(),
  searchImages: vi.fn(async () => []), searchVideos: vi.fn(async () => []), ingestPexelsImage: vi.fn(), ingestPexelsVideo: vi.fn(), discardPexelsVideoQuarantine: vi.fn(), generateAIImage: vi.fn(), researchFootage: vi.fn(), translateSubtitles: vi.fn(),
  issueOpaqueSpatialMediaAnalysisReference: mocks.issueOpaqueSpatialMediaAnalysisReference, analyzeVisualSpatial: mocks.analyzeVisualSpatial, resolveOwnedImageDisplayGeometry: mocks.resolveOwnedImageDisplayGeometry,
}));
vi.mock('@/lib/videoRenderer', () => ({ renderVideo: vi.fn() }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const OWNER = '00000000-0000-4000-8000-000000000001';
describe('Studio Visual Rhythm Evidence V1', () => {
  let container: HTMLDivElement;
  beforeEach(() => {
    setValidatedOwnerId(OWNER);
    useAuthSessionStore.setState({ status: 'authenticated', user: { id: OWNER } as never, session: { access_token: 'token' } as never, error: null });
    mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed.example/image.png' }, error: null });
    mocks.resolveOwnedImageDisplayGeometry.mockImplementation(async (storage: { objectPath: string }) => geometry(storage.objectPath));
    mocks.issueOpaqueSpatialMediaAnalysisReference.mockResolvedValue({ reference: 'owned-spatial-reference' });
    mocks.analyzeVisualSpatial.mockImplementation(async () => spatial());
    container = document.createElement('div'); document.body.append(container);
  });
  afterEach(() => { container.remove(); window.localStorage.clear(); vi.clearAllMocks(); });

  it('is hidden below two scenes and renders neutral structural and spatial evidence without controls', async () => {
    saveStudioDraft({ ...draft(), scenes: [draft().scenes[0]] });
    const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Studio channels={[channel()]} onNavigateDirector={vi.fn()} /></I18nProvider>); await Promise.resolve(); });
    expect(container.querySelector('[data-testid="visual-rhythm-panel"]')).toBeNull();
    await act(async () => root.unmount());

    const mixedCoverageDraft = draft();
    mixedCoverageDraft.scenes[2] = {
      ...mixedCoverageDraft.scenes[2],
      imageStorage: undefined,
      videoStorage: { bucket: 'media', objectPath: `${OWNER}/video/visual-rhythm.mp4` },
    };
    saveStudioDraft(mixedCoverageDraft);
    const secondRoot = createRoot(container);
    await act(async () => { secondRoot.render(<I18nProvider><Studio channels={[channel()]} onNavigateDirector={vi.fn()} /></I18nProvider>); await Promise.resolve(); });
    const panel = container.querySelector('[data-testid="visual-rhythm-panel"]');
    expect(panel?.textContent).toContain('3 structural scenes');
    expect(panel?.textContent).toContain('2 spatial evidence unavailable');
    expect(panel?.textContent).toContain('1 spatially unsupported');
    expect(panel?.textContent).toContain('Spatial runs stop where spatial evidence is unavailable or unsupported.');
    expect(panel?.querySelectorAll('button')).toHaveLength(0);
    await act(async () => secondRoot.unmount());
  });

  it('renders current analyzed run facts and keeps unavailable and unsupported gaps neutral', async () => {
    saveStudioDraft(draft());
    const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Studio channels={[channel()]} onNavigateDirector={vi.fn()} /></I18nProvider>); await Promise.resolve(); });
    const analyze = () => Array.from(container.querySelectorAll<HTMLButtonElement>('button')).filter((button) => button.textContent?.trim() === 'Analyze framing');
    await act(async () => { for (const button of analyze()) { button.dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); } });
    const panel = container.querySelector('[data-testid="visual-rhythm-panel"]');
    expect(panel?.textContent).toContain('3 spatially analyzed');
    expect(panel?.textContent).toContain('3 consecutive scenes use the same effective motion setting.');
    expect(panel?.textContent).toContain('2 incoming boundaries use the same transition.');
    expect(panel?.textContent).toContain('3 analyzed scenes retain the same focal zone.');
    expect(panel?.textContent).toContain('3 analyzed scenes retain the same exact final crop.');
    expect(panel?.querySelectorAll('[data-testid="visual-rhythm-run"]')).not.toHaveLength(0);
    expect(panel?.querySelectorAll('button')).toHaveLength(0);
    await act(async () => root.unmount());
  });
});

function spatial() { return { status: 'evaluated', contractVersion: 'visual-spatial-v1', analyzerVersion: 'openai:test', sourceDimensions: { width: 1200, height: 800 }, focalPoint: { x: 0.5, y: 0.5 }, confidenceBand: 'medium' }; }
function geometry(objectPath: string) { return { version: 1 as const, mediaIdentity: `media:${objectPath}`, encodedDimensions: { width: 1200, height: 800 }, displayDimensions: { width: 1200, height: 800 }, encodedToDisplay: 'identity' as const, contentDigest: 'a'.repeat(64), executionAuthority: { version: 1 as const, reference: `idga1_${'a'.repeat(43)}`, expiresAt: '2099-01-01T00:00:00.000Z' } }; }
function draft(): StudioDraft { return { version: 1, projectId: 'visual-rhythm-project', savedAt: '2026-09-06T00:00:00.000Z', step: 'script', channelId: 'youtube:UC-RHYTHM', topic: 'Rhythm', niche: '', tone: 'engaging', duration: 20, title: 'Rhythm', hook: '', script: 'Rhythm', cta: '', scenes: [1, 2, 3].map((number) => ({ sceneId: `visual-scene-00000000-0000-4000-8000-00000000000${number}`, text: `Scene ${number}`, duration: 4, visual: 'visual', imageStorage: { bucket: 'media', objectPath: `${OWNER}/generated-images/00000000-0000-4000-8000-00000000010${number}.png` } })), captionStyle: 'karaoke', transitionStyle: 'crossfade', motionStyle: 'kenburns', useBroll: false, musicId: '', musicVolume: 0.25, visualMode: 'auto', selectedStyleId: '', characterName: '', characterAppearance: '', characterArtStyle: 'realistic', characterProfileId: '', watermarkText: '', watermarkPosition: 'bottom-right', showSubtitles: true, captionTextColor: '', captionHighlightColor: '', beatSync: false, voiceoverMode: 'none', selectedVoice: '', targetLanguage: 'en' }; }
function channel(): CanonicalChannelIdentity { return { id: 'youtube:UC-RHYTHM', source: 'native-youtube', legacyChannelId: null, publishingAccountId: 'youtube:rhythm', platform: 'youtube', channelRef: 'UC-RHYTHM', name: 'Rhythm', handle: null, niche: null, avatar_color: '#000000', status: 'active', subscriber_count: 0, video_count: 0 }; }
