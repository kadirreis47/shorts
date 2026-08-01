import type {
  ApplicationEventMap,
  EventBus,
  Unsubscribe,
} from '@/core/events';
import { useRenderStore } from '@/store/renderStore';
import { useRenderAnalyticsStore } from '@/store/renderAnalyticsStore';

export interface RenderJobMonitor {
  start(): void;
  stop(): void;
  isStarted(): boolean;
}

export function createRenderJobMonitor(
  eventBus: EventBus<ApplicationEventMap>,
): RenderJobMonitor {
  let started = false;
  let timerId: ReturnType<typeof setInterval> | null = null;
  const unsubscribers: Unsubscribe[] = [];

  return {
    start() {
      if (started) return;
      started = true;

      unsubscribers.push(
        eventBus.on('render:job-queued', (payload) => {
          useRenderStore.getState().queued(payload);
        }),
        eventBus.on('render:job-started', (payload) => {
          useRenderStore.getState().started(payload);
        }),
        eventBus.on('render:job-progress', (payload) => {
          useRenderStore.getState().progressed(payload);
        }),
        eventBus.on('render:job-completed', (payload) => {
          useRenderStore.getState().completed(payload);
        }),
        eventBus.on('render:job-failed', (payload) => {
          useRenderStore.getState().failed(payload);
        }),
        eventBus.on('render:job-cancelled', (payload) => {
          useRenderStore.getState().cancelled(payload);
        }),
        eventBus.on('render:metrics-updated', ({ snapshot }) => {
          useRenderAnalyticsStore.getState().updateMetrics(snapshot);
        }),
        eventBus.on('render:circuit-open', (payload) => {
          useRenderAnalyticsStore.getState().recordCircuitOpen({
            adapterId: payload.adapterId,
            retryAfterMs: payload.retryAfterMs,
            consecutiveFailures: payload.consecutiveFailures,
          });
        }),
      );

      timerId = setInterval(() => {
        useRenderStore.getState().tick();
      }, 1_000);
    },

    stop() {
      if (!started) return;
      started = false;
      unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe());
      if (timerId !== null) {
        clearInterval(timerId);
        timerId = null;
      }
    },

    isStarted() {
      return started;
    },
  };
}
