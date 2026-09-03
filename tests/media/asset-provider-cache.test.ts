import { describe, expect, it, vi } from 'vitest';
import { TypedEventBus, type ApplicationEventMap } from '@/core/events';
import {
  createAssetProviderEngine,
  createAssetSearchCache,
  createMediaEngine,
  type AssetCandidate,
  type AssetSearchQuery,
} from '@/core/media';
import { searchImages, searchVideos } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  searchImages: vi.fn(async () => [{ id: 1, original: 'https://example.test/remote.jpg', url: 'https://example.test/preview.jpg', alt: 'remote', photographer: 'test', photographerUrl: 'https://example.test/author' }]),
  searchVideos: vi.fn(async () => []),
}));

const settings = {
  resolution: { width: 1080, height: 1920 }, aspectRatio: '9:16' as const, fps: 30,
  defaultTransitionMs: 0, wordsPerMinute: 150, minimumSceneDurationMs: 1000,
  maximumSceneDurationMs: 60000, pacingPreset: 'balanced' as const, transitionOverlap: 0,
  beatIntervalMs: 1000, snapToFrames: true,
};

function inputScene(imageUrl?: string, sceneId = 'visual-scene-00000000-0000-4000-8000-000000000001') {
  return { sceneId, text: 'Same search text', duration: 3, visual: 'Same visual prompt', ...(imageUrl ? { imageUrl } : {}) };
}

describe('asset provider cache correctness', () => {
  it('resolves each scene-local source even when search text is identical', async () => {
    const engine = createAssetProviderEngine(new TypedEventBus<ApplicationEventMap>());
    const sources = ['C:\\assets\\scene-one.png', 'C:\\assets\\scene-two.png', 'C:\\assets\\scene-three.png'];
    const result = await engine.resolve(sources.map((source, index) => inputScene(source, `visual-scene-00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`)).map((source, index) => ({
      id: `scene-${index + 1}`, sourceScene: source, index, text: source.text, visualPrompt: source.visual,
      keywords: [], role: 'hook' as const, startMs: index * 3000, endMs: (index + 1) * 3000,
      durationMs: 3000, intensity: 0.8, assetIds: [], cameraMotion: 'none' as const,
      transition: { type: 'cut' as const, durationMs: 0 }, overlapBeforeMs: 0, overlapAfterMs: 0, subtitleText: source.text,
    })), settings);

    expect(result.report).toMatchObject({ resolvedCount: 3, unresolvedCount: 0, duplicateCandidatesRejected: 0, cacheHits: 0 });
    expect(result.assets.map((asset) => asset.source)).toEqual(sources);
  });

  it('does not retain a scene-local source across builds with the same scene id', async () => {
    const bus = new TypedEventBus<ApplicationEventMap>();
    const engine = createAssetProviderEngine(bus);
    const media = createMediaEngine(bus, engine);
    const first = await media.buildProject({ projectId: 'cache-scene-local', title: 'Cache', audio: { narrationMode: 'silent' }, scenes: [inputScene('C:\\app\\first.png')] });
    const second = await media.buildProject({ projectId: 'cache-scene-local', title: 'Cache', audio: { narrationMode: 'silent' }, scenes: [inputScene('C:\\app\\second.png')] });

    expect(first.project.assets[0].source).toBe('C:\\app\\first.png');
    expect(second.project.assets[0].source).toBe('C:\\app\\second.png');
    expect(second.validation.issues.map((issue) => issue.code)).not.toContain('SCENE_ASSET_UNRESOLVED');
  });

  it('retains query-scoped Pexels cache reuse', async () => {
    vi.mocked(searchImages).mockClear();
    vi.mocked(searchVideos).mockClear();
    const engine = createAssetProviderEngine(new TypedEventBus<ApplicationEventMap>());
    const makeScene = (id: string) => ({ id, sourceScene: inputScene(), index: 0, text: 'Same search text', visualPrompt: 'Same visual prompt', keywords: [], role: 'hook' as const, startMs: 0, endMs: 3000, durationMs: 3000, intensity: 0.8, assetIds: [], cameraMotion: 'none' as const, transition: { type: 'cut' as const, durationMs: 0 }, overlapBeforeMs: 0, overlapAfterMs: 0, subtitleText: 'Same search text' });
    const result = await engine.resolve([makeScene('remote-1'), makeScene('remote-2')], settings);

    expect(searchImages).toHaveBeenCalledTimes(1);
    expect(searchVideos).toHaveBeenCalledTimes(1);
    expect(result.report.cacheHits).toBe(1);
  });

  it('keeps cache TTL expiry and explicit clearing intact', () => {
    vi.useFakeTimers();
    try {
      const cache = createAssetSearchCache(100);
      const query: AssetSearchQuery = { sceneId: 'scene-1', text: 'Text', visualPrompt: 'Visual', keywords: [], queries: ['visual'], preferredTypes: ['image'], targetWidth: 1080, targetHeight: 1920, minimumDurationMs: 1000, maximumDurationMs: 6000 };
      const candidates: AssetCandidate[] = [{ id: 'asset-1', providerId: 'pexels', type: 'image', source: 'https://example.test/image.jpg' }];
      cache.set('pexels', query, candidates);
      expect(cache.get('pexels', query)).toEqual(candidates);
      vi.advanceTimersByTime(100);
      expect(cache.get('pexels', query)).toBeNull();
      cache.set('pexels', query, candidates);
      cache.clear();
      expect(cache.get('pexels', query)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
