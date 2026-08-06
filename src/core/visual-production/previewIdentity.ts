import { canonicalSerialize, type TimelineSnapshot } from '@/core/editing';
import { stableId } from '@/core/editing/utils';
import type { VisualProductionPlan, VisualProductionPreview } from './types';

export interface VisualPreviewRequestIdentity {
  readonly requestId: number;
  readonly projectId: string;
  readonly planId: string;
  readonly planSignature: string;
  readonly sourceRevisionId: string;
  readonly sourceManifestFingerprint: string;
  readonly approvalSignature: string;
}

export function visualApprovalSignature(approvedIds: readonly string[]): string { return [...new Set(approvedIds)].sort().join('|'); }
export function visualPlanSignature(plan: VisualProductionPlan): string { return stableId('visual-plan-state', canonicalSerialize({ id: plan.id, projectId: plan.projectId, sourceRevisionId: plan.sourceRevisionId, sourceManifestFingerprint: plan.sourceManifestFingerprint, operations: plan.operations })); }
export function createVisualPreviewRequestIdentity(plan: VisualProductionPlan, snapshot: TimelineSnapshot, approvedIds: readonly string[], requestId: number): VisualPreviewRequestIdentity { return { requestId, projectId: plan.projectId, planId: plan.id, planSignature: visualPlanSignature(plan), sourceRevisionId: snapshot.revisionId, sourceManifestFingerprint: snapshot.manifestFingerprint, approvalSignature: visualApprovalSignature(approvedIds) }; }
export function previewMatchesRequest(preview: VisualProductionPreview, request: VisualPreviewRequestIdentity): boolean { return preview.projectId === request.projectId && preview.planId === request.planId && preview.planSignature === request.planSignature && preview.sourceRevisionId === request.sourceRevisionId && preview.sourceManifestFingerprint === request.sourceManifestFingerprint && preview.approvalSignature === request.approvalSignature; }
