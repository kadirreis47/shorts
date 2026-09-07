import type { ApplicationEventMap, EventBus } from '@/core/events';
import { isVisualBoundDirectorReportV2_1 } from '@/core/director';
import { useDirectorReportStore } from '@/store/directorReportStore';
export interface DirectorMonitor { start(): void; stop(): void; }
export function createDirectorMonitor(eventBus: EventBus<ApplicationEventMap>): DirectorMonitor {
  let unsubscribers: Array<() => void> = [];
  return { start() { if (unsubscribers.length) return; unsubscribers = [
    eventBus.on('director:analysis-started', ({ projectId, admit }) => {
      if (admit?.() === false) return;
      useDirectorReportStore.getState().analysisStarted(projectId);
    }),
    eventBus.on('director:analyzer-completed', ({ analyzerId, admit }) => {
      if (admit?.() === false) return;
      useDirectorReportStore.getState().analyzerCompleted(analyzerId);
    }),
    eventBus.on('director:analysis-completed', async ({ report, completedAt, admission }) => {
      // This synchronous check and store call are the final report-admission
      // linearization point. It closes the event bus's Promise microtask gap.
      if (!isCompletionAdmission(admission)) return;
      if (!isVisualBoundDirectorReportV2_1(report)) {
        safelyFail(admission, new Error('Director completion requires a supported visual-bound 2.1 report.'));
        return;
      }
      try {
        if (!admission.validate(report)) return;
      } catch (error) {
        safelyFail(admission, error);
        return;
      }
      let persisted: boolean;
      try {
        persisted = useDirectorReportStore.getState().analysisCompleted(report, completedAt);
        admission.acknowledgeStored(report);
      } catch (error) {
        safelyFail(admission, error);
        return;
      }
      if (persisted) await eventBus.emit('director:report-persisted', { projectId: report.projectId, reportVersion: report.reportVersion, persistedAt: new Date().toISOString() });
    }),
    eventBus.on('director:analysis-failed', ({ message, admit }) => {
      if (admit?.() === false) return;
      useDirectorReportStore.getState().analysisFailed(message);
    }),
  ]; }, stop() { unsubscribers.forEach((unsubscribe) => unsubscribe()); unsubscribers = []; } };
}

function isCompletionAdmission(value: unknown): value is ApplicationEventMap['director:analysis-completed']['admission'] {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ApplicationEventMap['director:analysis-completed']['admission']>;
  return typeof candidate.validate === 'function'
    && typeof candidate.acknowledgeStored === 'function'
    && typeof candidate.fail === 'function';
}

function safelyFail(
  admission: ApplicationEventMap['director:analysis-completed']['admission'],
  error: unknown,
): void {
  try { admission.fail(error); } catch { /* A malformed runtime admission remains unacknowledged. */ }
}
