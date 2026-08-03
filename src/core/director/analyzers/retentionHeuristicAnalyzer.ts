import { contextScore, throwIfDirectorAborted } from '../analyzerUtils';
import { dimensionScore, recommendation } from '../scoring';
import type { DirectorAnalyzer, DirectorRecommendation } from '../types';

export function createRetentionHeuristicAnalyzer(): DirectorAnalyzer {
  return {
    id: 'retention-heuristic-v1',
    async analyze(input, context) {
      throwIfDirectorAborted(context.signal);
      const recommendations: DirectorRecommendation[] = [];
      const ctaIndex = input.scenes.findIndex((scene) => scene.role === 'cta');
      const seenTexts = new Set<string>();
      let lowRun = 0;
      const sceneResults = input.scenes.map((scene, index) => {
        const reasons: string[] = [];
        const hook = contextScore(context, scene.id, 'hook', index === 0 ? 45 : 60);
        const pace = contextScore(context, scene.id, 'pacing');
        const visual = contextScore(context, scene.id, 'visualPotential');
        let score = hook * (index === 0 ? 0.45 : 0.12) + pace * 0.38 + visual * 0.2 + scene.intensity * 15;
        const normalizedText = scene.text.trim().toLowerCase();
        if (seenTexts.has(normalizedText)) { score -= 18; reasons.push('Metin daha önceki bir sahneyi tekrar ediyor.'); }
        seenTexts.add(normalizedText);
        if (ctaIndex >= 0 && ctaIndex < input.scenes.length * 0.6 && index === ctaIndex) {
          score -= 12; reasons.push('CTA video akışında erken konumlanmış.');
        }
        if (pace < 45 && visual < 45) lowRun += 1; else lowRun = 0;
        if (lowRun >= 2) { score -= 14; reasons.push('Ardışık düşük tempo ve görsel enerji drop riski oluşturuyor.'); }
        if (index === 0 && hook < 50) reasons.push('Düşük hook skoru başlangıç retention riskini artırıyor.');

        if (score < 55) {
          recommendations.push(recommendation({
            sceneId: scene.id, category: 'retention', priority: score < 35 ? 'critical' : 'high',
            title: 'Drop-risk sahnesini güçlendir',
            description: 'Tempo, hook veya görsel enerji birleşimi izleyici kaybı riski gösteriyor.',
            expectedImpact: 'Heuristic retention riskini azaltabilir.',
            suggestedAction: 'Sahneyi kısalt ve yeni bilgi veya görsel değişim ekle.',
            sourceAnalyzer: this.id, confidence: 78,
          }));
        }
        return {
          sceneId: scene.id,
          dimensions: [dimensionScore('retention', score, 76, reasons)],
          evidence: reasons,
        };
      });
      return { analyzerId: this.id, sceneResults, recommendations };
    },
  };
}
