import type { EditingApplicationService } from './editingApplicationService';
import { useDirectorReportStore } from '@/store/directorReportStore';
import { useEditingStore } from '@/store/editingStore';
import { useMediaStore } from '@/store/mediaStore';
import { validateMediaProject, type RenderManifest } from '@/core/media';
import { createManifestRevisionId, createTimelineSnapshot, isTimelineSnapshotCurrent, type TimelineSnapshot } from '@/core/editing';

let service: EditingApplicationService | null = null;
export function configureEditingController(value: EditingApplicationService | null): void { service = value; }
export async function createActiveEditPlan(signal?: AbortSignal): Promise<void> {
  if (!service) throw new Error('AI Editing service is not ready.'); const report = useDirectorReportStore.getState().currentReport; const manifest = useMediaStore.getState().manifest;
  if (!report) throw new Error('Create an AI Director report before generating an edit plan.'); if (!manifest) throw new Error('Build the active project media manifest in Studio first.'); if (report.projectId !== manifest.projectId) throw new Error('Director report and active project do not match. Run analysis again.');
  const editingStore = useEditingStore.getState(); const existing = editingStore.getCurrentSnapshot(manifest.projectId);
  const snapshot = resolveCurrentEditingSnapshot(manifest, existing); if (snapshot !== existing) editingStore.replaceWithFreshSnapshot(snapshot);
  const result = await service.createPlan(report, manifest, snapshot, signal); useEditingStore.getState().setWorkingSnapshot(result.snapshot); await service.createPreview(result.plan, result.snapshot, signal);
}
export async function applyActiveEditPlan(approvedOperationIds: readonly string[]): Promise<void> {
  if (!service) throw new Error('AI Editing service is not ready.'); const state = useEditingStore.getState(); if (!state.currentPlan || !state.currentPreview || !state.workingSnapshot) throw new Error('Create a current preview before apply.');
  const sourceSnapshot = state.workingSnapshot; const manifest = useMediaStore.getState().manifest; if (!manifest || !isTimelineSnapshotCurrent(sourceSnapshot, manifest)) throw new Error('Stale timeline revision; the active manifest changed after preview. Create a new edit plan.');
  const result = await service.apply(state.currentPlan, state.currentPreview, sourceSnapshot, approvedOperationIds);
  const latestManifest = useMediaStore.getState().manifest; if (!latestManifest || !isTimelineSnapshotCurrent(sourceSnapshot, latestManifest)) { if (latestManifest) useEditingStore.getState().replaceWithFreshSnapshot(resolveCurrentEditingSnapshot(latestManifest, null)); throw new Error('Stale timeline revision; the active manifest changed during apply.'); }
  if (result.previousRevision.id !== sourceSnapshot.revisionId) throw new Error('Stale apply result was rejected.');
  installAndValidateEditedManifest(result.revision.snapshot.manifest);
}
export async function refreshActiveEditPreview(): Promise<void> { if (!service) throw new Error('AI Editing service is not ready.'); const state = useEditingStore.getState(); if (!state.currentPlan || !state.workingSnapshot) throw new Error('Create an edit plan first.'); await service.createPreview(state.currentPlan, state.workingSnapshot); }
export function undoActiveEdit(): void { assertRevisionHistoryCurrent(); const snapshot = useEditingStore.getState().undo(); if (snapshot) installAndValidateEditedManifest(snapshot.manifest); }
export function redoActiveEdit(): void { assertRevisionHistoryCurrent(); const snapshot = useEditingStore.getState().redo(); if (snapshot) installAndValidateEditedManifest(snapshot.manifest); }

export function resolveCurrentEditingSnapshot(manifest: RenderManifest, existing: TimelineSnapshot | null): TimelineSnapshot {
  return existing && isTimelineSnapshotCurrent(existing, manifest)
    ? existing
    : createTimelineSnapshot(manifest, createManifestRevisionId(manifest));
}
function assertRevisionHistoryCurrent(): void { const manifest = useMediaStore.getState().manifest; const state = useEditingStore.getState(); if (!manifest || !state.workingSnapshot) return; if (!isTimelineSnapshotCurrent(state.workingSnapshot, manifest)) { state.replaceWithFreshSnapshot(resolveCurrentEditingSnapshot(manifest, null)); throw new Error('Undo/redo history is stale because the active manifest changed.'); } }
function installAndValidateEditedManifest(manifest: RenderManifest): void {
  const mediaStore = useMediaStore.getState(); mediaStore.replaceEditedManifest(manifest);
  const editedState = useMediaStore.getState();
  if (!editedState.project || !editedState.assetResolution) { editedState.setBuildError('Edited timeline was saved, but media validation requires the current asset resolution report. Rebuild asset resolution before rendering.'); return; }
  try {
    const validation = validateMediaProject({ project: editedState.project, manifest: { ...manifest, validation: null }, assetResolution: editedState.assetResolution });
    useMediaStore.getState().replaceValidatedManifest(manifest, validation);
  } catch (error) {
    useMediaStore.getState().setBuildError(error instanceof Error ? `Edited timeline was saved, but validation failed: ${error.message}` : 'Edited timeline was saved, but validation failed.');
  }
}
