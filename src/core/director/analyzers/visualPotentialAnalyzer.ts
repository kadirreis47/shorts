import { throwIfDirectorAborted } from '../analyzerUtils';
import { dimensionScore, recommendation } from '../scoring';
import type { DirectorAnalyzer, DirectorRecommendation } from '../types';

export function createVisualPotentialAnalyzer(): DirectorAnalyzer {
  return {
    id: 'visual-potential-heuristic-v1',
    async analyze(input, context) {
      throwIfDirectorAborted(context.signal);
      const recommendations: DirectorRecommendation[] = [];
      const sceneResults = input.scenes.map((scene, index) => {
        const visualReasons: string[] = [];
        const motionReasons: string[] = [];
        const uniqueAssets = new Set(scene.assetTypes);
        let visual = 32 + Math.min(28, uniqueAssets.size * 14);
        if (scene.visualPrompt.trim().length >= 16) { visual += 14; visualReasons.push('Görsel prompt yeterince açıklayıcı.'); }
        if (scene.assetTypes.includes('video') || scene.assetTypes.includes('broll')) {
          visual += 16; visualReasons.push('Video veya B-roll asset mevcut.');
        }
        if (scene.assetTypes.length === 0) visualReasons.push('Sahneye bağlı görsel asset bulunmuyor.');
        if (index > 0 && scene.visualPrompt === input.scenes[index - 1].visualPrompt) {
          visual -= 20; visualReasons.push('Önceki sahneyle aynı görsel prompt tekrarlanıyor.');
        }

        let motion = 28;
        if (scene.cameraMotion !== 'none') { motion += 42; motionReasons.push(`Kamera hareketi: ${scene.cameraMotion}.`); }
        if (scene.transition !== 'cut') { motion += 14; motionReasons.push(`Geçiş: ${scene.transition}.`); }
        motion += scene.intensity * 12;

        if (visual < 60) {
          recommendations.push(recommendation({
            sceneId: scene.id, category: 'visual', priority: visual < 40 ? 'high' : 'medium',
            title: 'Görsel anlatımı zenginleştir',
            description: 'Sahnenin görsel çeşitliliği veya asset desteği sınırlı.',
            expectedImpact: 'Görsel tekrar hissini azaltabilir.',
            suggestedAction: 'Metni destekleyen farklı bir video veya B-roll asset ekle.',
            sourceAnalyzer: this.id, confidence: 84,
          }));
        }
        if (motion < 55) {
          recommendations.push(recommendation({
            sceneId: scene.id, category: 'motion', priority: 'medium',
            title: 'Sahne hareketini artır',
            description: 'Sahne statik görsel davranış gösteriyor.',
            expectedImpact: 'Görsel enerjiyi artırabilir.',
            suggestedAction: 'Hafif zoom, pan veya uygun bir transition kullan.',
            sourceAnalyzer: this.id, confidence: 80,
          }));
        }
        return {
          sceneId: scene.id,
          dimensions: [
            dimensionScore('visualPotential', visual, 86, visualReasons),
            dimensionScore('motion', motion, 88, motionReasons),
          ],
          evidence: [...visualReasons, ...motionReasons],
        };
      });
      return { analyzerId: this.id, sceneResults, recommendations };
    },
  };
}
