import { normalizeScore } from './scoring';
import type { DirectorEmotionAnalysis, DirectorHookIntelligence, DirectorInput, DirectorSceneScore, RetentionRiskSegment } from './types';

export function buildHeuristicRetentionRiskMap(input: DirectorInput, scores: readonly DirectorSceneScore[], hook: DirectorHookIntelligence,
  emotions: readonly DirectorEmotionAnalysis[]): RetentionRiskSegment[] {
  const raw = input.scenes.map((scene, index) => {
    const score = scores.find((item) => item.sceneId === scene.id);
    const causes: string[] = [];
    let risk = 100 - (score?.dimensions.retention.score ?? 50);
    if (index === 0 && hook.overallHookScore < 50) { risk += 25; causes.push('weak-hook'); }
    if (scene.durationMs > 7_000) { risk += 22; causes.push('long-scene'); }
    if (scene.cameraMotion === 'none') { risk += 14; causes.push('low-motion'); }
    if (scene.intensity < 0.3) { risk += 12; causes.push('low-intensity'); }
    if ((score?.dimensions.clarity.score ?? 100) < 45) { risk += 15; causes.push('text-density'); }
    if (index > 0 && emotions[index]?.primaryEmotion === emotions[index - 1]?.primaryEmotion) { risk += 6; causes.push('emotion-monotony'); }
    if (index > 0 && scores[index - 1]?.overall < 50 && (score?.overall ?? 100) < 50) { risk += 16; causes.push('consecutive-weak-scenes'); }
    if (scene.role === 'cta' && index < input.scenes.length * 0.6) { risk += 15; causes.push('early-cta'); }
    const riskScore = normalizeScore(risk);
    return { startMs: scene.startMs, endMs: scene.endMs, sceneIds: [scene.id], riskScore,
      riskLevel: level(riskScore), causes, evidence: causes.map((cause) => `${scene.id}: ${cause}`),
      recommendedInterventions: interventions(causes) } satisfies RetentionRiskSegment;
  });
  return raw.reduce<RetentionRiskSegment[]>((segments, current) => {
    const previous = segments.at(-1);
    if (previous && shouldMergeRisk(previous.riskLevel, current.riskLevel)) {
      segments[segments.length - 1] = { ...previous, endMs: current.endMs, sceneIds: [...previous.sceneIds, ...current.sceneIds],
        riskScore: normalizeScore((previous.riskScore + current.riskScore) / 2), causes: [...new Set([...previous.causes, ...current.causes])],
        evidence: [...previous.evidence, ...current.evidence], recommendedInterventions: [...new Set([...previous.recommendedInterventions, ...current.recommendedInterventions])] };
    } else segments.push(current);
    return segments;
  }, []);
}
function shouldMergeRisk(left: string, right: string): boolean {
  if (left === right) return left !== 'low';
  return ['high', 'critical'].includes(left) && ['high', 'critical'].includes(right);
}
function level(score: number): 'low' | 'medium' | 'high' | 'critical' { return score >= 80 ? 'critical' : score >= 60 ? 'high' : score >= 35 ? 'medium' : 'low'; }
function interventions(causes: readonly string[]): string[] {
  const result = new Set<string>();
  if (causes.includes('weak-hook')) result.add('Hook metnini yeniden yaz.');
  if (causes.includes('long-scene')) result.add('Sahneyi kısalt veya böl.');
  if (causes.includes('low-motion')) result.add('B-roll veya kamera hareketi ekle.');
  if (causes.includes('text-density')) result.add('Metni sadeleştir.');
  return [...result];
}
