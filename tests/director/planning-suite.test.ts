import { describe, expect, it } from 'vitest';
import { buildHeuristicRetentionRiskMap, createDirectorEngine, createEditDecisionPlan, rankDirectorScenes, resolveDecisionConflicts } from '@/core/director';
import type { EditDecisionPlanItem } from '@/core/director';
import { directorInput, directorScene } from './fixtures';

describe('Scene Ranking Engine', () => {
  it('aynı raporu stabil ve deterministik sıralar', async () => {
    const report = await createDirectorEngine().analyze(directorInput());
    expect(rankDirectorScenes(report.sceneScores)).toEqual(rankDirectorScenes(report.sceneScores));
  });
  it('eşit skorda scene order ile tie-break uygular', async () => {
    const report = await createDirectorEngine({ analyzers: [] }).analyze(directorInput([
      directorScene('z', 0, { role: 'development' }), directorScene('a', 1, { role: 'development' }),
    ]));
    const scores = report.sceneScores.map((item) => ({ ...item, overall: 50 }));
    expect(rankDirectorScenes(scores).scenes.map((item) => item.sceneId)).toEqual(['z', 'a']);
  });
  it('tier sınıflandırması ve percentile üretir', async () => {
    const report = await createDirectorEngine().analyze(directorInput());
    const ranking = rankDirectorScenes(report.sceneScores);
    expect(ranking.scenes.every((item) => ['elite', 'strong', 'average', 'weak', 'critical'].includes(item.rankTier))).toBe(true);
    expect(ranking.scenes[0].percentile).toBe(100);
  });
});

describe('Heuristic Retention Risk Map', () => {
  it('sağlıklı sahnede düşük veya orta risk üretir', async () => {
    const input = directorInput(); const report = await createDirectorEngine().analyze(input);
    expect(report.retentionRiskMap[0].riskScore).toBeLessThan(80);
  });
  it('zayıf uzun statik hook için kritik risk üretir', async () => {
    const input = directorInput([directorScene('bad', 0, { text: 'Merhaba.', durationMs: 10_000, endMs: 10_000, intensity: 0.05, cameraMotion: 'none', assetTypes: [], firstVisualChangeMs: null })]);
    const report = await createDirectorEngine().analyze(input);
    expect(report.retentionRiskMap[0].riskLevel).toBe('critical');
    expect(report.retentionRiskMap[0].causes).toContain('weak-hook');
  });
  it('ardışık aynı seviyedeki risk sahnelerini birleştirir', async () => {
    const input = directorInput([directorScene('a', 0, { durationMs: 9_000, cameraMotion: 'none', intensity: 0.1 }), directorScene('b', 1, { durationMs: 9_000, cameraMotion: 'none', intensity: 0.1 })]);
    const report = await createDirectorEngine().analyze(input);
    const map = buildHeuristicRetentionRiskMap(input, report.sceneScores, report.hookIntelligence, report.emotionalArc);
    expect(map.some((segment) => segment.sceneIds.length === 2)).toBe(true);
  });
});

describe('Edit Decision Planner', () => {
  it('düşük pace için split veya shorten üretir', async () => {
    const input = directorInput([directorScene('slow', 0, { durationMs: 10_000 })]); const report = await createDirectorEngine().analyze(input);
    const plan = createEditDecisionPlan(input, report.sceneScores, report.sceneRanking, report.hookIntelligence);
    expect(plan.decisions.some((item) => item.action === 'split' || item.action === 'shorten')).toBe(true);
  });
  it('düşük motion için increase-motion üretir', async () => {
    const input = directorInput([directorScene('still', 0, { cameraMotion: 'none', transition: 'cut', assetTypes: [] })]); const report = await createDirectorEngine().analyze(input);
    expect(report.editDecisionPlan.decisions.some((item) => item.action === 'increase-motion')).toBe(true);
  });
  it('duplicate decisionları kaldırır', () => {
    const item = decision('same', 'increase-motion');
    expect(resolveDecisionConflicts([item, item])).toHaveLength(1);
  });
  it('increase/reduce motion çakışmasını iki yönlü işaretler', () => {
    const result = resolveDecisionConflicts([decision('scene', 'increase-motion'), decision('scene', 'reduce-motion')]);
    expect(result.every((item) => item.conflicts.length === 1)).toBe(true);
  });
});

function decision(sceneId: string, action: EditDecisionPlanItem['action']): EditDecisionPlanItem {
  return { id: `${sceneId}-${action}`, sceneId, action, priority: 'medium', reason: 'test', evidence: [], expectedScoreImpact: 5,
    estimatedDurationDeltaMs: 0, dependencies: [], conflicts: [], confidence: 80, automaticallyApplicable: false };
}
