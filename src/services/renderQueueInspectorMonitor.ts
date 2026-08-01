import type {
  ApplicationEventMap,
  EventBus,
} from '@/core/events';
import { useRenderQueueInspectorStore } from '@/store/renderQueueInspectorStore';

export function attachRenderQueueInspector(
  eventBus: EventBus<ApplicationEventMap>,
  getSnapshot: (jobId: string) => import('@/core/render').RenderJobSnapshot | null,
  listSnapshots: () => import('@/core/render').RenderJobSnapshot[] = () => [],
  isQueuePaused: () => boolean = () => false,
): () => void {
  const refresh = (jobId: string) => {
    const snapshot = getSnapshot(jobId);
    if (snapshot) {
      useRenderQueueInspectorStore
        .getState()
        .upsert(snapshot);
    }
  };

  const store = useRenderQueueInspectorStore.getState();
  listSnapshots().forEach((snapshot) => store.upsert(snapshot));
  store.setQueuePaused(isQueuePaused());

  const unsubscribers = [
    eventBus.on('render:job-queued', ({ jobId }) => refresh(jobId)),
    eventBus.on('render:job-started', ({ jobId }) => refresh(jobId)),
    eventBus.on('render:job-progress', ({ jobId }) => refresh(jobId)),
    eventBus.on('render:job-completed', ({ jobId }) => refresh(jobId)),
    eventBus.on('render:job-failed', ({ jobId }) => refresh(jobId)),
    eventBus.on('render:job-cancelled', ({ jobId }) => refresh(jobId)),
    eventBus.on('render:queue-paused', () => {
      useRenderQueueInspectorStore.getState().setQueuePaused(true);
    }),
    eventBus.on('render:queue-resumed', () => {
      useRenderQueueInspectorStore.getState().setQueuePaused(false);
    }),
  ];

  return () => {
    unsubscribers.forEach((unsubscribe) => unsubscribe());
  };
}
