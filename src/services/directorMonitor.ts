import type { ApplicationEventMap, EventBus } from '@/core/events';
import { useDirectorReportStore } from '@/store/directorReportStore';
export interface DirectorMonitor { start(): void; stop(): void; }
export function createDirectorMonitor(eventBus: EventBus<ApplicationEventMap>): DirectorMonitor {
  let unsubscribers: Array<() => void> = [];
  return { start() { if (unsubscribers.length) return; unsubscribers = [
    eventBus.on('director:analysis-started', ({ projectId }) => useDirectorReportStore.getState().analysisStarted(projectId)),
    eventBus.on('director:analyzer-completed', ({ analyzerId }) => useDirectorReportStore.getState().analyzerCompleted(analyzerId)),
    eventBus.on('director:analysis-completed', async ({ report, completedAt }) => {
      const persisted = useDirectorReportStore.getState().analysisCompleted(report, completedAt);
      if (persisted) await eventBus.emit('director:report-persisted', { projectId: report.projectId, reportVersion: report.reportVersion, persistedAt: new Date().toISOString() });
    }),
    eventBus.on('director:analysis-failed', ({ message }) => useDirectorReportStore.getState().analysisFailed(message)),
  ]; }, stop() { unsubscribers.forEach((unsubscribe) => unsubscribe()); unsubscribers = []; } };
}
