import { describe, expect, it } from 'vitest';
import {
  InvalidSourceSrtError,
  parseCanonicalSrtForTranslation,
  reconstructTranslatedSrt,
  validateTranslatedCueTexts,
} from '../../supabase/functions/_shared/subtitle-translation';

const canonicalAlignedSrt = [
  '1', '00:00:00,000 --> 00:00:00,900', 'İstanbul güzel.', '',
  '2', '00:00:02,043 --> 00:00:02,345', 'Harika\nworld! 🚀', '',
].join('\n');

describe('subtitle translation canonical cue contract', () => {
  it('reconstructs complete translated cues with the exact canonical indexes, timing and order', () => {
    const cues = parseCanonicalSrtForTranslation(canonicalAlignedSrt);
    const result = validateTranslatedCueTexts(['Istanbul is beautiful.', 'Wonderful\nworld! 🚀'], cues);

    expect(result).toEqual({ ok: true, translations: ['Istanbul is beautiful.', 'Wonderful\nworld! 🚀'] });
    expect(reconstructTranslatedSrt(cues, result.ok ? result.translations : [])).toBe([
      '1', '00:00:00,000 --> 00:00:00,900', 'Istanbul is beautiful.', '',
      '2', '00:00:02,043 --> 00:00:02,345', 'Wonderful', 'world! 🚀', '',
    ].join('\n'));
  });

  it('rejects malformed source SRT before provider work', () => {
    expect(() => parseCanonicalSrtForTranslation('1\n00:00:02,345 --> 00:00:02,043\nBackwards\n')).toThrow(InvalidSourceSrtError);
    expect(() => parseCanonicalSrtForTranslation('2\n00:00:00,000 --> 00:00:00,100\nSkipped index\n')).toThrow(InvalidSourceSrtError);
    expect(() => parseCanonicalSrtForTranslation('1\ninvalid\nNo timing\n')).toThrow(InvalidSourceSrtError);
  });

  it('rejects malformed, incomplete, and oversized provider arrays without source-text fallback', () => {
    const cues = parseCanonicalSrtForTranslation(canonicalAlignedSrt);
    expect(validateTranslatedCueTexts({ translations: ['no'] }, cues)).toEqual({ ok: false, reason: 'malformed-provider-response' });
    expect(validateTranslatedCueTexts(['one'], cues)).toEqual({ ok: false, reason: 'incomplete-translation' });
    expect(validateTranslatedCueTexts(['one', '   '], cues)).toEqual({ ok: false, reason: 'incomplete-translation' });
    expect(validateTranslatedCueTexts(['one', 2], cues)).toEqual({ ok: false, reason: 'incomplete-translation' });
    expect(validateTranslatedCueTexts(['one', 'x'.repeat(4_001)], cues)).toEqual({ ok: false, reason: 'incomplete-translation' });
  });

  it('treats only a fully unchanged cue sequence as unavailable while allowing unchanged proper nouns', () => {
    const cues = parseCanonicalSrtForTranslation(canonicalAlignedSrt);
    expect(validateTranslatedCueTexts(['İstanbul güzel.', 'Harika\nworld! 🚀'], cues)).toEqual({ ok: false, reason: 'unchanged-result' });
    expect(validateTranslatedCueTexts(['Istanbul is beautiful.', 'Harika\nworld! 🚀'], cues)).toEqual({
      ok: true,
      translations: ['Istanbul is beautiful.', 'Harika\nworld! 🚀'],
    });
  });
});
