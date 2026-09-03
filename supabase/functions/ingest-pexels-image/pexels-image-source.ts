export interface PexelsPhotoSource {
  id?: unknown;
  src?: { original?: unknown; large2x?: unknown };
}

export interface ResolvedPexelsImageSource {
  /** Provider-original URL retained only as provenance. */
  originalSourceUrl: string;
  /** Pexels' documented, bounded display variant used for private acquisition. */
  downloadUrl: string;
  previewUrl: string;
}

/**
 * Resolves only URLs supplied by Pexels' authenticated photo response.  The
 * original can be far larger than the Edge image safety contract; large2x is
 * Pexels' deterministic 940x650 DPR-2 variant and remains adequate for the
 * Studio cover crop while staying inside the 4096 / 16 MP limits.
 */
export function resolvePexelsImageSource(
  photo: PexelsPhotoSource,
  mediaId: number,
): ResolvedPexelsImageSource | null {
  const originalSourceUrl = photo.src?.original;
  const downloadUrl = photo.src?.large2x;
  if (
    photo.id !== mediaId
    || !isApprovedPexelsUrl(originalSourceUrl, 'images.pexels.com')
    || !isApprovedPexelsUrl(downloadUrl, 'images.pexels.com')
  ) return null;

  return { originalSourceUrl, downloadUrl, previewUrl: downloadUrl };
}

export function isApprovedPexelsUrl(value: unknown, host: 'images.pexels.com' | 'www.pexels.com'): value is string {
  if (typeof value !== 'string' || value.length > 2_000 || [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return false;
  // Validate the raw authority before URL canonicalization can erase encoded or delimiter tricks.
  if (!new RegExp(`^https://${host.replace(/\./gu, '\\.')}(?:[/?]|$)`, 'iu').test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === host && !url.port && !url.username && !url.password && !url.hash;
  } catch {
    return false;
  }
}
