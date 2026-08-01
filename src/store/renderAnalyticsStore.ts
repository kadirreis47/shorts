import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  RenderPerformanceSnapshot,
  RenderStageMetric,
} from '@/core/render';

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
    | 'CIRCUIT_OPEN';
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

    updateMetrics: (snapshot) =>
      set((state) => {
        const alerts = buildAlerts(snapshot);
        const point: RenderMetricsPoint = {
          capturedAt: snapshot.updatedAt,
          totalJobs: snapshot.totalJobs,
          successRate: snapshot.successRate,
          averageRenderMs: snapshot.averageRenderMs,
          averageQueueWaitMs: snapshot.averageQueueWaitMs,
          cacheHits: snapshot.cacheHits,
          retryCount: snapshot.retryCount,
        };

        return {
          snapshot,
          history: appendUniquePoint(state.history, point),
          alerts: mergeAlerts(state.alerts, alerts),
          health: calculateHealth(snapshot, state.circuitOpenCount),
          bottleneckStage: findBottleneck(snapshot.stageMetrics),
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
      }),
      }),
      {
        name: 'shortsflow.render-analytics.v1',
        version: 1,
        partialize: (state) => ({
          snapshot: state.snapshot,
          history: state.history,
          alerts: state.alerts,
          health: state.health,
          bottleneckStage: state.bottleneckStage,
          circuitOpenCount: state.circuitOpenCount,
        }),
      },
    ),
  );

function calculateHealth(
  snapshot: RenderPerformanceSnapshot,
  circuitOpenCount: number,
): RenderHealthStatus {
  if (snapshot.totalJobs === 0) return 'idle';
  if (
    circuitOpenCount > 0 ||
    snapshot.successRate < 70 ||
    snapshot.averageQueueWaitMs > 30_000
  ) {
    return 'critical';
  }
  if (
    snapshot.successRate < 90 ||
    snapshot.retryCount >= 3 ||
    snapshot.averageQueueWaitMs > 10_000
  ) {
    return 'degraded';
  }
  return 'healthy';
}

function buildAlerts(
  snapshot: RenderPerformanceSnapshot,
): RenderOperationsAlert[] {
  const alerts: RenderOperationsAlert[] = [];

  if (snapshot.totalJobs >= 3 && snapshot.successRate < 90) {
    alerts.push({
      id: createAlertId('LOW_SUCCESS_RATE'),
      severity: snapshot.successRate < 70 ? 'critical' : 'warning',
      code: 'LOW_SUCCESS_RATE',
      message: `Render başarı oranı %${snapshot.successRate.toFixed(1)}.`,
      createdAt: snapshot.updatedAt,
    });
  }

  if (snapshot.averageQueueWaitMs > 10_000) {
    alerts.push({
      id: createAlertId('HIGH_QUEUE_WAIT'),
      severity:
        snapshot.averageQueueWaitMs > 30_000 ? 'critical' : 'warning',
      code: 'HIGH_QUEUE_WAIT',
      message:
        `Ortalama kuyruk bekleme süresi ` +
        `${formatDuration(snapshot.averageQueueWaitMs)}.`,
      createdAt: snapshot.updatedAt,
    });
  }

  if (snapshot.averageRenderMs > 120_000) {
    alerts.push({
      id: createAlertId('HIGH_RENDER_TIME'),
      severity: 'warning',
      code: 'HIGH_RENDER_TIME',
      message:
        `Ortalama render süresi ` +
        `${formatDuration(snapshot.averageRenderMs)}.`,
      createdAt: snapshot.updatedAt,
    });
  }

  if (snapshot.retryCount >= 3) {
    alerts.push({
      id: createAlertId('RETRY_PRESSURE'),
      severity: snapshot.retryCount >= 8 ? 'critical' : 'warning',
      code: 'RETRY_PRESSURE',
      message: `${snapshot.retryCount} kontrollü render tekrar denemesi oluştu.`,
      createdAt: snapshot.updatedAt,
    });
  }

  if (snapshot.totalJobs >= 5 && snapshot.cacheHits === 0) {
    alerts.push({
      id: createAlertId('CACHE_INACTIVE'),
      severity: 'info',
      code: 'CACHE_INACTIVE',
      message:
        'Henüz render cache hit oluşmadı; tekrar eden işlerde fingerprint kontrol edilmeli.',
      createdAt: snapshot.updatedAt,
    });
  }

  return alerts;
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
