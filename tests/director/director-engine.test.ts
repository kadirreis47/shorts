import { describe, expect, it } from 'vitest';
import {
  DIRECTOR_SCORE_DIMENSIONS,
  createDirectorEngine,
  deduplicateRecommendations,
  dimensionScore,
  recommendation,
} from '@/core/director';
import type { DirectorAnalyzer } from '@/core/director';
import { directorInput, directorScene } from './fixtures';

describe('DirectorEngine', () => {
  it('tüm skorları 0–100 aralığında ve JSON serialize edilebilir üretir', async () => {
    const report = await createDirectorEngine().analyze(directorInput());
    const scores = report.sceneScores.flatMap((scene) => [
      scene.overall,
      scene.confidence,
      ...DIRECTOR_SCORE_DIMENSIONS.map((dimension) => scene.dimensions[dimension].score),
    ]);
    expect(scores.every((score) => score >= 0 && score <= 100)).toBe(true);
    expect(() => JSON.stringify(report)).not.toThrow();
  });

  it('aynı input için tamamen aynı raporu üretir', async () => {
    const engine = createDirectorEngine();
    const input = directorInput();
    expect(await engine.analyze(input)).toEqual(await engine.analyze(input));
  });

  it('güçlü hook zayıf hooktan yüksek puan alır', async () => {
    const engine = createDirectorEngine();
    const strong = directorInput([directorScene('hook', 0)]);
    const weak = directorInput([directorScene('hook', 0, {
      text: 'Bugün bir konudan söz edeceğiz ve size bazı bilgiler vereceğiz çünkü bu konu herkes için oldukça önemlidir.',
      intensity: 0.15,
      cameraMotion: 'none',
      assetTypes: [],
      firstVisualChangeMs: null,
      durationMs: 5_000,
    })]);
    expect((await engine.analyze(strong)).hookScore).toBeGreaterThan((await engine.analyze(weak)).hookScore);
  });

  it('uzun sahneye pace cezası ve split/shorten önerisi verir', async () => {
    const input = directorInput([
      directorScene('hook', 0),
      directorScene('long', 1, { durationMs: 9_000, endMs: 11_500 }),
    ]);
    const report = await createDirectorEngine().analyze(input);
    const long = report.sceneScores.find((scene) => scene.sceneId === 'long');
    expect(long?.dimensions.pacing.score).toBeLessThan(50);
    expect(long?.recommendations.some((item) => /böl|kısalt/i.test(item.suggestedAction))).toBe(true);
  });

  it('motion ve video asset içeren sahneye visual avantaj verir', async () => {
    const report = await createDirectorEngine().analyze(directorInput([
      directorScene('moving', 0, { assetTypes: ['video', 'broll'], cameraMotion: 'zoom_in' }),
      directorScene('static', 1, { assetTypes: [], cameraMotion: 'none', transition: 'cut', visualPrompt: 'x' }),
    ]));
    const moving = report.sceneScores.find((scene) => scene.sceneId === 'moving');
    const staticScene = report.sceneScores.find((scene) => scene.sceneId === 'static');
    expect(moving?.dimensions.visualPotential.score).toBeGreaterThan(staticScene?.dimensions.visualPotential.score ?? 100);
    expect(moving?.dimensions.motion.score).toBeGreaterThan(staticScene?.dimensions.motion.score ?? 100);
  });

  it('düşük hook ve yavaş pace durumunda retention düşer', async () => {
    const healthy = await createDirectorEngine().analyze(directorInput());
    const risky = await createDirectorEngine().analyze(directorInput([
      directorScene('weak-hook', 0, { text: 'Merhaba.', durationMs: 8_000, intensity: 0.1, cameraMotion: 'none', assetTypes: [] }),
      directorScene('slow', 1, { durationMs: 9_000, intensity: 0.1, cameraMotion: 'none', assetTypes: [] }),
    ]));
    expect(risky.retentionScore).toBeLessThan(healthy.retentionScore);
  });

  it('aynı recommendation kimliğini deterministik olarak deduplicate eder', () => {
    const base = {
      sceneId: 'scene-1', category: 'pacing' as const, title: 'Pace', description: 'Pace',
      expectedImpact: 'Impact', suggestedAction: 'Sahneyi kısalt.', sourceAnalyzer: 'test', confidence: 70,
    };
    const low = recommendation({ ...base, priority: 'low' });
    const high = recommendation({ ...base, priority: 'high' });
    expect(low.id).toBe(high.id);
    expect(deduplicateRecommendations([low, high])).toEqual([high]);
  });

  it('analyzer hatasını diagnostic olarak raporlar ve analizi tamamlar', async () => {
    const failing: DirectorAnalyzer = {
      id: 'failing',
      analyze: async () => { throw new Error('controlled failure'); },
    };
    const report = await createDirectorEngine({ analyzers: [failing] }).analyze(directorInput());
    expect(report.analyzerDiagnostics).toEqual([
      expect.objectContaining({ analyzerId: 'failing', status: 'failed', message: 'controlled failure' }),
    ]);
    expect(report.sceneScores).toHaveLength(3);
  });

  it('custom weight davranışını weighted overall skora uygular', async () => {
    const analyzer: DirectorAnalyzer = {
      id: 'fixed',
      analyze: async (input) => ({
        analyzerId: 'fixed',
        recommendations: [],
        sceneResults: input.scenes.map((scene) => ({
          sceneId: scene.id,
          evidence: [],
          dimensions: [
            dimensionScore('hook', 100, 100, []),
            dimensionScore('clarity', 0, 100, []),
          ],
        })),
      }),
    };
    const input = directorInput([directorScene('one', 0)]);
    const hookWeighted = await createDirectorEngine({ analyzers: [analyzer], weights: {
      hook: 1, clarity: 0, emotion: 0, pacing: 0, visualPotential: 0, motion: 0, retention: 0, continuity: 0,
    } }).analyze(input);
    const clarityWeighted = await createDirectorEngine({ analyzers: [analyzer], weights: {
      hook: 0, clarity: 1, emotion: 0, pacing: 0, visualPotential: 0, motion: 0, retention: 0, continuity: 0,
    } }).analyze(input);
    expect(hookWeighted.overallScore).toBeGreaterThan(clarityWeighted.overallScore);
  });

  it('AbortSignal iptalini kontrollü şekilde yukarı taşır', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(createDirectorEngine().analyze(directorInput(), { signal: controller.signal }))
      .rejects.toMatchObject({ name: 'AbortError' });
  });
});
