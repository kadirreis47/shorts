import type {
  RenderAdaptiveBaseline,
  RenderAlertThresholds,
} from './renderAlertBaselines';
import type { RenderPerformanceSnapshot } from './renderMetrics';

export type RenderTuningPriority =
  | 'throughput'
  | 'stability'
  | 'latency'
  | 'cache';

export interface RenderTuningRecommendation {
  id: string;
  priority: RenderTuningPriority;
  title: string;
  description: string;
  confidence: number;
  impact: 'low' | 'medium' | 'high';
  suggestedThresholds?: Partial<RenderAlertThresholds>;
  suggestedConcurrency?: number;
  suggestedCacheEnabled?: boolean;
}

export interface RenderTuningReport {
  generatedAt: string;
  recommendations: RenderTuningRecommendation[];
  recommendedConcurrency: number;
  recommendedCacheEnabled: boolean;
  confidence: number;
}

export function buildRenderTuningReport(input: {
  snapshot: RenderPerformanceSnapshot | null;
  baseline: RenderAdaptiveBaseline | null;
  thresholds: RenderAlertThresholds;
}): RenderTuningReport {
  const { snapshot, baseline, thresholds } = input;
  const recommendations: RenderTuningRecommendation[] = [];

  if (!snapshot || snapshot.totalJobs === 0) {
    return {
      generatedAt: new Date().toISOString(),
      recommendations: [
        {
          id: 'collect-more-data',
          priority: 'stability',
          title: 'Daha fazla render verisi topla',
          description:
            'Otomatik ayar önerileri için en az birkaç tamamlanmış render işi gerekli.',
          confidence: 20,
          impact: 'low',
        },
      ],
      recommendedConcurrency: 1,
      recommendedCacheEnabled: true,
      confidence: 20,
    };
  }

  let recommendedConcurrency = 1;
  const recommendedCacheEnabled = true;

  if (
    snapshot.successRate >= 95 &&
    snapshot.averageQueueWaitMs > 8_000 &&
    snapshot.retryCount <= 1
  ) {
    recommendedConcurrency = 2;
    recommendations.push({
      id: 'increase-concurrency',
      priority: 'throughput',
      title: 'Render eşzamanlılığını artır',
      description:
        'Başarı oranı yüksek ve kuyruk beklemesi uzun. İki paralel iş toplam üretim kapasitesini artırabilir.',
      confidence: 82,
      impact: 'high',
      suggestedConcurrency: 2,
    });
  }

  if (
    snapshot.retryCount >= 3 ||
    snapshot.successRate < 85
  ) {
    recommendedConcurrency = 1;
    recommendations.push({
      id: 'reduce-concurrency',
      priority: 'stability',
      title: 'Eşzamanlılığı güvenli seviyeye düşür',
      description:
        'Retry baskısı veya düşük başarı oranı kaynak çakışmasına işaret ediyor.',
      confidence: 88,
      impact: 'high',
      suggestedConcurrency: 1,
    });
  }

  if (snapshot.totalJobs >= 5 && snapshot.cacheHits === 0) {
    recommendations.push({
      id: 'inspect-cache',
      priority: 'cache',
      title: 'Render cache fingerprint akışını kontrol et',
      description:
        'Birden fazla iş çalışmasına rağmen cache hit oluşmadı. Tekrarlanan projelerde fingerprint veya çıktı doğrulaması incelenmeli.',
      confidence: 75,
      impact: 'medium',
      suggestedCacheEnabled: true,
    });
  }

  if (
    baseline &&
    baseline.averageQueueWaitMs > 0 &&
    snapshot.averageQueueWaitMs >
      baseline.averageQueueWaitMs + Math.max(5_000, baseline.queueDeviationMs * 2)
  ) {
    recommendations.push({
      id: 'queue-anomaly-tuning',
      priority: 'latency',
      title: 'Kuyruk eşiğini güncel performansa göre ayarla',
      description:
        'Kuyruk gecikmesi öğrenilmiş normal aralığın belirgin şekilde üzerinde.',
      confidence: 80,
      impact: 'medium',
      suggestedThresholds: {
        degradedQueueWaitMs: Math.max(
          5_000,
          Math.round(
            baseline.averageQueueWaitMs +
              Math.max(3_000, baseline.queueDeviationMs),
          ),
        ),
        criticalQueueWaitMs: Math.max(
          10_000,
          Math.round(
            baseline.averageQueueWaitMs +
              Math.max(8_000, baseline.queueDeviationMs * 2),
          ),
        ),
      },
    });
  }

  if (
    baseline &&
    baseline.averageSuccessRate >= 95 &&
    thresholds.degradedSuccessRate < 92
  ) {
    recommendations.push({
      id: 'tighten-success-threshold',
      priority: 'stability',
      title: 'Başarı eşiğini sıkılaştır',
      description:
        'Sistem uzun süredir yüksek başarı oranıyla çalışıyor. Daha erken uyarı için degraded eşiği yükseltilebilir.',
      confidence: 72,
      impact: 'low',
      suggestedThresholds: {
        degradedSuccessRate: 93,
        criticalSuccessRate: 80,
      },
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      id: 'configuration-healthy',
      priority: 'stability',
      title: 'Mevcut ayarlar dengeli',
      description:
        'Toplanan metrikler belirgin bir darboğaz veya güvenilirlik sorunu göstermiyor.',
      confidence: 90,
      impact: 'low',
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    recommendations,
    recommendedConcurrency,
    recommendedCacheEnabled,
    confidence: Math.round(
      recommendations.reduce(
        (total, recommendation) => total + recommendation.confidence,
        0,
      ) / recommendations.length,
    ),
  };
}
