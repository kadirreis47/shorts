import { searchImages, searchVideos } from '@/lib/api';
import { isApiError } from '@/lib/api/client';
import type {
  VisualDiscoveryCandidate,
  VisualDiscoveryProvider,
  VisualDiscoveryOrientation,
} from '@/core/visual-intelligence';

const MAX_DESCRIPTOR = 120;

/** Planning-only adapter: temporary Pexels URLs are discarded at this boundary. */
export interface PexelsVisualDiscoveryProvider extends VisualDiscoveryProvider {
  resolvePreview(candidateId: string): string | undefined;
}

export function createPexelsVisualDiscoveryProvider(): PexelsVisualDiscoveryProvider {
  const previews = new Map<string, string>();
  return {
    id: 'pexels',
    capabilities: new Set(['image', 'video']),
    async search({ query, mediaType, limit, signal }) {
      if (signal?.aborted) throw new DOMException('Visual discovery cancelled', 'AbortError');
      if (mediaType === 'image') {
        let images: Awaited<ReturnType<typeof searchImages>>;
        try { images = await searchImages(query, limit, 0); } catch (error) {
          pexelsDiscoveryDiagnostic('image', error); throw error;
        }
        if (signal?.aborted) throw new DOMException('Visual discovery cancelled', 'AbortError');
        return images.map((image) => {
          const value = candidate({
          providerMediaIdentity: String(image.id), mediaType: 'image', orientation: 'portrait',
          descriptor: boundedDescriptor(image.alt),
          }); previews.set(value.candidateId, image.url); return value;
        });
      }
      let videos: Awaited<ReturnType<typeof searchVideos>>;
      try { videos = await searchVideos(query, limit, 0); } catch (error) {
        pexelsDiscoveryDiagnostic('video', error); throw error;
      }
      if (signal?.aborted) throw new DOMException('Visual discovery cancelled', 'AbortError');
      return videos.map((video) => {
        const value = candidate({
        providerMediaIdentity: String(video.id), mediaType: 'video', orientation: orientation(video.width, video.height),
        width: video.width, height: video.height, durationMs: Math.round(video.duration * 1_000),
        }); previews.set(value.candidateId, video.preview); return value;
      });
    },
    resolvePreview(candidateId: string) { return previews.get(candidateId); },
  };
}

function pexelsDiscoveryDiagnostic(mediaType: 'image' | 'video', error: unknown): void {
  // Search concepts and provider payloads must never leave this session-only adapter.
  console.info('[premium-visual-discovery]', {
    code: 'VISUAL_DISCOVERY_PROVIDER_REQUEST_FAILED', mediaType,
    ...(isApiError(error) ? { apiCode: error.code } : {}),
  });
}

function candidate(input: {
  providerMediaIdentity: string; mediaType: 'image' | 'video'; orientation: VisualDiscoveryOrientation;
  width?: number; height?: number; durationMs?: number; descriptor?: string;
}): VisualDiscoveryCandidate {
  return Object.freeze({
    candidateId: 'pexels:' + input.mediaType + ':' + input.providerMediaIdentity,
    provider: 'pexels' as const, providerMediaIdentity: input.providerMediaIdentity, mediaType: input.mediaType,
    orientation: input.orientation,
    ...(input.width !== undefined ? { width: input.width } : {}),
    ...(input.height !== undefined ? { height: input.height } : {}),
    ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
    ...(input.descriptor ? { descriptor: input.descriptor } : {}),
    conceptCategories: [], conceptPriorities: [], providerRanks: [],
    sourcePolicy: Object.freeze({ provider: 'pexels' as const, sourceClass: 'provider-catalog' as const }),
  });
}

function orientation(width: number, height: number): VisualDiscoveryOrientation {
  return height > width ? 'portrait' : width > height ? 'landscape' : 'square';
}
function boundedDescriptor(value: string): string | undefined {
  const normalized = value.replace(/\r\n?/gu, ' ').trim();
  return normalized && normalized.length <= MAX_DESCRIPTOR && !/(?:https?:\/\/|www\.)/iu.test(normalized) ? normalized : undefined;
}
