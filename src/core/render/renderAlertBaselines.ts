import type {
  RenderMetricsPoint,
  RenderOperationsAlert,
} from '@/store/renderAnalyticsStore';

export interface RenderAlertThresholds {
  minimumSampleCount: number;
  degradedSuccessRate: number;
  criticalSuccessRate: number;
  degradedQueueWaitMs: number;
  criticalQueueWaitMs: number;
  degradedRenderMs: number;
  retryWarningCount: number;
  retryCriticalCount: number;
  cacheInactivityJobCount: number;
}

export interface RenderAdaptiveBaseline {
  sampleCount: number;
  averageRenderMs: number;
  averageQueueWaitMs: number;
  averageSuccessRate: number;
  renderDeviationMs: number;
  queueDeviationMs: number;
  calculatedAt: string;
}

export const DEFAULT_RENDER_ALERT_THRESHOLDS: RenderAlertThresholds = {
  minimumSampleCount: 3,
  degradedSuccessRate: 90,
  criticalSuccessRate: 70,
  degradedQueueWaitMs: 10_000,
  criticalQueueWaitMs: 30_000,
  degradedRenderMs: 120_000,
  retryWarningCount: 3,
  retryCriticalCount: 8,
  cacheInactivityJobCount: 5,
};

export function calculateAdaptiveBaseline(
  history: RenderMetricsPoint[],
): RenderAdaptiveBaseline | null {
  const usable = history
    .filter((point) => point.totalJobs > 0)
    .slice(-40);

  if (usable.length < 3) return null;

  const averageRenderMs = mean(
    usable.map((point) => point.averageRenderMs),
  );
  const averageQueueWaitMs = mean(
    usable.map((point) => point.averageQueueWaitMs),
  );
  const averageSuccessRate = mean(
    usable.map((point) => point.successRate),
  );

  return {
    sampleCount: usable.length,
    averageRenderMs: Math.round(averageRenderMs),
    averageQueueWaitMs: Math.round(averageQueueWaitMs),
    averageSuccessRate:
      Math.round(averageSuccessRate * 100) / 100,
    renderDeviationMs: Math.round(
      standardDeviation(
        usable.map((point) => point.averageRenderMs),
        averageRenderMs,
      ),
    ),
    queueDeviationMs: Math.round(
      standardDeviation(
        usable.map((point) => point.averageQueueWaitMs),
        averageQueueWaitMs,
      ),
    ),
    calculatedAt: new Date().toISOString(),
  };
}

export function buildAdaptiveAlerts(input: {
  latest: RenderMetricsPoint;
  baseline: RenderAdaptiveBaseline | null;
  thresholds?: Partial<RenderAlertThresholds>;
}): RenderOperationsAlert[] {
  const thresholds = {
    ...DEFAULT_RENDER_ALERT_THRESHOLDS,
    ...(input.thresholds ?? {}),
  };
  const { latest, baseline } = input;
  const alerts: RenderOperationsAlert[] = [];

  if (
    latest.totalJobs >= thresholds.minimumSampleCount &&
    latest.successRate < thresholds.degradedSuccessRate
  ) {
    alerts.push(
      createAlert(
        latest.successRate < thresholds.criticalSuccessRate
          ? 'critical'
          : 'warning',
        'LOW_SUCCESS_RATE',
        `Render başarı oranı %${latest.successRate.toFixed(1)}.`,
        latest.capturedAt,
      ),
    );
  }

  if (latest.averageQueueWaitMs > thresholds.degradedQueueWaitMs) {
    alerts.push(
      createAlert(
        latest.averageQueueWaitMs > thresholds.criticalQueueWaitMs
          ? 'critical'
          : 'warning',
        'HIGH_QUEUE_WAIT',
        `Ortalama kuyruk bekleme süresi ${formatDuration(
          latest.averageQueueWaitMs,
        )}.`,
        latest.capturedAt,
      ),
    );
  }

  if (latest.averageRenderMs > thresholds.degradedRenderMs) {
    alerts.push(
      createAlert(
        'warning',
        'HIGH_RENDER_TIME',
        `Ortalama render süresi ${formatDuration(
          latest.averageRenderMs,
        )}.`,
        latest.capturedAt,
      ),
    );
  }

  if (latest.retryCount >= thresholds.retryWarningCount) {
    alerts.push(
      createAlert(
        latest.retryCount >= thresholds.retryCriticalCount
          ? 'critical'
          : 'warning',
        'RETRY_PRESSURE',
        `${latest.retryCount} kontrollü render tekrar denemesi oluştu.`,
        latest.capturedAt,
      ),
    );
  }

  if (
    latest.totalJobs >= thresholds.cacheInactivityJobCount &&
    latest.cacheHits === 0
  ) {
    alerts.push(
      createAlert(
        'info',
        'CACHE_INACTIVE',
        'Tekrar eden işlerde henüz render cache hit oluşmadı.',
        latest.capturedAt,
      ),
    );
  }

  if (baseline) {
    const renderAnomalyThreshold =
      baseline.averageRenderMs +
      Math.max(10_000, baseline.renderDeviationMs * 2);
    const queueAnomalyThreshold =
      baseline.averageQueueWaitMs +
      Math.max(5_000, baseline.queueDeviationMs * 2);

    if (
      baseline.sampleCount >= 5 &&
      latest.averageRenderMs > renderAnomalyThreshold
    ) {
      alerts.push(
        createAlert(
          'warning',
          'RENDER_ANOMALY',
          `Render süresi öğrenilmiş tabanın %${percentageIncrease(
            latest.averageRenderMs,
            baseline.averageRenderMs,
          )} üzerinde.`,
          latest.capturedAt,
        ),
      );
    }

    if (
      baseline.sampleCount >= 5 &&
      latest.averageQueueWaitMs > queueAnomalyThreshold
    ) {
      alerts.push(
        createAlert(
          'warning',
          'QUEUE_ANOMALY',
          `Kuyruk süresi öğrenilmiş tabanın %${percentageIncrease(
            latest.averageQueueWaitMs,
            baseline.averageQueueWaitMs,
          )} üzerinde.`,
          latest.capturedAt,
        ),
      );
    }
  }

  return alerts;
}

function createAlert(
  severity: RenderOperationsAlert['severity'],
  code: RenderOperationsAlert['code'],
  message: string,
  createdAt: string,
): RenderOperationsAlert {
  return {
    id: `${code.toLowerCase()}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`,
    severity,
    code,
    message,
    createdAt,
  };
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function standardDeviation(
  values: number[],
  average: number,
): number {
  if (values.length === 0) return 0;
  const variance =
    values.reduce(
      (total, value) => total + (value - average) ** 2,
      0,
    ) / values.length;
  return Math.sqrt(variance);
}

function percentageIncrease(
  current: number,
  baseline: number,
): number {
  if (baseline <= 0) return 100;
  return Math.max(
    0,
    Math.round(((current - baseline) / baseline) * 100),
  );
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1_000) return `${Math.round(durationMs)} ms`;
  if (durationMs < 60_000) {
    return `${(durationMs / 1_000).toFixed(1)} sn`;
  }
  return `${(durationMs / 60_000).toFixed(1)} dk`;
}
