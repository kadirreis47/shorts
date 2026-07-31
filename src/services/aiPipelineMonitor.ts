import type { ApplicationEventMap, EventBus, Unsubscribe } from '@/core/events';
import { useAIPipelineStore } from '@/store/aiPipelineStore';

export interface AIPipelineMonitor {
  start(): void;
  stop(): void;
  isStarted(): boolean;
}

export function createAIPipelineMonitor(
  eventBus: EventBus<ApplicationEventMap>,
): AIPipelineMonitor {
  let started = false;
  let timerId: ReturnType<typeof setInterval> | null = null;
  const unsubscribers: Unsubscribe[] = [];

  const subscribe = () => {
    const store = useAIPipelineStore.getState();

    unsubscribers.push(
      eventBus.on('ai:pipeline-started', (payload) => {
        useAIPipelineStore.getState().started(payload);
      }),
      eventBus.on('ai:pipeline-step-started', (payload) => {
        useAIPipelineStore.getState().stepStarted(payload);
      }),
      eventBus.on('ai:pipeline-step-retrying', (payload) => {
        useAIPipelineStore.getState().stepRetrying(payload);
      }),
      eventBus.on('ai:pipeline-step-completed', (payload) => {
        useAIPipelineStore.getState().stepCompleted(payload);
      }),
      eventBus.on('ai:pipeline-completed', (payload) => {
        useAIPipelineStore.getState().completed(payload);
      }),
      eventBus.on('ai:pipeline-failed', (payload) => {
        useAIPipelineStore.getState().failed(payload);
      }),
      eventBus.on('ai:pipeline-cancelled', (payload) => {
        useAIPipelineStore.getState().cancelled(payload);
      }),
    );

    store.tick();
  };

  return {
    start() {
      if (started) return;
      started = true;
      subscribe();
      timerId = setInterval(() => {
        useAIPipelineStore.getState().tick();
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
