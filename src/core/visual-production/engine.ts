import { createManifestRevisionId, createTimelineSnapshot, MANIFEST_FINGERPRINT_VERSION, type TimelineRevision, type TimelineSnapshot } from '@/core/editing';
import { canonicalSerialize } from '@/core/editing/manifestFingerprint';
import { deepClone, stableId } from '@/core/editing/utils';
import { analyzeBroll, analyzeScenes, planGrade, scores } from './analyzers';
import { getVisualOperationCapability } from './capabilities';
import { resolveColorGrade } from './colorGradeProfiles';
import { getSceneVideoClips, resolveAssetReferenceSceneIds, resolveVisualRerenderSceneIds } from './visualState';
import { visualApprovalSignature, visualPlanSignature } from './previewIdentity';
import type { VisualColorGradeEstimate, VisualExposureEstimate, VisualOperation, VisualOperationResult, VisualOperationType, VisualProductionEngine, VisualProductionPlan, VisualProductionPreview, VisualProductionResult, VisualRecommendation, VisualSceneAnalysis } from './types';

const EXPOSURE_LOW = .22;
const EXPOSURE_HIGH = .86;
const MIN_EXPOSURE_DELTA = .04;
const MAX_EXPOSURE_DELTA = .15;

export function createVisualProductionEngine(): VisualProductionEngine {
  return {
    analyze(input, signal) {
      const { manifest, snapshot } = input;
      if (snapshot.projectId !== manifest.projectId || snapshot.manifestFingerprint !== createManifestRevisionId(manifest)) throw new Error('Stale visual analysis snapshot.');
      const scenes = analyzeScenes(manifest, signal);
      const colorGrade = planGrade(scenes, manifest);
      const recommendations: VisualRecommendation[] = [];
      const operations: VisualOperation[] = [];
      for (const scene of scenes) {
        for (const metric of ['composition', 'motion', 'continuity', 'quality', 'hook', 'readability'] as const) {
          if (scene[metric] >= 72 || (metric === 'motion' && !scene.risks.includes('unstable-motion'))) continue;
          const type = operationFor(metric, scene.risks);
          const id = stableId('visual-rec', `${manifest.projectId}|${scene.sceneId}|${metric}|${scene[metric]}`);
          const reason = operationReason(metric, scene, type);
          const expectedImpact = Math.min(20, Math.round((72 - scene[metric]) * .45));
          recommendations.push({ id, sceneId: scene.sceneId, metric, priority: scene[metric] < 40 ? 'critical' : scene[metric] < 58 ? 'high' : 'medium', title: `Apply ${type.replace('-', ' ')}`, explanation: reason, expectedImpact });
          operations.push(createOperation(id, scene, type, reason, expectedImpact, colorGrade));
        }
      }
      const broll = analyzeBroll(manifest, scenes);
      for (const item of broll) {
        const type: VisualOperationType = 'overlay';
        const id = stableId('visual-op', `${manifest.projectId}|${item.sceneId}|broll|${item.mode}`);
        operations.push({ id, sceneId: item.sceneId, type, scope: 'scene', support: getVisualOperationCapability(type).support, reason: item.reason, parameters: { mode: item.mode, strength: .25 }, expectedImpact: 8, automaticallyApplicable: false, status: 'proposed' });
      }
      const createdAt = manifest.metadata.updatedAt || manifest.createdAt;
      const base = `${snapshot.revisionId}|${input.platform ?? 'generic'}|${canonicalSerialize(scenes)}`;
      return { id: stableId('visual-plan', base), version: '1.0', projectId: manifest.projectId, sourceRevisionId: snapshot.revisionId, sourceManifestFingerprint: snapshot.manifestFingerprint, createdAt, platform: input.platform ?? 'generic', scores: scores(scenes), scenes, broll, colorGrade, recommendations, operations: dedupe(operations) };
    },
    preview(plan, snapshot, approved, signal) {
      if (signal?.aborted) throw abortError();
      validateSource(plan, snapshot);
      const result = transform(plan, snapshot, approved);
      const affectedScenes = result.changedSceneIds;
      const rerenderSceneIds = resolveVisualRerenderSceneIds(result.snapshot.manifest, affectedScenes);
      const all = snapshot.manifest.timeline.scenes.map((scene) => scene.id);
      const planned = result.operationResults.filter((item) => item.status === 'planned-only');
      const rejected = result.operationResults.filter((item) => item.status === 'rejected');
      return { id: previewId(plan, snapshot, approved, result.snapshot), projectId: plan.projectId, planId: plan.id, planSignature: visualPlanSignature(plan), sourceRevisionId: snapshot.revisionId, sourceManifestFingerprint: snapshot.manifestFingerprint, approvalSignature: visualApprovalSignature(approved), approvedOperationIds: [...new Set(approved)].sort(), operationCount: result.applied.length, affectedScenes, estimatedScore: Math.min(100, plan.scores.overall + result.applied.reduce((sum, id) => sum + (plan.operations.find((item) => item.id === id)?.expectedImpact ?? 0), 0)), rerenderSceneIds, reusableSceneIds: all.filter((id) => !rerenderSceneIds.includes(id)), operationResults: result.operationResults, exposureEstimates: result.exposureEstimates, colorGradeEstimates: result.colorGradeEstimates, warnings: diagnostics(approved, planned, rejected), proposedSnapshot: result.snapshot };
    },
    apply(plan, preview, snapshot, approved) {
      const expected = this.preview(plan, snapshot, approved);
      if (preview.id !== expected.id || canonicalSerialize(preview.operationResults) !== canonicalSerialize(expected.operationResults)) throw new Error('A current visual preview for the exact approved operations and capabilities is required before apply.');
      const result = transform(plan, snapshot, approved);
      return { projectId: plan.projectId, appliedOperationIds: result.applied, skippedOperationIds: result.operationResults.filter((item) => item.status !== 'applied').map((item) => item.operationId), operationResults: result.operationResults, previousRevision: revision(snapshot, []), revision: revision(result.snapshot, result.applied) };
    },
  };
}

function createOperation(sourceId: string, scene: VisualSceneAnalysis, type: VisualOperationType, reason: string, expectedImpact: number, colorGrade: VisualProductionPlan['colorGrade']): VisualOperation { const capability = getVisualOperationCapability(type); return { id: stableId('visual-op', `${sourceId}|${type}`), sceneId: scene.sceneId, type, scope: 'scene', support: capability.support, reason, parameters: operationParameters(type, scene, colorGrade), expectedImpact, automaticallyApplicable: false, status: 'proposed' }; }
function transform(plan: VisualProductionPlan, snapshot: TimelineSnapshot, approved: readonly string[]) { validateSource(plan, snapshot); const manifest = deepClone(snapshot.manifest); const allowed = new Set(approved); const applied: string[] = []; const changedSceneIds = new Set<string>(); const operationResults: VisualOperationResult[] = []; const exposureEstimates: VisualExposureEstimate[] = []; const colorGradeEstimates: VisualColorGradeEstimate[] = [];
  for (const operation of plan.operations) { const capability = getVisualOperationCapability(operation.type); if (operation.status === 'disabled') { operationResults.push(result(operation, 'rejected', 'Operation is disabled.')); continue; } if (!allowed.has(operation.id)) { operationResults.push(result(operation, 'skipped', 'Operation has no explicit approval.')); continue; } if (capability.support === 'planned-only') { operationResults.push(result(operation, 'planned-only', capability.diagnostic)); continue; } if (capability.support === 'unsupported' || !capability.renderEffect) { operationResults.push(result(operation, 'rejected', capability.diagnostic)); continue; } if (operation.type === 'color-grade' && !resolveColorGrade(operation.parameters.style, operation.parameters.intensity)) { operationResults.push(result(operation, 'rejected', 'Unknown color-grade profile; no render effect was produced.')); continue; } const scene = manifest.timeline.scenes.find((item) => item.id === operation.sceneId); if (!scene) { operationResults.push(result(operation, 'rejected', 'Target scene no longer exists.')); continue; } const assets = scene.assetIds.map((id) => manifest.assets.find((item) => item.id === id)).filter((asset): asset is NonNullable<typeof asset> => Boolean(asset)); if (requiresAsset(operation.type) && !assets.length) { operationResults.push(result(operation, 'rejected', 'Operation requires a resolved scene asset.')); continue; }
    let changed = false;
    if (operation.type === 'zoom' || operation.type === 'slow-zoom') { changed = scene.cameraMotion !== 'zoom_in'; scene.cameraMotion = 'zoom_in'; }
    else if (operation.type === 'stabilize') { changed = scene.cameraMotion !== 'none'; scene.cameraMotion = 'none'; }
    const scopedSceneIds = operation.scope === 'asset-global' ? resolveAssetReferenceSceneIds(manifest, assets.map((asset) => asset.id)) : [scene.id];
    if (filterBacked(operation.type)) for (const scopedSceneId of scopedSceneIds) { const clips = getSceneVideoClips(manifest, scopedSceneId).filter((clip) => !clip.assetId || assets.some((asset) => asset.id === clip.assetId)); for (const clip of clips) { const beforeVisual = canonicalSerialize(clip.metadata.visualProduction); const visualProduction = mergeVisual(clip.metadata.visualProduction, operation); changed ||= canonicalSerialize(visualProduction) !== beforeVisual; clip.metadata = { ...clip.metadata, visualProduction }; } if (clips.length && operation.type === 'brightness') { const sourceAsset = assets.find((asset) => manifest.timeline.scenes.find((candidate) => candidate.id === scopedSceneId)?.assetIds.includes(asset.id)); const before = normalized(sourceAsset?.metadata.brightness, .5); const delta = numeric(operation.parameters.delta); const after = round(clamp(before + delta, 0, 1)); exposureEstimates.push({ sceneId: scopedSceneId, operationId: operation.id, before, after, delta }); } }
    if (changed && operation.type === 'color-grade') { const grade = resolveColorGrade(operation.parameters.style, operation.parameters.intensity)!; colorGradeEstimates.push({ sceneId: scene.id, operationId: operation.id, style: grade.style, intensity: grade.intensity, before: { brightness: 0, contrast: 1, saturation: 1, gamma: 1 }, after: { brightness: grade.brightness, contrast: grade.contrast, saturation: grade.saturation, gamma: grade.gamma } }); }
    if (!changed) { operationResults.push(result(operation, 'rejected', 'Operation would not change current manifest or render behavior.')); continue; }
    scopedSceneIds.forEach((id) => changedSceneIds.add(id)); applied.push(operation.id); operationResults.push(result(operation, 'applied', capability.diagnostic));
  }
  if (!applied.length) return { snapshot, applied, changedSceneIds: [] as string[], operationResults, exposureEstimates, colorGradeEstimates };
  manifest.validation = null; const fingerprint = createManifestRevisionId(manifest); const revisionId = stableId('revision', `${snapshot.revisionId}|visual|${applied.join('|')}|${fingerprint}`); return { snapshot: createTimelineSnapshot(manifest, revisionId, snapshot.revisionId, plan.createdAt), applied, changedSceneIds: [...changedSceneIds].sort(), operationResults, exposureEstimates, colorGradeEstimates };
}
function operationParameters(type: VisualOperationType, scene: VisualSceneAnalysis, colorGrade: VisualProductionPlan['colorGrade']): Record<string, string | number | boolean> { if (type === 'brightness') { const exposure = scene.evidence.find((item) => item.rule === 'exposure'); const value = typeof exposure?.value === 'number' ? exposure.value : .5; return { delta: exposureDelta(value), sourceBrightness: value, targetRangeLow: EXPOSURE_LOW, targetRangeHigh: EXPOSURE_HIGH }; } if (type === 'contrast') return { factor: 1.08 }; if (type === 'stabilize') { const evidence = scene.evidence.find((item) => item.rule === 'motion-stability'); return { strength: .7, instabilitySignal: typeof evidence?.value === 'number' ? evidence.value : 0 }; } if (type === 'reframe') return { anchorX: .5, anchorY: .38, safeMargin: .08 }; if (type === 'color-grade') return { style: colorGrade.style, intensity: colorGrade.intensity }; if (type === 'background-blur') return { radius: 8, subtitleProtection: true }; return { scale: 1.08, durationRatio: 1 }; }
export function exposureDelta(brightness: number): number { const safe = clamp(brightness, 0, 1); if (safe < EXPOSURE_LOW) return round(clamp(MIN_EXPOSURE_DELTA + (EXPOSURE_LOW - safe) * .25, MIN_EXPOSURE_DELTA, MAX_EXPOSURE_DELTA)); if (safe > EXPOSURE_HIGH) return -round(clamp(MIN_EXPOSURE_DELTA + (safe - EXPOSURE_HIGH) * .25, MIN_EXPOSURE_DELTA, MAX_EXPOSURE_DELTA)); return 0; }
function operationFor(metric: string, risks: readonly string[]): VisualOperationType { if (metric === 'composition') return 'reframe'; if (metric === 'motion') return 'stabilize'; if (metric === 'continuity') return 'color-grade'; if (metric === 'readability') return 'background-blur'; if (metric === 'hook') return 'slow-zoom'; if (risks.includes('under-exposure') || risks.includes('over-exposure')) return 'brightness'; return 'contrast'; }
function operationReason(metric: string, scene: VisualSceneAnalysis, type: VisualOperationType): string { if (type === 'brightness') { const exposure = scene.evidence.find((item) => item.rule === 'exposure'); const value = typeof exposure?.value === 'number' ? exposure.value : .5; const delta = exposureDelta(value); return `${value < EXPOSURE_LOW ? 'Under-exposure' : 'Over-exposure'} at normalized brightness ${value.toFixed(2)} requires a ${delta > 0 ? 'positive' : 'negative'} ${Math.abs(delta).toFixed(3)} FFmpeg brightness delta toward the safe ${EXPOSURE_LOW}–${EXPOSURE_HIGH} range.`; } if (type === 'stabilize') { const evidence = scene.evidence.find((item) => item.rule === 'motion-stability'); return `Declared shake ${String(evidence?.value ?? 'unknown')} exceeds the stable-motion threshold and can be replaced by the supported static camera contract.`; } return `${metric} score ${scene[metric as keyof VisualSceneAnalysis]} is below the explainable production threshold of 72.`; }
function result(operation: VisualOperation, status: VisualOperationResult['status'], diagnostic: string): VisualOperationResult { const capability = getVisualOperationCapability(operation.type); return { operationId: operation.id, sceneId: operation.sceneId, type: operation.type, scope: operation.scope, support: capability.support, status, diagnostic }; }
function diagnostics(approved: readonly string[], planned: readonly VisualOperationResult[], rejected: readonly VisualOperationResult[]): string[] { const messages: string[] = []; if (!approved.length) messages.push('No visual operation has explicit approval.'); for (const item of [...planned, ...rejected]) messages.push(`${item.type} for ${item.sceneId}: ${item.diagnostic}`); return messages; }
function previewId(plan: VisualProductionPlan, source: TimelineSnapshot, approved: readonly string[], proposed: TimelineSnapshot): string { const capabilities = plan.operations.map((item) => `${item.id}:${getVisualOperationCapability(item.type).support}`).join('|'); return stableId('visual-preview', `${plan.id}|${source.revisionId}|${approved.slice().sort().join('|')}|${capabilities}|${proposed.revisionId}`); }
function mergeVisual(value: unknown, operation: VisualOperation) { const current = Array.isArray(value) ? value.filter(record) : []; return [...current.filter((item) => item.operationId !== operation.id), { operationId: operation.id, type: operation.type, scope: operation.scope, parameters: operation.parameters }].sort((left, right) => String(left.operationId).localeCompare(String(right.operationId))); }
function validateSource(plan: VisualProductionPlan, snapshot: TimelineSnapshot) { if (snapshot.projectId !== plan.projectId || snapshot.revisionId !== plan.sourceRevisionId || snapshot.manifestFingerprint !== plan.sourceManifestFingerprint || snapshot.fingerprintVersion !== MANIFEST_FINGERPRINT_VERSION || createManifestRevisionId(snapshot.manifest) !== snapshot.manifestFingerprint) throw new Error('Stale visual production plan; analyze the current manifest again.'); }
function revision(snapshot: TimelineSnapshot, operationIds: readonly string[]): TimelineRevision { return { id: snapshot.revisionId, projectId: snapshot.projectId, parentRevisionId: snapshot.parentRevisionId, createdAt: snapshot.createdAt, operationIds, snapshot }; }
function requiresAsset(type: VisualOperationType): boolean { return ['brightness', 'contrast', 'color-grade'].includes(type); }
function filterBacked(type: VisualOperationType): boolean { return ['brightness', 'contrast', 'color-grade'].includes(type); }
function dedupe(items: VisualOperation[]) { return items.filter((item, index) => items.findIndex((candidate) => candidate.sceneId === item.sceneId && candidate.type === item.type) === index); }
function numeric(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) ? value : 0; } function normalized(value: unknown, fallback: number): number { return typeof value === 'number' && Number.isFinite(value) ? clamp(value, 0, 1) : fallback; } function clamp(value: number, minimum: number, maximum: number): number { return Math.min(maximum, Math.max(minimum, value)); } function round(value: number): number { return Math.round(value * 1000) / 1000; }
function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function abortError() { const error = new Error('Visual production aborted.'); error.name = 'AbortError'; return error; }
