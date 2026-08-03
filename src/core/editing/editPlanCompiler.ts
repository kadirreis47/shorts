import type { EditDecisionAction, EditDecisionPlanItem } from '@/core/director';
import type { RenderManifest } from '@/core/media';
import { planAutoTrim, planBroll, planMotion, planReorder, planSceneSplit, planTransitions } from './planners';
import type { EditOperation, EditOperationConflict, EditOperationType, EditPlan, EditingProjectInput } from './types';
import { assertNotAborted, stableId } from './utils';
import { createManifestRevisionId } from './manifestFingerprint';

export { createManifestRevisionId } from './manifestFingerprint';

const mapping: Partial<Record<EditDecisionAction, EditOperationType>> = {
  keep: 'keep', shorten: 'shorten', split: 'split', reorder: 'reorder', 'replace-asset': 'replace-asset',
  'add-broll': 'add-broll', 'increase-motion': 'increase-motion', 'reduce-motion': 'reduce-motion',
  'change-transition': 'change-transition', 'add-pattern-interrupt': 'insert-pattern-interrupt', 'move-cta': 'move-cta', 'remove-scene': 'remove',
};
const priorityRank = { critical: 4, high: 3, medium: 2, low: 1 } as const;

export function compileEditPlan(input: EditingProjectInput, now = input.directorReport.generatedAt, signal?: AbortSignal): EditPlan {
  assertNotAborted(signal); assertIdentity(input); const unsupported: string[] = [];
  const candidates = input.directorReport.editDecisionPlan.decisions.flatMap((decision) => {
    const type = mapping[decision.action]; if (!type) { unsupported.push(decision.id); return []; }
    return [toOperation(input.manifest, decision, type, now)];
  });
  enrichPlan(input, candidates, now);
  const unique = new Map<string, EditOperation>();
  candidates.forEach((operation) => { const key = `${operation.sceneId}|${operation.type}`; const previous = unique.get(key);
    if (!previous || priorityRank[operation.priority] > priorityRank[previous.priority] || operation.confidence > previous.confidence) unique.set(key, operation); });
  const raw = [...unique.values()];
  const sourceOperations = new Map(candidates.flatMap((operation) => {
    if (!operation.sourceDecisionId) return [];
    const winner = unique.get(`${operation.sceneId}|${operation.type}`);
    return winner ? [[operation.sourceDecisionId, winner.id] as const] : [];
  }));
  const missingDependencies = new Set<string>();
  const withDependencies = raw.map((operation) => ({ ...operation, dependencies: [...new Set(operation.dependencies.flatMap((dependency) => {
    const resolved = sourceOperations.get(dependency) ?? (raw.some((candidate) => candidate.id === dependency) ? dependency : null);
    if (!resolved) missingDependencies.add(dependency); return [resolved ?? dependency];
  }))].sort() }));
  const conflicts = detectConflicts(withDependencies);
  const operations = orderByDependencies(withDependencies.map((operation) => ({ ...operation, conflicts: conflicts.filter((item) => item.operationIds.includes(operation.id)).map((item) => item.id) })));
  const estimatedDurationDeltaMs = operations.reduce((total, item) => total + numeric(item.parameters.durationDeltaMs), 0);
  return { id: stableId('edit-plan', `${input.projectId}|${input.directorReport.generatedAt}|${input.revisionId ?? input.manifest.createdAt}`), version: '1.0', projectId: input.projectId,
    sourceReportGeneratedAt: input.directorReport.generatedAt, sourceRevisionId: input.revisionId ?? createManifestRevisionId(input.manifest), createdAt: now, operations,
    summary: { operationCount: operations.length, automaticCount: operations.filter((item) => item.automaticallyApplicable).length,
      manualCount: operations.filter((item) => !item.automaticallyApplicable).length, disabledCount: 0, estimatedDurationDeltaMs,
      estimatedScoreImpact: Math.round(operations.reduce((sum, item) => sum + item.expectedImpact, 0) * 10) / 10 },
    diagnostics: { unsupportedDecisionIds: unsupported.sort(), warnings: [
      ...(unsupported.length ? ['Some Director decisions require manual copy editing and were not compiled.'] : []),
      ...(missingDependencies.size ? [`Operations with unavailable dependencies will be skipped: ${[...missingDependencies].sort().join(', ')}.`] : []),
    ], conflicts } };
}

function orderByDependencies(operations: readonly EditOperation[]): EditOperation[] {
  const remaining = [...operations]; const ordered: EditOperation[] = []; const known = new Set(operations.map((item) => item.id)); const completed = new Set<string>();
  const compare = (a: EditOperation, b: EditOperation) => priorityRank[b.priority] - priorityRank[a.priority] || (a.sceneId ?? '').localeCompare(b.sceneId ?? '') || a.type.localeCompare(b.type) || a.id.localeCompare(b.id);
  while (remaining.length) {
    const ready = remaining.filter((operation) => operation.dependencies.filter((id) => known.has(id)).every((id) => completed.has(id))).sort(compare);
    if (!ready.length) return [...ordered, ...remaining.sort(compare)];
    for (const operation of ready) { ordered.push(operation); completed.add(operation.id); remaining.splice(remaining.indexOf(operation), 1); }
  }
  return ordered;
}

export function deriveEffectiveEditPlan(plan: EditPlan): EditPlan {
  const enabled = plan.operations.filter((operation) => operation.status !== 'disabled');
  const conflicts = detectConflicts(enabled);
  const conflictIds = new Map<string, string[]>();
  conflicts.forEach((conflict) => conflict.operationIds.forEach((operationId) => conflictIds.set(operationId, [...(conflictIds.get(operationId) ?? []), conflict.id])));
  const operations = plan.operations.map((operation) => ({ ...operation, conflicts: (conflictIds.get(operation.id) ?? []).sort() }));
  const estimatedDurationDeltaMs = enabled.reduce((total, operation) => total + numeric(operation.parameters.durationDeltaMs), 0);
  return { ...plan, operations, summary: { ...plan.summary, automaticCount: enabled.filter((operation) => operation.automaticallyApplicable).length,
    manualCount: enabled.filter((operation) => !operation.automaticallyApplicable).length,
    disabledCount: operations.length - enabled.length, estimatedDurationDeltaMs,
    estimatedScoreImpact: Math.round(enabled.reduce((total, operation) => total + operation.expectedImpact, 0) * 10) / 10 },
    diagnostics: { ...plan.diagnostics, conflicts } };
}

export function resolveEditPlanConflict(plan: EditPlan, conflictId: string, selectedOperationId: string): EditPlan {
  const effective = deriveEffectiveEditPlan(plan); const conflict = effective.diagnostics.conflicts.find((item) => item.id === conflictId);
  if (!conflict || !conflict.operationIds.includes(selectedOperationId)) throw new Error('Conflict resolution must select an operation in the active conflict.');
  return deriveEffectiveEditPlan({ ...effective, operations: effective.operations.map((operation) =>
    conflict.operationIds.includes(operation.id) && operation.id !== selectedOperationId ? { ...operation, status: 'disabled' as const } : operation) });
}

function toOperation(manifest: RenderManifest, decision: EditDecisionPlanItem, type: EditOperationType, now: string): EditOperation {
  const scene = decision.sceneId ? manifest.timeline.scenes.find((item) => item.id === decision.sceneId) : undefined;
  const parameters: Record<string, string | number | boolean | readonly string[] | null> = { durationDeltaMs: decision.estimatedDurationDeltaMs };
  if (scene && (type === 'shorten' || type === 'trim-end')) Object.assign(parameters, planAutoTrim(scene, manifest));
  if (scene && type === 'split') Object.assign(parameters, planSceneSplit(scene, manifest));
  if (scene && type === 'add-broll') Object.assign(parameters, planBroll(scene));
  if (scene && (type === 'increase-motion' || type === 'reduce-motion')) parameters.motion = type === 'reduce-motion' ? 'none' : planMotion(scene, manifest.timeline.scenes[scene.index - 1]);
  return { id: stableId('operation', `${decision.id}|${type}`), sourceDecisionId: decision.id, projectId: manifest.projectId, sceneId: decision.sceneId,
    type, priority: decision.priority, reason: decision.reason, evidence: decision.evidence, expectedImpact: decision.expectedScoreImpact,
    confidence: decision.confidence, automaticallyApplicable: decision.automaticallyApplicable && ['shorten', 'increase-motion', 'reduce-motion', 'change-transition', 'keep'].includes(type),
    requestedBy: 'director', parameters, dependencies: decision.dependencies, conflicts: [], status: 'proposed', createdAt: now };
}

function enrichPlan(input: EditingProjectInput, operations: EditOperation[], now: string): void {
  const report = input.directorReport; const manifest = input.manifest;
  if (report.sceneRanking.reorderCandidates.length && !operations.some((item) => item.type === 'reorder')) {
    const order = planReorder(report, manifest.timeline.scenes); operations.push(engineOperation(input.projectId, null, 'reorder', { order }, 'Retention and continuity ranking suggests a safer order.', now, false));
  }
  const transitions = planTransitions(manifest.timeline.scenes);
  report.retentionRiskMap.filter((risk) => risk.riskLevel === 'high' || risk.riskLevel === 'critical').forEach((risk) => {
    const scene = manifest.timeline.scenes.find((item) => risk.sceneIds.includes(item.id)); if (!scene) return;
    if (risk.causes.some((cause) => /motion|visual/i.test(cause)) && !operations.some((item) => item.sceneId === scene.id && item.type === 'increase-motion'))
      operations.push(engineOperation(input.projectId, scene.id, 'increase-motion', { motion: planMotion(scene), durationDeltaMs: 0 }, 'Retention risk indicates low visual movement.', now, true));
  });
  transitions.forEach((transition) => { const scene = manifest.timeline.scenes.find((item) => item.id === transition.toSceneId);
    if (scene && scene.transition.type !== transition.type && !operations.some((item) => item.sceneId === scene.id && item.type === 'change-transition'))
      operations.push(engineOperation(input.projectId, scene.id, 'change-transition', { transition: transition.type, transitionDurationMs: transition.durationMs, durationDeltaMs: 0 }, 'Continuity-aware transition adjustment.', now, true)); });
}

function engineOperation(projectId: string, sceneId: string | null, type: EditOperationType, parameters: EditOperation['parameters'], reason: string, now: string, automatic: boolean): EditOperation {
  return { id: stableId('operation', `${projectId}|${sceneId}|${type}`), sourceDecisionId: null, projectId, sceneId, type, priority: 'medium', reason, evidence: [reason], expectedImpact: 5,
    confidence: 75, automaticallyApplicable: automatic, requestedBy: 'editing-engine', parameters, dependencies: [], conflicts: [], status: 'proposed', createdAt: now };
}

export function detectConflicts(operations: readonly EditOperation[]): EditOperationConflict[] {
  const conflicts: EditOperationConflict[] = []; const pairs: readonly [EditOperationType, EditOperationType][] = [['remove', 'shorten'], ['remove', 'split'], ['remove', 'reorder'], ['increase-motion', 'reduce-motion']];
  for (const [leftType, rightType] of pairs) for (const left of operations.filter((item) => item.type === leftType)) for (const right of operations.filter((item) => item.sceneId === left.sceneId && item.type === rightType))
    conflicts.push({ id: stableId('conflict', `${left.id}|${right.id}`), operationIds: [left.id, right.id].sort(), sceneId: left.sceneId, severity: leftType === 'remove' ? 'critical' : 'warning', reason: `${leftType} conflicts with ${rightType} on the same scene.`, resolved: false });
  return conflicts.sort((a, b) => a.id.localeCompare(b.id));
}
function numeric(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) ? value : 0; }
function assertIdentity(input: EditingProjectInput): void { if (input.projectId !== input.manifest.projectId || input.projectId !== input.directorReport.projectId) throw new Error('Editing project, manifest and Director report identities must match.'); }
