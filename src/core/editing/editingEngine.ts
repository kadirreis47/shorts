import { compileEditPlan } from './editPlanCompiler';
import { deriveEffectiveEditPlan } from './editPlanCompiler';
import { createEditPreview, transformTimeline } from './timelineTransform';
import type { EditApplyResult, EditingEngine, EditingEngineOptions } from './types';

export function createEditingEngine(_options: EditingEngineOptions = {}): EditingEngine {
  return {
    compile: (input, signal) => compileEditPlan(input, input.directorReport.generatedAt, signal),
    preview: (plan, snapshot, signal) => createEditPreview(plan, snapshot, undefined, signal),
    apply(plan, preview, snapshot, approvedOperationIds): EditApplyResult {
      const effective = deriveEffectiveEditPlan(plan); const expectedPreview = createEditPreview(effective, snapshot);
      if (preview.planId !== effective.id || preview.sourceRevisionId !== snapshot.revisionId || preview.id !== expectedPreview.id) throw new Error('A current preview is required before apply.');
      if (effective.diagnostics.conflicts.some((item) => item.severity === 'critical')) throw new Error('Critical edit conflicts must be resolved before apply.');
      const selected = new Set(approvedOperationIds ?? effective.operations.filter((item) => item.automaticallyApplicable && item.status !== 'disabled').map((item) => item.id));
      const transformed = transformTimeline(snapshot, effective, [...selected]);
      return { projectId: effective.projectId, appliedOperationIds: transformed.applied, skippedOperationIds: transformed.skipped,
        previousRevision: { id: snapshot.revisionId, projectId: snapshot.projectId, parentRevisionId: snapshot.parentRevisionId, createdAt: snapshot.createdAt, operationIds: [], snapshot },
        revision: { id: transformed.snapshot.revisionId, projectId: snapshot.projectId, parentRevisionId: snapshot.revisionId, createdAt: transformed.snapshot.createdAt, operationIds: transformed.applied, snapshot: transformed.snapshot },
        durationDeltaMs: transformed.snapshot.manifest.durationMs - snapshot.manifest.durationMs };
    },
  };
}
