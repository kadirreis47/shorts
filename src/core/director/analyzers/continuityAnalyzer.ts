import { average } from '../analyzerUtils';
import { tokenOverlap } from '../textAnalysis';
import { dimensionScore, normalizeScore, recommendation } from '../scoring';
import type { DirectorAnalyzer, DirectorContinuityAnalysis, DirectorInput, DirectorRecommendation } from '../types';

const ROLE_ORDER = ['hook', 'setup', 'development', 'payoff', 'cta', 'outro'] as const;

export function analyzeContinuity(input: DirectorInput): DirectorContinuityAnalysis {
  const discontinuities = new Set<string>();
  const evidence: string[] = [];
  const recommendations: DirectorRecommendation[] = [];
  const pairScores: number[] = [];
  let narrative = 90, visual = 90, transitions = 90;
  input.scenes.forEach((scene, index) => {
    const previous = input.scenes[index - 1];
    if (!previous) return;
    let pair = 90;
    if (Math.abs(scene.intensity - previous.intensity) > 0.65) { pair -= 25; evidence.push(`Ani intensity geçişi: ${scene.id}.`); }
    if (scene.cameraMotion === previous.cameraMotion) { visual -= 7; evidence.push(`Tekrarlanan kamera hareketi: ${scene.id}.`); }
    if (scene.transition === previous.transition) transitions -= 6;
    const repeatsAsset = scene.assetIds?.some((id) => previous.assetIds?.includes(id)) === true;
    if (repeatsAsset || (scene.assetTypes.some((type) => previous.assetTypes.includes(type)) && scene.visualPrompt === previous.visualPrompt)) visual -= 18;
    const overlap = tokenOverlap(previous.text, scene.text);
    if (overlap < 0.05 && previous.role !== 'hook') { narrative -= 12; pair -= 15; evidence.push(`Düşük konu örtüşmesi: ${scene.id}.`); }
    if (overlap > 0.8) { narrative -= 14; evidence.push(`Metin tekrarı: ${scene.id}.`); }
    if (ROLE_ORDER.indexOf(scene.role) < ROLE_ORDER.indexOf(previous.role) && scene.role !== 'development') { narrative -= 20; pair -= 20; }
    if (Math.abs(scene.durationMs - previous.durationMs) > 6_000) pair -= 12;
    if (pair <= 65) discontinuities.add(scene.id);
    pairScores.push(pair);
  });
  for (const sceneId of discontinuities) recommendations.push(recommendation({ sceneId, category: 'continuity', priority: 'high',
    title: 'Sahne geçişini yeniden bağla', description: 'Anlatı, görsel veya tempo geçişinde kopukluk tespit edildi.',
    expectedImpact: 'Video akışını daha tutarlı hale getirebilir.', suggestedAction: 'Bağlayıcı cümle, farklı transition veya ara B-roll kullan.',
    sourceAnalyzer: 'continuity-heuristic-v1', confidence: 84 }));
  return { continuityScore: normalizeScore(average(pairScores, 82)), narrativeFlowScore: normalizeScore(narrative),
    visualContinuityScore: normalizeScore(visual), transitionQualityScore: normalizeScore(transitions),
    discontinuitySceneIds: [...discontinuities], evidence, recommendations };
}

export function createContinuityAnalyzer(): DirectorAnalyzer {
  return { id: 'continuity-heuristic-v1', async analyze(input) {
    const result = analyzeContinuity(input);
    return { analyzerId: this.id, sceneResults: input.scenes.map((scene) => ({ sceneId: scene.id,
      dimensions: [dimensionScore('continuity', result.discontinuitySceneIds.includes(scene.id) ? result.continuityScore - 18 : result.continuityScore, 82, result.evidence)],
      evidence: result.evidence.filter((line) => line.includes(scene.id)) })), recommendations: result.recommendations };
  } };
}
