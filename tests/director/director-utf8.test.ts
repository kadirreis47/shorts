import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDirectorEngine } from '@/core/director';
import { directorInput } from './fixtures';

const MOJIBAKE = /\u00C3|\u00C4|\u00C5|\u00E2\u20AC|\u00EF\u00BF\u00BD|\uFFFD/u;
const productionPaths = [
  'src/core/director', 'src/components/director', 'src/components/DirectorAnalysisAction.tsx',
  'src/views/AIDirector.tsx', 'src/services/directorApplicationService.ts',
  'src/services/directorAnalysisController.ts', 'src/services/directorMonitor.ts',
  'src/store/directorReportStore.ts', 'docs/AI_DIRECTOR_ENGINE.md', 'EPIC_7_1_NOTES.md',
];

describe('Director UTF-8 copy', () => {
  it('Epic production and documentation bytes decode as UTF-8 without mojibake', () => {
    const content = productionPaths.flatMap(readPath).join('\n');
    expect(content).not.toMatch(MOJIBAKE);
    for (const character of ['\u00E7', '\u011F', '\u0131', '\u0130', '\u00F6', '\u015F', '\u00FC']) expect(content).toContain(character);
  });

  it('AI Director source contains exact Turkish Unicode code points', () => {
    const source = decodeUtf8('src/views/AIDirector.tsx');
    const negative = extractBetween(source, 'ML/LLM tahmini ', '.</p>');
    const button = extractBetween(source, '/> Analizi ', '</Button>');
    expect(negative).toBe('de\u011Fildir');
    expect(button).toBe('Ba\u015Flat');
    expect(codePoints(negative)).toEqual([0x64, 0x65, 0x11f, 0x69, 0x6c, 0x64, 0x69, 0x72]);
    expect(codePoints(button)).toEqual([0x42, 0x61, 0x15f, 0x6c, 0x61, 0x74]);
  });

  it('recommendation ve executive summary çıktıları geçerli UTF-8 metin taşır', async () => {
    const report = await createDirectorEngine().analyze(directorInput());
    const copy = [report.executiveSummary,
      ...report.sceneScores.flatMap((scene) => scene.recommendations.flatMap((item) => [item.title, item.description, item.suggestedAction]))].join('\n');
    expect(copy).not.toMatch(MOJIBAKE);
  });

  it('JSON export round-trip işleminde Türkçe metni korur', async () => {
    const report = await createDirectorEngine().analyze(directorInput());
    const json = JSON.stringify(report);
    expect(json).not.toMatch(MOJIBAKE);
    expect(JSON.parse(json)).toMatchObject({ executiveSummary: report.executiveSummary });
  });
});

function readPath(relativePath: string): string[] {
  const path = resolve(relativePath);
  if (!statSync(path).isDirectory()) return [decodeUtf8(path)];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? readPath(`${relativePath}/${entry.name}`) : [decodeUtf8(resolve(path, entry.name))]);
}

function decodeUtf8(path: string): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(path));
}

function extractBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker) + startMarker.length;
  return source.slice(start, source.indexOf(endMarker, start));
}

function codePoints(value: string): number[] {
  return [...value].map((character) => character.codePointAt(0) ?? 0);
}
