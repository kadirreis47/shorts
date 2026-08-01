import type { RenderJobSnapshot, RenderStage } from './types';

export interface RenderStageMetric {
  stage: RenderStage;
  samples: number;
  totalDurationMs: number;
  averageDurationMs: number;
  maximumDurationMs: number;
}

export interface RenderPerformanceSnapshot {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  cancelledJobs: number;
  successRate: number;
  averageRenderMs: number;
  maximumRenderMs: number;
  averageQueueWaitMs: number;
  cacheHits: number;
  retryCount: number;
  totalOutputBytes: number;
  averageOutputBytes: number;
  stageMetrics: RenderStageMetric[];
  updatedAt: string;
}

export interface RenderMetricsCollector {
  jobQueued(snapshot: RenderJobSnapshot): void;
  jobStarted(snapshot: RenderJobSnapshot): void;
  stageChanged(
    jobId: string,
    stage: RenderStage,
    changedAt?: number,
  ): void;
  cacheHit(): void;
  retryScheduled(): void;
  jobCompleted(snapshot: RenderJobSnapshot): void;
  jobFailed(snapshot: RenderJobSnapshot): void;
  jobCancelled(snapshot: RenderJobSnapshot): void;
  snapshot(): RenderPerformanceSnapshot;
  reset(): void;
}

interface ActiveMetric {
  queuedAtMs: number;
  startedAtMs: number | null;
  currentStage: RenderStage;
  stageStartedAtMs: number;
}

interface MutableStageMetric {
  samples: number;
  totalDurationMs: number;
  maximumDurationMs: number;
}

export function createRenderMetricsCollector(): RenderMetricsCollector {
  const active = new Map<string, ActiveMetric>();
  const stages = new Map<RenderStage, MutableStageMetric>();
  let totalJobs = 0;
  let completedJobs = 0;
  let failedJobs = 0;
  let cancelledJobs = 0;
  let totalRenderMs = 0;
  let maximumRenderMs = 0;
  let totalQueueWaitMs = 0;
  let cacheHits = 0;
  let retryCount = 0;
  let totalOutputBytes = 0;

  return {
    jobQueued(snapshot) {
      totalJobs += 1;
      const queuedAtMs = Date.parse(snapshot.queuedAt);
      active.set(snapshot.id, {
        queuedAtMs: Number.isFinite(queuedAtMs) ? queuedAtMs : Date.now(),
        startedAtMs: null,
        currentStage: snapshot.stage,
        stageStartedAtMs: Date.now(),
      });
    },

    jobStarted(snapshot) {
      const metric = active.get(snapshot.id);
      if (!metric) return;
      const startedAtMs = snapshot.startedAt
        ? Date.parse(snapshot.startedAt)
        : Date.now();
      metric.startedAtMs = Number.isFinite(startedAtMs)
        ? startedAtMs
        : Date.now();
      totalQueueWaitMs += Math.max(0, metric.startedAtMs - metric.queuedAtMs);
      closeStage(metric, Date.now(), stages);
      metric.currentStage = snapshot.stage;
      metric.stageStartedAtMs = Date.now();
    },

    stageChanged(jobId, stage, changedAt = Date.now()) {
      const metric = active.get(jobId);
      if (!metric || metric.currentStage === stage) return;
      closeStage(metric, changedAt, stages);
      metric.currentStage = stage;
      metric.stageStartedAtMs = changedAt;
    },

    cacheHit() {
      cacheHits += 1;
    },

    retryScheduled() {
      retryCount += 1;
    },

    jobCompleted(snapshot) {
      completedJobs += 1;
      finish(snapshot);
      const size = snapshot.output?.sizeBytes ?? 0;
      if (Number.isFinite(size) && size > 0) totalOutputBytes += size;
    },

    jobFailed(snapshot) {
      failedJobs += 1;
      finish(snapshot);
    },

    jobCancelled(snapshot) {
      cancelledJobs += 1;
      finish(snapshot);
    },

    snapshot() {
      const finishedJobs = completedJobs + failedJobs + cancelledJobs;
      return {
        totalJobs,
        completedJobs,
        failedJobs,
        cancelledJobs,
        successRate:
          finishedJobs > 0
            ? Math.round((completedJobs / finishedJobs) * 10_000) / 100
            : 0,
        averageRenderMs:
          finishedJobs > 0 ? Math.round(totalRenderMs / finishedJobs) : 0,
        maximumRenderMs,
        averageQueueWaitMs:
          totalJobs > 0 ? Math.round(totalQueueWaitMs / totalJobs) : 0,
        cacheHits,
        retryCount,
        totalOutputBytes,
        averageOutputBytes:
          completedJobs > 0
            ? Math.round(totalOutputBytes / completedJobs)
            : 0,
        stageMetrics: Array.from(stages.entries())
          .map(([stage, metric]) => ({
            stage,
            samples: metric.samples,
            totalDurationMs: metric.totalDurationMs,
            averageDurationMs:
              metric.samples > 0
                ? Math.round(metric.totalDurationMs / metric.samples)
                : 0,
            maximumDurationMs: metric.maximumDurationMs,
          }))
          .sort((left, right) => left.stage.localeCompare(right.stage)),
        updatedAt: new Date().toISOString(),
      };
    },

    reset() {
      active.clear();
      stages.clear();
      totalJobs = 0;
      completedJobs = 0;
      failedJobs = 0;
      cancelledJobs = 0;
      totalRenderMs = 0;
      maximumRenderMs = 0;
      totalQueueWaitMs = 0;
      cacheHits = 0;
      retryCount = 0;
      totalOutputBytes = 0;
    },
  };

  function finish(snapshot: RenderJobSnapshot): void {
    const metric = active.get(snapshot.id);
    if (metric) {
      closeStage(metric, Date.now(), stages);
      active.delete(snapshot.id);
    }

    const elapsed = Math.max(0, snapshot.elapsedMs);
    totalRenderMs += elapsed;
    maximumRenderMs = Math.max(maximumRenderMs, elapsed);
  }
}

function closeStage(
  metric: ActiveMetric,
  now: number,
  stages: Map<RenderStage, MutableStageMetric>,
): void {
  const durationMs = Math.max(0, now - metric.stageStartedAtMs);
  const current = stages.get(metric.currentStage) ?? {
    samples: 0,
    totalDurationMs: 0,
    maximumDurationMs: 0,
  };
  current.samples += 1;
  current.totalDurationMs += durationMs;
  current.maximumDurationMs = Math.max(current.maximumDurationMs, durationMs);
  stages.set(metric.currentStage, current);
}
