import type {
  ApplicationEventMap,
  EventBus,
} from '@/core/events';
import type { RenderRecoveryStore } from '@/core/render';
import { useRenderRecoveryCenterStore } from '@/store/renderRecoveryCenterStore';

export function attachRenderRecoveryCenter(
  eventBus: EventBus<ApplicationEventMap>,
  recoveryStore: RenderRecoveryStore,
): () => void {
  const sync = () => {
    const records = recoveryStore.list();
    useRenderRecoveryCenterStore.getState().hydrate({
      records,
      interrupted: records.filter(
        (record) => record.status === 'interrupted',
      ),
    });
  };

  const restored = recoveryStore.restore();
  useRenderRecoveryCenterStore.getState().hydrate(restored);

  if (restored.interrupted.length > 0) {
    void eventBus.emit('render:recovery-detected', {
      interruptedJobs: restored.interrupted.length,
      detectedAt: new Date().toISOString(),
    });
  }

  const unsubscribers = [
    eventBus.on('render:job-queued', sync),
    eventBus.on('render:job-started', sync),
    eventBus.on('render:job-progress', sync),
    eventBus.on('render:job-completed', sync),
    eventBus.on('render:job-failed', sync),
    eventBus.on('render:job-cancelled', sync),
  ];

  return () => {
    unsubscribers.forEach((unsubscribe) => unsubscribe());
  };
}
