import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createPersistentStorage } from '@/persistence/storeStorage';
import type {
  RenderPerformanceSnapshot,
  RenderStageMetric,
} from '@/core/render';
import { buildRenderTuningReport, type RenderTuningReport } from '@/core/render/renderAutoTuner';
import {
  buildRenderCapacityPlan,
  type RenderCapacityPlan,
} from '@/core/render/renderCapacityPlanner';
import {
  buildAdaptiveAlerts,
  calculateAdaptiveBaseline,
  DEFAULT_RENDER_ALERT_THRESHOLDS,
  type RenderAdaptiveBaseline,
  type RenderAlertThresholds,
} from '@/core/render/renderAlertBaselines';

export type RenderHealthStatus =
  | 'healthy'
  | 'degraded'
  | 'critical'
  | 'idle';

export interface RenderOperationsAlert {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  code:
    | 'LOW_SUCCESS_RATE'
    | 'HIGH_QUEUE_WAIT'
    | 'HIGH_RENDER_TIME'
    | 'RETRY_PRESSURE'
    | 'CACHE_INACTIVE'
    | 'CIRCUIT_OPEN'
    | 'RENDER_ANOMALY'
    | 'QUEUE_ANOMALY';
  message: string;
  createdAt: string;
}

export interface RenderMetricsPoint {
  capturedAt: string;
  totalJobs: number;
  successRate: number;
  averageRenderMs: number;
  averageQueueWaitMs: number;
  cacheHits: number;
  retryCount: number;
}

interface RenderAnalyticsState {
  snapshot: RenderPerformanceSnapshot | null;
  history: RenderMetricsPoint[];
  alerts: RenderOperationsAlert[];
  health: RenderHealthStatus;
  bottleneckStage: RenderStageMetric | null;
  circuitOpenCount: number;
  baseline: RenderAdaptiveBaseline | null;
  thresholds: RenderAlertThresholds;
  tuningReport: RenderTuningReport;
  capacityPlan: RenderCapacityPlan;
  runtimeConcurrency: number;
  capacityInputs: {
    concurrency: number;
    jobsPerDay: number;
    averageVideoDurationSeconds: number;
    targetCompletionHours: number;
  };
  updateRuntimeConcurrency: (concurrency: number) => void;
  updateCapacityInputs: (
    input: Partial<RenderAnalyticsState['capacityInputs']>,
  ) => void;
  refreshCapacityPlan: () => void;
  applyTuningRecommendation: (recommendationId: string) => void;
  refreshTuningReport: () => void;
  updateThresholds: (thresholds: Partial<RenderAlertThresholds>) => void;
  resetThresholds: () => void;
  updateMetrics: (snapshot: RenderPerformanceSnapshot) => void;
  recordCircuitOpen: (payload: {
    adapterId: string;
    retryAfterMs: number;
    consecutiveFailures: number;
  }) => void;
  clearAlerts: () => void;
  exportSnapshot: () => RenderAnalyticsExport;
  reset: () => void;
}

export interface RenderAnalyticsExport {
  exportedAt: string;
  health: RenderHealthStatus;
  snapshot: RenderPerformanceSnapshot | null;
  history: RenderMetricsPoint[];
  alerts: RenderOperationsAlert[];
  bottleneckStage: RenderStageMetric | null;
  circuitOpenCount: number;
  baseline: RenderAdaptiveBaseline | null;
  thresholds: RenderAlertThresholds;
  tuningReport: RenderTuningReport;
  capacityPlan: RenderCapacityPlan;
  runtimeConcurrency: number;
  capacityInputs: {
    concurrency: number;
    jobsPerDay: number;
    averageVideoDurationSeconds: number;
    targetCompletionHours: number;
  };
}

const HISTORY_LIMIT = 120;
const ALERT_LIMIT = 30;

export const useRenderAnalyticsStore =
  create<RenderAnalyticsState>()(
    persist(
      (set, get) => ({
    snapshot: null,
    history: [],
    alerts: [],
    health: 'idle',
    bottleneckStage: null,
    circuitOpenCount: 0,
    baseline: null,
    thresholds: DEFAULT_RENDER_ALERT_THRESHOLDS,
    tuningReport: buildRenderTuningReport({
      snapshot: null,
      baseline: null,
      thresholds: DEFAULT_RENDER_ALERT_THRESHOLDS,
    }),
    runtimeConcurrency: 1,
    capacityInputs: {
      concurrency: 1,
      jobsPerDay: 20,
      averageVideoDurationSeconds: 45,
      targetCompletionHours: 8,
    },
    capacityPlan: buildRenderCapacityPlan({
      snapshot: null,
      concurrency: 1,
      jobsPerDay: 20,
      averageVideoDurationSeconds: 45,
      targetCompletionHours: 8,
    }),

    updateRuntimeConcurrency: (concurrency) =>
      set({
        runtimeConcurrency: Math.max(
          1,
          Math.min(8, Math.floor(concurrency)),
        ),
      }),

    updateCapacityInputs: (input) =>
      set((state) => {
        const capacityInputs = {
          ...state.capacityInputs,
          ...input,
        };
        return {
          capacityInputs,
          capacityPlan: buildRenderCapacityPlan({
            snapshot: state.snapshot,
            ...capacityInputs,
          }),
        };
      }),

    refreshCapacityPlan: () =>
      set((state) => ({
        capacityPlan: buildRenderCapacityPlan({
          snapshot: state.snapshot,
          ...state.capacityInputs,
        }),
      })),

    applyTuningRecommendation: (recommendationId) =>
      set((state) => {
        const recommendation = state.tuningReport.recommendations.find(
          (item) => item.id === recommendationId,
        );
        if (!recommendation) return state;

        const thresholds = {
          ...state.thresholds,
          ...(recommendation.suggestedThresholds ?? {}),
        };

        return {
          thresholds,
          tuningReport: buildRenderTuningReport({
            snapshot: state.snapshot,
            baseline: state.baseline,
            thresholds,
          }),
        };
      }),

    refreshTuningReport: () =>
      set((state) => ({
        tuningReport: buildRenderTuningReport({
          snapshot: state.snapshot,
          baseline: state.baseline,
          thresholds: state.thresholds,
        }),
      })),

    updateThresholds: (thresholds) =>
      set((state) => ({
        thresholds: {
          ...state.thresholds,
          ...thresholds,
        },
      })),

    resetThresholds: () =>
      set({
        thresholds: DEFAULT_RENDER_ALERT_THRESHOLDS,
        tuningReport: buildRenderTuningReport({
          snapshot: null,
          baseline: null,
          thresholds: DEFAULT_RENDER_ALERT_THRESHOLDS,
        }),
        runtimeConcurrency: 1,
        capacityInputs: {
          concurrency: 1,
          jobsPerDay: 20,
          averageVideoDurationSeconds: 45,
          targetCompletionHours: 8,
        },
        capacityPlan: buildRenderCapacityPlan({
          snapshot: null,
          concurrency: 1,
          jobsPerDay: 20,
          averageVideoDurationSeconds: 45,
          targetCompletionHours: 8,
        }),
      }),

    updateMetrics: (snapshot) =>
      set((state) => {
        const point: RenderMetricsPoint = {
          capturedAt: snapshot.updatedAt,
          totalJobs: snapshot.totalJobs,
          successRate: snapshot.successRate,
          averageRenderMs: snapshot.averageRenderMs,
          averageQueueWaitMs: snapshot.averageQueueWaitMs,
          cacheHits: snapshot.cacheHits,
          retryCount: snapshot.retryCount,
        };

        const nextHistory = appendUniquePoint(
          state.history,
          point,
        );
        const baseline = calculateAdaptiveBaseline(nextHistory);
        const alerts = buildAdaptiveAlerts({
          latest: point,
          baseline,
          thresholds: state.thresholds,
        });

        return {
          snapshot,
          history: nextHistory,
          alerts: mergeAlerts(state.alerts, alerts),
          health: calculateHealth(
            snapshot,
            state.circuitOpenCount,
            state.thresholds,
          ),
          bottleneckStage: findBottleneck(snapshot.stageMetrics),
          baseline,
          tuningReport: buildRenderTuningReport({
            snapshot,
            baseline,
            thresholds: state.thresholds,
          }),
          capacityPlan: buildRenderCapacityPlan({
            snapshot,
            ...state.capacityInputs,
          }),
        };
      }),

    recordCircuitOpen: ({
      adapterId,
      retryAfterMs,
      consecutiveFailures,
    }) =>
      set((state) => {
        const alert: RenderOperationsAlert = {
          id: createAlertId('CIRCUIT_OPEN'),
          severity: 'critical',
          code: 'CIRCUIT_OPEN',
          message:
            `${adapterId} adapter devresi açıldı. ` +
            `${consecutiveFailures} ardışık hata; ` +
            `${Math.ceil(retryAfterMs / 1000)} saniye bekleme.`,
          createdAt: new Date().toISOString(),
        };

        return {
          circuitOpenCount: state.circuitOpenCount + 1,
          health: 'critical',
          alerts: mergeAlerts(state.alerts, [alert]),
        };
      }),

    clearAlerts: () => set({ alerts: [] }),

    exportSnapshot: () => {
      const state = get();
      return {
        exportedAt: new Date().toISOString(),
        health: state.health,
        snapshot: state.snapshot,
        history: [...state.history],
        alerts: [...state.alerts],
        bottleneckStage: state.bottleneckStage,
        circuitOpenCount: state.circuitOpenCount,
        baseline: state.baseline,
        thresholds: state.thresholds,
        tuningReport: state.tuningReport,
        capacityPlan: state.capacityPlan,
        runtimeConcurrency: state.runtimeConcurrency,
        capacityInputs: state.capacityInputs,
      };
    },

    reset: () =>
      set({
        snapshot: null,
        history: [],
        alerts: [],
        health: 'idle',
        bottleneckStage: null,
        circuitOpenCount: 0,
        baseline: null,
        thresholds: DEFAULT_RENDER_ALERT_THRESHOLDS,
        tuningReport: buildRenderTuningReport({
          snapshot: null,
          baseline: null,
          thresholds: DEFAULT_RENDER_ALERT_THRESHOLDS,
        }),
        runtimeConcurrency: 1,
        capacityInputs: {
          concurrency: 1,
          jobsPerDay: 20,
          averageVideoDurationSeconds: 45,
          targetCompletionHours: 8,
        },
        capacityPlan: buildRenderCapacityPlan({
          snapshot: null,
          concurrency: 1,
          jobsPerDay: 20,
          averageVideoDurationSeconds: 45,
          targetCompletionHours: 8,
        }),
      }),
      }),
      {
        name: 'shortsflow.render-analytics.v1',
        version: 1,
        storage: createPersistentStorage(),
        skipHydration: true,
        partialize: (state) => ({
          snapshot: state.snapshot,
          history: state.history,
          alerts: state.alerts,
          health: state.health,
          bottleneckStage: state.bottleneckStage,
          circuitOpenCount: state.circuitOpenCount,
          baseline: state.baseline,
          thresholds: state.thresholds,
          tuningReport: state.tuningReport,
          capacityPlan: state.capacityPlan,
          runtimeConcurrency: state.runtimeConcurrency,
          capacityInputs: state.capacityInputs,
        }),
      },
    ),
  );

function calculateHealth(
  snapshot: RenderPerformanceSnapshot,
  circuitOpenCount: number,
  thresholds: RenderAlertThresholds,
): RenderHealthStatus {
  if (snapshot.totalJobs === 0) return 'idle';
  if (
    circuitOpenCount > 0 ||
    snapshot.successRate < thresholds.criticalSuccessRate ||
    snapshot.averageQueueWaitMs > thresholds.criticalQueueWaitMs
  ) {
    return 'critical';
  }
  if (
    snapshot.successRate < thresholds.degradedSuccessRate ||
    snapshot.retryCount >= thresholds.retryWarningCount ||
    snapshot.averageQueueWaitMs > thresholds.degradedQueueWaitMs
  ) {
    return 'degraded';
  }
  return 'healthy';
}

function findBottleneck(
  stages: RenderStageMetric[],
): RenderStageMetric | null {
  if (stages.length === 0) return null;

  return [...stages].sort(
    (left, right) =>
      right.averageDurationMs - left.averageDurationMs,
  )[0];
}

function appendUniquePoint(
  history: RenderMetricsPoint[],
  point: RenderMetricsPoint,
): RenderMetricsPoint[] {
  const previous = history[history.length - 1];
  if (
    previous &&
    previous.totalJobs === point.totalJobs &&
    previous.successRate === point.successRate &&
    previous.averageRenderMs === point.averageRenderMs &&
    previous.averageQueueWaitMs === point.averageQueueWaitMs &&
    previous.cacheHits === point.cacheHits &&
    previous.retryCount === point.retryCount
  ) {
    return history;
  }

  return [...history, point].slice(-HISTORY_LIMIT);
}

function mergeAlerts(
  current: RenderOperationsAlert[],
  incoming: RenderOperationsAlert[],
): RenderOperationsAlert[] {
  if (incoming.length === 0) return current;

  const merged = [...incoming, ...current];
  const seenCodes = new Set<RenderOperationsAlert['code']>();

  return merged
    .filter((alert) => {
      if (seenCodes.has(alert.code)) return false;
      seenCodes.add(alert.code);
      return true;
    })
    .slice(0, ALERT_LIMIT);
}

function createAlertId(
  code: RenderOperationsAlert['code'],
): string {
  return `${code.toLowerCase()}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1_000) return `${Math.round(durationMs)} ms`;
  if (durationMs < 60_000) return `${(durationMs / 1_000).toFixed(1)} sn`;
  return `${(durationMs / 60_000).toFixed(1)} dk`;
}
