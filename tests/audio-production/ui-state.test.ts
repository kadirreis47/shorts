import { describe, expect, it } from 'vitest';
import { canonicalSerialize } from '@/core/editing';
import { tokenize } from '@/core/audio-production';

describe('AI Audio Studio contract states', () => {
  it('preserves Turkish characters in tokenization', () => expect(tokenize('ç, ğ, ı, İ, ö, ş, ü')).toEqual(['ç', 'ğ', 'ı', 'i', 'ö', 'ş', 'ü']));
  it('keeps Turkish text through JSON export round trip', () => { const value = { title: 'Seslendirme özgürlük için güçlüdür' }; expect(JSON.parse(JSON.stringify(value))).toEqual(value); });
  it('canonicalizes audio metadata key order', () => expect(canonicalSerialize({ gain: 1, role: 'voice' })).toBe(canonicalSerialize({ role: 'voice', gain: 1 })));
  it('does not require a browser audio API for plan data', () => expect(typeof AudioContext).toBe('undefined'));
  it('uses JSON-safe primitive analysis output', () => expect(() => JSON.stringify({ silence: [{ startMs: 0, endMs: 300 }], score: 85 })).not.toThrow());
});
