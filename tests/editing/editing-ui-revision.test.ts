import { beforeEach, describe, expect, it } from 'vitest';
import { selectEditingWorkspaceView } from '@/components/editing/editorViewState';
import { compileEditPlan, createEditingEngine, createManifestRevisionId, createTimelineSnapshot } from '@/core/editing';
import { useEditingStore } from '@/store/editingStore';
import { editingFixture } from './fixtures';

describe('AI Editor revision workspace state', () => {
  it('keeps undo controls visible after apply clears preview', async () => { await appliedState(); const state = useEditingStore.getState(); expect(state.currentPreview).toBeNull(); expect(selectEditingWorkspaceView(state).showRevisionControls).toBe(true); expect(state.undoAvailable).toBe(true); });
  it('keeps redo controls visible after undo', async () => { await appliedState(); useEditingStore.getState().undo(); const state = useEditingStore.getState(); expect(selectEditingWorkspaceView(state).showRevisionControls).toBe(true); expect(state.redoAvailable).toBe(true); });
  it('does not enter empty state when revision history exists', async () => { await appliedState(); useEditingStore.setState({ currentPlan: null, currentPreview: null }); expect(selectEditingWorkspaceView(useEditingStore.getState()).isEmpty).toBe(false); });
  it('undoes without a plan or preview', async () => { const result = await appliedState(); useEditingStore.setState({ currentPlan: null, currentPreview: null }); expect(useEditingStore.getState().undo()?.revisionId).toBe(result.previousRevision.id); });
  it('redoes without a plan or preview', async () => { const result = await appliedState(); useEditingStore.setState({ currentPlan: null, currentPreview: null }); useEditingStore.getState().undo(); expect(useEditingStore.getState().redo()?.revisionId).toBe(result.revision.id); });
  it('shows an applied revision summary without a current plan', async () => { await appliedState(); useEditingStore.setState({ currentPlan: null, currentPreview: null }); const view = selectEditingWorkspaceView(useEditingStore.getState()); expect(view.showAppliedSummary).toBe(true); expect(view.currentRevisionId).toBeTruthy(); });
  it('shows the true empty state only without plan, preview or history', () => { expect(selectEditingWorkspaceView(useEditingStore.getState()).isEmpty).toBe(true); });
  it('does not clear undo history when a new plan starts', async () => { await appliedState(); const count = useEditingStore.getState().revisionsByProject['editing-project'].length; useEditingStore.getState().planStarted('editing-project'); expect(useEditingStore.getState().revisionsByProject['editing-project']).toHaveLength(count); expect(useEditingStore.getState().undoAvailable).toBe(true); });
  it('tracks the current revision after undo and redo', async () => { const result = await appliedState(); useEditingStore.getState().undo(); expect(selectEditingWorkspaceView(useEditingStore.getState()).currentRevisionId).toBe(result.previousRevision.id); useEditingStore.getState().redo(); expect(selectEditingWorkspaceView(useEditingStore.getState()).currentRevisionId).toBe(result.revision.id); });
});

beforeEach(() => useEditingStore.setState({ activeProjectId: null, currentPlan: null, currentPreview: null, workingSnapshot: null, applyStatus: 'idle', operations: [], conflicts: [], revisionsByProject: {}, staleRevisionsByProject: {}, redoByProject: {}, undoAvailable: false, redoAvailable: false, currentRevisionId: null, lastError: null, lastAppliedAt: null }));

async function appliedState() { const { manifest, report } = await editingFixture(); const engine = createEditingEngine(); const fingerprint = createManifestRevisionId(manifest); const snapshot = createTimelineSnapshot(manifest, fingerprint); const plan = compileEditPlan({ projectId: manifest.projectId, manifest, directorReport: report, revisionId: fingerprint }); const preview = engine.preview(plan, snapshot); const result = engine.apply(plan, preview, snapshot, plan.operations.map((operation) => operation.id)); useEditingStore.getState().applyCompleted(result); return result; }
