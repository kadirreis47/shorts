export interface CatalogMusicTrack {
  readonly id: 'upbeat' | 'chill' | 'cinematic' | 'corporate';
  readonly name: string;
  readonly url: string;
  readonly mood: string;
}

export const MUSIC_TRACKS: readonly CatalogMusicTrack[] = [
  { id: 'upbeat', name: 'Upbeat Energy', url: 'https://cdn.pixabay.com/download/audio/2024/08/09/audio_6b17b8caa7.mp3', mood: 'Energetic, fast-paced' },
  { id: 'chill', name: 'Chill Lo-Fi', url: 'https://cdn.pixabay.com/download/audio/2022/12/23/audio_2e6aa5cbcd.mp3', mood: 'Calm, focused' },
  { id: 'cinematic', name: 'Cinematic', url: 'https://cdn.pixabay.com/download/audio/2024/06/30/audio_a57de12254.mp3', mood: 'Dramatic, epic' },
  { id: 'corporate', name: 'Corporate', url: 'https://cdn.pixabay.com/download/audio/2023/04/27/audio_d6ce814591.mp3', mood: 'Professional, clean' },
];

const MAX_CATALOG_MUSIC_BYTES = 25 * 1024 * 1024;
const APPROVED_CATALOG_MUSIC_URLS: ReadonlySet<string> = new Set(MUSIC_TRACKS.map((track) => track.url));

export function isApprovedCatalogMusicUrl(value: string): boolean {
  return APPROVED_CATALOG_MUSIC_URLS.has(value);
}

export function isValidCatalogMusicResponse(url: string, status: number, contentType: string | null, contentLength: string | null): boolean {
  const bytes = Number(contentLength);
  return status >= 200 && status < 300
    && isApprovedCatalogMusicUrl(url)
    && contentType?.split(';', 1)[0]?.trim().toLowerCase() === 'audio/mpeg'
    && Number.isSafeInteger(bytes) && bytes > 0 && bytes <= MAX_CATALOG_MUSIC_BYTES;
}

export function isValidCatalogMusicBlob(blob: Blob): boolean {
  return blob.type === 'audio/mpeg' && blob.size > 0 && blob.size <= MAX_CATALOG_MUSIC_BYTES;
}
