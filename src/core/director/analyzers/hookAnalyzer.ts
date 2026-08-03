import { dimensionScore, recommendation } from '../scoring';
import { throwIfDirectorAborted } from '../analyzerUtils';
import type { DirectorAnalyzer } from '../types';
import { includesPhrase } from '../textAnalysis';

const CURIOSITY_PHRASES = ['sır', 'neden', 'nasıl', 'şaşırt', 'inanılmaz', 'kimse', 'asla', 'gerçek', 'secret', 'why', 'how', 'surprising', 'nobody', 'never'];
const CLAIM_PHRASES = ['en iyi', 'en kötü', 'kanıt', 'gerçek', 'mutlaka', 'best', 'worst', 'proven', 'must'];

export function createHookAnalyzer(): DirectorAnalyzer {
  return {
    id: 'hook-heuristic-v1',
    async analyze(input, context) {
      throwIfDirectorAborted(context.signal);
      const hook = input.scenes.find((scene) => scene.role === 'hook') ?? input.scenes[0];
      if (!hook) return { analyzerId: this.id, sceneResults: [], recommendations: [] };

      const reasons: string[] = [];
      const wordCount = hook.text.trim().split(/\s+/).filter(Boolean).length;
      let score = 35;
      if (wordCount >= 4 && wordCount <= 18) { score += 16; reasons.push('Hook metni kısa ve hızlı tüketilebilir.'); }
      else if (wordCount > 28) { score -= 12; reasons.push('Hook metni ilk saniyeler için uzun.'); }
      if (/[?!]/u.test(hook.text) || includesPhrase(hook.text, CLAIM_PHRASES)) { score += 15; reasons.push('Soru veya güçlü iddia kullanılıyor.'); }
      if (includesPhrase(hook.text, CURIOSITY_PHRASES)) { score += 18; reasons.push('Merak boşluğu oluşturan ifade mevcut.'); }
      score += hook.intensity * 12;
      if (hook.cameraMotion !== 'none') { score += 8; reasons.push('İlk sahnede kamera hareketi var.'); }
      if (hook.firstVisualChangeMs !== null && hook.firstVisualChangeMs <= 1_500) {
        score += 6; reasons.push('İlk görsel değişim erken gerçekleşiyor.');
      }
      if (hook.durationMs > 3_500) { score -= 8; reasons.push('Hook sahnesi üç saniyeyi aşıyor.'); }

      const recommendations = [];
      if (score < 70) {
        recommendations.push(recommendation({
          sceneId: hook.id, category: 'hook', priority: score < 45 ? 'critical' : 'high',
          title: 'Hook açılışını güçlendir',
          description: 'İlk saniyelerde daha açık bir iddia, soru veya merak boşluğu gerekiyor.',
          expectedImpact: 'İlk üç saniyedeki izleyici kaybını azaltabilir.',
          suggestedAction: 'Hook metnini 4–18 kelimelik soru veya güçlü iddia olarak yeniden yaz.',
          sourceAnalyzer: this.id, confidence: 88,
        }));
      }
      if (hook.cameraMotion === 'none') {
        recommendations.push(recommendation({
          sceneId: hook.id, category: 'motion', priority: 'medium',
          title: 'Hook sahnesine hareket ekle',
          description: 'Statik açılış görsel ivmeyi sınırlar.',
          expectedImpact: 'Açılışın görsel dikkat çekiciliğini artırabilir.',
          suggestedAction: 'İlk 1.5 saniyede zoom, pan veya görsel değişim kullan.',
          sourceAnalyzer: this.id, confidence: 76,
        }));
      }

      return {
        analyzerId: this.id,
        sceneResults: [{
          sceneId: hook.id,
          dimensions: [dimensionScore('hook', score, 90, reasons)],
          evidence: reasons,
        }],
        recommendations,
      };
    },
  };
}
