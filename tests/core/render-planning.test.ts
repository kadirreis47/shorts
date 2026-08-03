import { describe, expect, it } from 'vitest';
import { buildRenderCapacityPlan } from '@/core/render/renderCapacityPlanner';
import { buildRenderTuningReport } from '@/core/render/renderAutoTuner';
import type { RenderPerformanceSnapshot } from '@/core/render/renderMetrics';
import { DEFAULT_RENDER_ALERT_THRESHOLDS } from '@/core/render/renderAlertBaselines';

const snapshot = (overrides: Partial<RenderPerformanceSnapshot> = {}): RenderPerformanceSnapshot => ({
  totalJobs: 10, completedJobs: 10, failedJobs: 0, cancelledJobs: 0,
  cacheHits: 0, retryCount: 0, successRate: 100, averageQueueWaitMs: 0,
  averageRenderMs: 60_000, maximumRenderMs: 60_000, totalOutputBytes: 1_000,
  averageOutputBytes: 100, stageMetrics: [], updatedAt: new Date(0).toISOString(),
  ...overrides,
});

describe('render capacity ve auto-tuner', () => {
  it('ölçüm yokken video süresinden muhafazakâr fallback üretir', () => {
    const plan = buildRenderCapacityPlan({ snapshot: null, concurrency: 1, jobsPerDay: 10, averageVideoDurationSeconds: 60, targetCompletionHours: 4 });
    expect(plan.baselineRenderMs).toBe(75_000);
    expect(plan.confidence).toBe(35);
  });

  it('yüksek iş yükünde concurrency artırır ve kapasite riskini sınıflandırır', () => {
    const plan = buildRenderCapacityPlan({ snapshot: snapshot(), concurrency: 1, jobsPerDay: 400, averageVideoDurationSeconds: 60, targetCompletionHours: 4 });
    expect(plan.current.queueRisk).toBe('high');
    expect(plan.recommendedConcurrency).toBeGreaterThan(1);
  });

  it('uzun kuyrukta concurrency artırır, retry baskısında güvenli seviyeye düşürür', () => {
    const fast = buildRenderTuningReport({ snapshot: snapshot({ averageQueueWaitMs: 10_000 }), baseline: null, thresholds: DEFAULT_RENDER_ALERT_THRESHOLDS });
    expect(fast.recommendedConcurrency).toBe(2);
    const pressured = buildRenderTuningReport({ snapshot: snapshot({ retryCount: 4, successRate: 80 }), baseline: null, thresholds: DEFAULT_RENDER_ALERT_THRESHOLDS });
    expect(pressured.recommendedConcurrency).toBe(1);
    expect(pressured.recommendations.some((item) => item.id === 'reduce-concurrency')).toBe(true);
  });
});
