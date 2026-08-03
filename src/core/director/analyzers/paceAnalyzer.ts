import { average, throwIfDirectorAborted, variation } from '../analyzerUtils';
import { dimensionScore, recommendation } from '../scoring';
import type { DirectorAnalyzer, DirectorRecommendation } from '../types';

export function createPaceAnalyzer(): DirectorAnalyzer {
  return {
    id: 'pace-heuristic-v1',
    async analyze(input, context) {
      throwIfDirectorAborted(context.signal);
      const durations = input.scenes.map((scene) => scene.durationMs);
      const averageDuration = average(durations, 0);
      const durationVariation = variation(durations);
      const recommendations: DirectorRecommendation[] = [];

      const sceneResults = input.scenes.map((scene, index) => {
        const reasons: string[] = [`Sahne süresi ${Math.round(scene.durationMs)} ms.`];
        let score = 84;
        if (scene.durationMs > 7_000) { score -= 38; reasons.push('Sahne belirgin biçimde uzun.'); }
        else if (scene.durationMs > 5_000) { score -= 22; reasons.push('Sahne hedef tempodan uzun.'); }
        else if (scene.durationMs < 900) { score -= 12; reasons.push('Sahne anlaşılabilirlik için fazla kısa olabilir.'); }

        const previous = input.scenes[index - 1];
        const previousPrevious = input.scenes[index - 2];
        if (previous && previousPrevious &&
          Math.abs(scene.durationMs - previous.durationMs) < 250 &&
          Math.abs(previous.durationMs - previousPrevious.durationMs) < 250) {
          score -= 14; reasons.push('Üç ardışık sahne aynı tempoda ilerliyor.');
        }
        if (durationVariation < 500 && input.scenes.length >= 3) {
          score -= 8; reasons.push('Video genelinde tempo varyasyonu düşük.');
        }

        if (scene.durationMs > 5_000) {
          recommendations.push(recommendation({
            sceneId: scene.id, category: 'pacing', priority: scene.durationMs > 8_000 ? 'high' : 'medium',
            title: 'Uzun sahneyi kısalt veya böl',
            description: `Sahne ${Math.round(scene.durationMs / 100) / 10} saniye sürüyor; ortalama ${Math.round(averageDuration / 100) / 10} saniye.`,
            expectedImpact: 'Kurgu ritmini ve bilgi yoğunluğunu iyileştirebilir.',
            suggestedAction: scene.durationMs > 8_000 ? 'Sahneyi iki kısa sahneye böl.' : 'Sahneyi yüzde 20–30 kısalt.',
            sourceAnalyzer: this.id, confidence: 91,
          }));
        }
        return {
          sceneId: scene.id,
          dimensions: [dimensionScore('pacing', score, 92, reasons)],
          evidence: reasons,
        };
      });

      return { analyzerId: this.id, sceneResults, recommendations };
    },
  };
}
