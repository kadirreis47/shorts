import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const UI_FILES = [
  'src/views/AIAudioStudio.tsx',
  'src/components/audio-production/AudioOperationList.tsx',
  'src/components/audio-production/AudioPlanSummary.tsx',
] as const;
const MOJIBAKE = /\u00C2|\u00C3|\u00C4|\u00C5|\u00E2\u20AC|\u00EF\u00BF\u00BD|\uFFFD/u;

describe('AI Audio Studio UTF-8 copy', () => {
  it('decodes every Epic 7.3 user-facing source with a lossless UTF-8 round trip', () => {
    for (const file of UI_FILES) {
      const bytes = readFileSync(resolve(file));
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      expect(Buffer.from(text, 'utf8')).toEqual(bytes);
      expect(text).not.toMatch(MOJIBAKE);
    }
  });

  it('uses the intended separator and range punctuation code points', () => {
    const studio = decode('src/views/AIAudioStudio.tsx');
    const operations = decode('src/components/audio-production/AudioOperationList.tsx');
    expect(studio).toContain(' · revision ');
    expect(studio).toContain('–{item.endMs}');
    expect(studio).toContain("join('–')");
    expect(operations).toContain('{item.reason} · confidence');
    expect('·'.codePointAt(0)).toBe(0x00b7);
    expect('–'.codePointAt(0)).toBe(0x2013);
  });

  it('preserves Turkish operation descriptions through JSON export', () => {
    const operation = { reason: 'Çözüm güçlü; ışık, görüş ve özgürlük değişir.' };
    const json = JSON.stringify({ operations: [operation] });
    expect(json).not.toMatch(MOJIBAKE);
    expect(JSON.parse(json).operations[0].reason).toBe(operation.reason);
    expect([...operation.reason]).toEqual(expect.arrayContaining(['Ç', 'ç', 'ğ', 'ı', 'ö', 'ş', 'ü']));
  });
});

function decode(file: string): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(resolve(file)));
}
