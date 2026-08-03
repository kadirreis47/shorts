import { describe, expect, it } from 'vitest';
import { createDirectorEngine } from '@/core/director';
import { directorInput } from './fixtures';

describe('Director Report V2', () => {
  it('JSON serialize edilebilir V2 raporu üretir', async () => {
    const report = await createDirectorEngine().analyze(directorInput());
    expect(report.reportVersion).toBe('2.0'); expect(() => JSON.stringify(report)).not.toThrow();
  });
  it('aynı input için aynı V2 içeriği üretir', async () => {
    const engine = createDirectorEngine(); const input = directorInput();
    expect(await engine.analyze(input)).toEqual(await engine.analyze(input));
  });
  it('deterministic ve report version alanlarını taşır', async () => {
    const report = await createDirectorEngine().analyze(directorInput());
    expect(report.deterministicVersion).toBe('director-heuristic-1.0.0'); expect(report.reportVersion).toBe('2.0');
  });
  it('executive summary template tabanlı ve deterministiktir', async () => {
    const report = await createDirectorEngine().analyze(directorInput());
    expect(report.executiveSummary).toContain(`genel skor ${report.overallScore}`);
    expect(report.executiveSummary).toContain(`hook skoru ${report.hookIntelligence.overallHookScore}`);
  });
  it('ranking, risk map ve edit plan bölümlerini birlikte üretir', async () => {
    const report = await createDirectorEngine().analyze(directorInput());
    expect(report.sceneRanking.scenes).toHaveLength(report.sceneScores.length);
    expect(report.retentionRiskMap.length).toBeGreaterThan(0);
    expect(Array.isArray(report.editDecisionPlan.decisions)).toBe(true);
  });
});
