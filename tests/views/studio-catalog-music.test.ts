import { describe, expect, it } from 'vitest';
import { isApprovedCatalogMusicUrl, isValidCatalogMusicResponse, MUSIC_TRACKS } from '@/lib/catalogMusic';

describe('Studio fixed music catalog URL guard', () => {
  it('accepts only the four fixed direct HTTPS Pixabay download URLs', () => {
    expect(MUSIC_TRACKS).toHaveLength(4);
    for (const track of MUSIC_TRACKS) expect(isApprovedCatalogMusicUrl(track.url)).toBe(true);
    expect(isApprovedCatalogMusicUrl('https://cdn.pixabay.com/audio/2024/02/05/audio_3311b036f5.mp3')).toBe(false);
    expect(isApprovedCatalogMusicUrl('https://example.test/audio.mp3')).toBe(false);
    expect(isApprovedCatalogMusicUrl(`${MUSIC_TRACKS[0].url}?token=x`)).toBe(false);
    expect(isApprovedCatalogMusicUrl(MUSIC_TRACKS[0].url.replace('https:', 'http:'))).toBe(false);
    expect(isApprovedCatalogMusicUrl('https://cdn.pixabay.com/redirect/audio.mp3')).toBe(false);
  });

  it('rejects the packaged failure response at the catalog boundary and accepts a bounded successful response', () => {
    const track = MUSIC_TRACKS[1];
    expect(isValidCatalogMusicResponse(track.url, 403, 'audio/mpeg', '5206099')).toBe(false);
    expect(isValidCatalogMusicResponse(track.url, 200, 'audio/mpeg; charset=binary', '5206099')).toBe(true);
    expect(isValidCatalogMusicResponse(track.url, 200, 'audio/mpeg', null)).toBe(false);
    expect(isValidCatalogMusicResponse(track.url, 200, 'text/html', '5206099')).toBe(false);
    expect(isValidCatalogMusicResponse(track.url, 200, 'audio/mpeg', String(25 * 1024 * 1024 + 1))).toBe(false);
  });
});
