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
  researchFootage: vi.fn(), uploadMedia: vi.fn(),
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
  getProviderStatus: mocks.getProviderStatus, generateVoiceover: vi.fn(), listVoices: vi.fn(async () => []), uploadMedia: mocks.uploadMedia,
  searchImages: mocks.searchImages, searchVideos: mocks.searchVideos, generateAIImage: vi.fn(), researchFootage: mocks.researchFootage,
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
    const pending = deferred<Array<{ sceneIndex: number; imageUrl: string }>>();
    mocks.getProviderStatus.mockResolvedValue({ openai: { configured: false }, elevenlabs: { configured: false }, pexels: { configured: true } });
    mocks.researchFootage.mockReturnValueOnce(pending.promise);
    saveStudioDraft({ ...draft('style'), visualMode: 'real_footage' });
    const root = await renderStudio();
    await clickButton('Research Real Footage');
    setValidatedOwnerId('studio-user-b');
    advanceValidatedOwnerGeneration();
    await act(async () => { pending.resolve([{ sceneIndex: 0, imageUrl: 'https://images.pexels.com/a.png' }]); });

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
  return { version: 1, projectId: 'provider-project', savedAt: '2026-08-13T00:00:00.000Z', step, channelId: 'youtube:UC-PROVIDER', topic: 'Provider test', niche: '', tone: 'engaging', duration: 30, title: 'Provider test', hook: '', script: 'Provider script', cta: '', scenes: [{ text: 'Scene', duration: 5, visual: 'Visual', keywords: [] }], captionStyle: 'karaoke', transitionStyle: 'crossfade', motionStyle: 'kenburns', useBroll: false, musicId: '', musicVolume: 0.25, visualMode: 'auto', selectedStyleId: '', characterName: '', characterAppearance: '', characterArtStyle: 'realistic', characterProfileId: '', watermarkText: '', watermarkPosition: 'bottom-right', showSubtitles: true, captionTextColor: '', captionHighlightColor: '', beatSync: false, voiceoverMode: 'none', selectedVoice: '', targetLanguage: 'tr' };
}
