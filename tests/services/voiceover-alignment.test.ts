import { describe, expect, it } from 'vitest';
import { decodeBase64Audio, normalizeNarrationCharacterAlignment, parseElevenLabsOriginalAlignment } from '@/shared/voiceoverAlignment';

describe('ElevenLabs original timestamp response boundary', () => {
  const original = {
    characters: ['M', 'e', 'r', 'h', 'a', 'b', 'a'],
    character_start_times_seconds: [0, .1, .2, .3, .4, .5, .6],
    character_end_times_seconds: [.1, .2, .3, .4, .5, .6, .7],
  };

  it('accepts bounded original alignment and does not need normalized_alignment', () => {
    expect(parseElevenLabsOriginalAlignment({ alignment: original, normalized_alignment: { characters: ['x'] } }, 'Merhaba', 1_000)).toBeNull();
    expect(parseElevenLabsOriginalAlignment(original, 'Merhaba', 1_000)).toEqual({
      characters: original.characters,
      characterStartTimesMs: [0, 100, 200, 300, 400, 500, 600],
      characterEndTimesMs: [100, 200, 300, 400, 500, 600, 700],
    });
  });

  it('rejects mismatched, malformed and unsafe timing without invalidating audio', () => {
    expect(parseElevenLabsOriginalAlignment({ ...original, character_end_times_seconds: [.1] }, 'Merhaba', 1_000)).toBeNull();
    expect(parseElevenLabsOriginalAlignment({ ...original, character_start_times_seconds: [0, .1, .2, .3, .4, .5, -1] }, 'Merhaba', 1_000)).toBeNull();
    expect(parseElevenLabsOriginalAlignment({ ...original, character_start_times_seconds: [0, .1, .2, .3, .2, .5, .6] }, 'Merhaba', 1_000)).toBeNull();
    expect(parseElevenLabsOriginalAlignment(original, 'Hello', 1_000)).toBeNull();
    expect(normalizeNarrationCharacterAlignment({ characters: ['A'], characterStartTimesMs: [0], characterEndTimesMs: [4_000] }, 1_000)).toBeNull();
  });

  it('uses the explicit 1.5 second duration tolerance boundary', () => {
    expect(normalizeNarrationCharacterAlignment({ characters: ['A'], characterStartTimesMs: [0], characterEndTimesMs: [2_500] }, 1_000)).not.toBeNull();
    expect(normalizeNarrationCharacterAlignment({ characters: ['A'], characterStartTimesMs: [0], characterEndTimesMs: [2_501] }, 1_000)).toBeNull();
  });

  it('decodes only bounded canonical base64 payloads', () => {
    expect([...decodeBase64Audio('AQID') ?? []]).toEqual([1, 2, 3]);
    expect(decodeBase64Audio('not base64!')).toBeNull();
  });

  it('supports bounded provider character entries that are Unicode grapheme-like strings', () => {
    expect(normalizeNarrationCharacterAlignment({ characters: ['👩‍💻'], characterStartTimesMs: [0], characterEndTimesMs: [500] }, 1_000)).not.toBeNull();
  });
});
