import { searchImages, searchVideos } from '@/lib/api';
import type { AssetCandidate, AssetProvider } from '../assetProviderTypes';

export function createPexelsAssetProvider(): AssetProvider {
  return {
    id: 'pexels',
    priority: 50,
    capabilities: new Set(['image', 'video']),
    isAvailable: () => true,
    async search(query, context) {
      const searchText = query.queries[0] || query.visualPrompt || query.text;
      if (!searchText) return [];
      throwIfAborted(context.signal);

      const wantsVideo = query.preferredTypes.some((type) => type === 'video' || type === 'broll');
      const wantsImage = query.preferredTypes.some((type) => type === 'image' || type === 'ai_image');
      const [videos, images] = await Promise.all([
        wantsVideo ? searchVideos(searchText, context.limit).catch(() => []) : Promise.resolve([]),
        wantsImage ? searchImages(searchText, context.limit).catch(() => []) : Promise.resolve([]),
      ]);
      throwIfAborted(context.signal);

      const candidates: AssetCandidate[] = [
        ...videos.map((video) => ({
          id: String(video.id),
          providerId: 'pexels',
          type: 'video' as const,
          source: video.fileUrl,
          previewSource: video.preview,
          width: video.width,
          height: video.height,
          durationMs: video.duration * 1_000,
          title: searchText,
          attribution: video.photographer,
          license: 'Pexels License',
          relevance: 0.65,
          metadata: { pageUrl: video.url },
        })),
        ...images.map((image) => ({
          id: String(image.id),
          providerId: 'pexels',
          type: 'image' as const,
          source: image.original,
          previewSource: image.url,
          title: image.alt || searchText,
          attribution: image.photographer,
          license: 'Pexels License',
          relevance: 0.6,
          metadata: { photographerUrl: image.photographerUrl },
        })),
      ];

      return candidates.slice(0, context.limit * 2);
    },
  };
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Asset search cancelled', 'AbortError');
}
