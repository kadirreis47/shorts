import type { DirectorReport } from '@/core/director';
import type { EditingEngine, EditApplyResult, EditPlan, EditPreview, TimelineSnapshot } from '@/core/editing';
import { createManifestRevisionId, createTimelineSnapshot, isTimelineSnapshotCurrent, MANIFEST_FINGERPRINT_VERSION } from '@/core/editing';
import type { ApplicationEventMap, EventBus } from '@/core/events';
import type { RenderManifest } from '@/core/media';

export interface EditingApplicationService {
  createPlan(report: DirectorReport, manifest: RenderManifest, snapshot?: TimelineSnapshot, signal?: AbortSignal): Promise<{ plan: EditPlan; snapshot: TimelineSnapshot }>;
  createPreview(plan: EditPlan, snapshot: TimelineSnapshot, signal?: AbortSignal): Promise<EditPreview>;
  apply(plan: EditPlan, preview: EditPreview, snapshot: TimelineSnapshot, approvedOperationIds?: readonly string[]): Promise<EditApplyResult>;
}
export function createEditingApplicationService(engine: EditingEngine, eventBus: EventBus<ApplicationEventMap>): EditingApplicationService {
  return {
    async createPlan(report, manifest, snapshot, signal) {
      const current = snapshot && isTimelineSnapshotCurrent(snapshot, manifest) ? snapshot : createTimelineSnapshot(manifest, createManifestRevisionId(manifest));
      if (current.projectId !== manifest.projectId) throw new Error('Timeline snapshot belongs to another project.');
      await eventBus.emit('editing:plan-started', { projectId: manifest.projectId, revisionId: current.revisionId, startedAt: new Date().toISOString() });
      try { assertIdentity(report, manifest); const plan = engine.compile({ projectId: manifest.projectId, manifest, directorReport: report, revisionId: current.revisionId }, signal);
        await eventBus.emit('editing:plan-completed', { projectId: manifest.projectId, plan, completedAt: new Date().toISOString() }); return { plan, snapshot: current };
      } catch (error) { await eventBus.emit('editing:apply-failed', { projectId: manifest.projectId, stage: 'plan', message: message(error), failedAt: new Date().toISOString() }); throw error; }
    },
    async createPreview(plan, snapshot, signal) { const preview = engine.preview(plan, snapshot, signal); await eventBus.emit('editing:preview-created', { projectId: plan.projectId, preview, createdAt: new Date().toISOString() }); return preview; },
    async apply(plan, preview, snapshot, approvedOperationIds) { await eventBus.emit('editing:apply-started', { projectId: plan.projectId, planId: plan.id, revisionId: snapshot.revisionId, startedAt: new Date().toISOString() });
      try { const result = engine.apply(plan, preview, snapshot, approvedOperationIds); for (const operationId of result.appliedOperationIds) await eventBus.emit('editing:operation-applied', { projectId: plan.projectId, operationId, revisionId: result.revision.id, appliedAt: new Date().toISOString() });
        await eventBus.emit('editing:apply-completed', { projectId: plan.projectId, result, completedAt: new Date().toISOString() }); return result;
      } catch (error) { await eventBus.emit('editing:apply-failed', { projectId: plan.projectId, stage: 'apply', message: message(error), failedAt: new Date().toISOString() }); throw error; } },
  };
}
function assertIdentity(report: DirectorReport, manifest: RenderManifest): void {
  if (report.projectId !== manifest.projectId) throw new Error('Director report is stale or belongs to another project.');
  const fingerprint = createManifestRevisionId(manifest);
  if (report.manifestBindingVersion !== '1.0' || report.manifestFingerprintVersion !== MANIFEST_FINGERPRINT_VERSION || report.analyzedManifestFingerprint !== fingerprint)
    throw new Error('Manifest changed; run AI Director analysis again before creating an edit plan.');
}
function message(error: unknown): string { return error instanceof Error ? error.message : 'Editing operation failed.'; }
