import { createManifestRevisionId, createTimelineSnapshot, isTimelineSnapshotCurrent, type TimelineSnapshot } from '@/core/editing';
import type { EventBus, ApplicationEventMap } from '@/core/events';
import type { RenderManifest } from '@/core/media';
import type { VisualProductionEngine, VisualProductionPlan, VisualProductionPreview, VisualProductionResult } from '@/core/visual-production';

export interface VisualProductionApplicationService {
  createPlan(manifest: RenderManifest, snapshot?: TimelineSnapshot, signal?: AbortSignal, requestId?: number): Promise<{ plan: VisualProductionPlan; snapshot: TimelineSnapshot }>;
  createPreview(plan: VisualProductionPlan, snapshot: TimelineSnapshot, approvedIds: readonly string[], signal?: AbortSignal): Promise<VisualProductionPreview>;
  apply(plan: VisualProductionPlan, preview: VisualProductionPreview, snapshot: TimelineSnapshot, approvedIds: readonly string[]): Promise<VisualProductionResult>;
  revisionCompleted(kind: 'undo' | 'redo', projectId: string, revisionId: string): Promise<void>;
}

export function createVisualProductionApplicationService(engine: VisualProductionEngine, bus: EventBus<ApplicationEventMap>): VisualProductionApplicationService {
  return {
    async createPlan(manifest, snapshot, signal, requestId = 0) { const current = snapshot && isTimelineSnapshotCurrent(snapshot, manifest) ? snapshot : createTimelineSnapshot(manifest, createManifestRevisionId(manifest)); await bus.emit('visual-production:analysis-started', { projectId: manifest.projectId, revisionId: current.revisionId, requestId, startedAt: new Date().toISOString() }); try { const plan = engine.analyze({ manifest, snapshot: current }, signal); await bus.emit('visual-production:plan-completed', { projectId: manifest.projectId, plan, requestId, completedAt: new Date().toISOString() }); return { plan, snapshot: current }; } catch (error) { await bus.emit('visual-production:failed', { projectId: manifest.projectId, stage: 'analysis', requestId, message: message(error), failedAt: new Date().toISOString() }); throw error; } },
    async createPreview(plan, snapshot, approvedIds, signal) { assertNotAborted(signal); const preview = engine.preview(plan, snapshot, approvedIds, signal); await bus.emit('visual-production:preview-created', { projectId: plan.projectId, preview, createdAt: new Date().toISOString() }); assertNotAborted(signal); return preview; },
    async apply(plan, preview, snapshot, approvedIds) { try { const result = engine.apply(plan, preview, snapshot, approvedIds); await bus.emit('visual-production:apply-completed', { projectId: plan.projectId, result, completedAt: new Date().toISOString() }); return result; } catch (error) { await bus.emit('visual-production:failed', { projectId: plan.projectId, stage: 'apply', message: message(error), failedAt: new Date().toISOString() }); throw error; } },
    async revisionCompleted(kind, projectId, revisionId) { const completedAt = new Date().toISOString(); if (kind === 'undo') await bus.emit('visual-production:undo-completed', { projectId, revisionId, completedAt }); else await bus.emit('visual-production:redo-completed', { projectId, revisionId, completedAt }); },
  };
}
function message(error: unknown) { return error instanceof Error ? error.message : 'Visual production failed.'; }
function assertNotAborted(signal?: AbortSignal) { if (!signal?.aborted) return; const error = new Error('Visual preview was superseded.'); error.name = 'AbortError'; throw error; }
