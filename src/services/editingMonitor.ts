import type { ApplicationEventMap, EventBus } from '@/core/events';
import { useEditingStore } from '@/store/editingStore';
export interface EditingMonitor { start(): void; stop(): void; }
export function createEditingMonitor(eventBus: EventBus<ApplicationEventMap>): EditingMonitor { let unsubscribers: Array<() => void> = []; return { start() { if (unsubscribers.length) return; unsubscribers = [
  eventBus.on('editing:plan-started', ({ projectId }) => useEditingStore.getState().planStarted(projectId)),
  eventBus.on('editing:plan-completed', ({ plan }) => useEditingStore.getState().planCompleted(plan)),
  eventBus.on('editing:preview-created', ({ preview }) => useEditingStore.getState().previewCreated(preview)),
  eventBus.on('editing:apply-started', () => useEditingStore.getState().applyStarted()),
  eventBus.on('editing:apply-completed', ({ result, completedAt }) => useEditingStore.getState().applyCompleted(result, completedAt)),
  eventBus.on('editing:apply-failed', ({ message, stage }) => stage === 'plan' ? useEditingStore.getState().planFailed(message) : useEditingStore.getState().applyFailed(message)),
]; }, stop() { unsubscribers.forEach((unsubscribe) => unsubscribe()); unsubscribers = []; } }; }
