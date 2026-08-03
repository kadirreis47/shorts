import { beforeEach, describe, expect, it } from 'vitest';
import {
  compileEditPlan,
  createManifestRevisionId,
  createTimelineSnapshot,
  deriveEffectiveEditPlan,
  transformTimeline,
  type EditOperation,
} from '@/core/editing';
import { useEditingStore } from '@/store/editingStore';
import { editingFixture } from './fixtures';

describe('editing revision integrity', () => {
  it('produces different revision IDs for different output manifests from the same parent and operation ID', async () => {
    const fixture = await editingFixture(); const base = setup(fixture); const scene = fixture.manifest.timeline.scenes[1];
    const first = transformTimeline(base.snapshot, planWith(base.plan, operation(fixture.manifest.projectId, scene.id, scene.endMs - 500)), ['same-operation']);
    const second = transformTimeline(base.snapshot, planWith(base.plan, operation(fixture.manifest.projectId, scene.id, scene.endMs - 1_000)), ['same-operation']);
    expect(first.snapshot.manifestFingerprint).not.toBe(second.snapshot.manifestFingerprint);
    expect(first.snapshot.revisionId).not.toBe(second.snapshot.revisionId);
  });

  it('refuses a corrupted undo target without mutating history', async () => {
    const fixture = await editingFixture(); const base = setup(fixture); const result = transformTimeline(base.snapshot, planWith(base.plan, operation(fixture.manifest.projectId, fixture.manifest.timeline.scenes[1].id, fixture.manifest.timeline.scenes[1].endMs - 500)), ['same-operation']);
    const corrupt = structuredClone(base.snapshot); corrupt.manifest.timeline.scenes[0].text = 'corrupt';
    const revisions = [revision(corrupt), revision(result.snapshot)];
    useEditingStore.setState({ activeProjectId: fixture.manifest.projectId, workingSnapshot: result.snapshot, revisionsByProject: { [fixture.manifest.projectId]: revisions }, undoAvailable: true });
    expect(useEditingStore.getState().undo()).toBeNull();
    expect(useEditingStore.getState().workingSnapshot).toEqual(result.snapshot);
    expect(useEditingStore.getState().revisionsByProject[fixture.manifest.projectId]).toHaveLength(1);
    expect(useEditingStore.getState().staleRevisionsByProject[fixture.manifest.projectId]).toContainEqual(revisions[0]);
    expect(useEditingStore.getState().undoAvailable).toBe(false);
  });
});

describe('editing structural consistency', () => {
  it('rebuilds start/end markers for every split child', async () => {
    const fixture = await editingFixture(); const base = setup(fixture); const scene = fixture.manifest.timeline.scenes[1];
    const split: EditOperation = { ...operation(fixture.manifest.projectId, scene.id, scene.endMs - 500), type: 'split', parameters: { splitAtMs: scene.startMs + scene.durationMs / 2, childSceneIds: ['child-a', 'child-b'] } };
    const result = transformTimeline(base.snapshot, planWith(base.plan, split), [split.id]);
    for (const id of ['child-a', 'child-b']) expect(result.snapshot.manifest.timeline.markers.filter((marker) => marker.sceneId === id && (marker.type === 'scene-start' || marker.type === 'scene-end')).map((marker) => marker.type).sort()).toEqual(['scene-end', 'scene-start']);
  });

  it('creates a transition marker and synchronizes video clip metadata after a transition edit', async () => {
    const fixture = await editingFixture(); const base = setup(fixture); const scene = fixture.manifest.timeline.scenes[1];
    const change: EditOperation = { ...operation(fixture.manifest.projectId, scene.id, scene.endMs), type: 'change-transition', parameters: { transition: 'crossfade', transitionDurationMs: 600 } };
    const result = transformTimeline(base.snapshot, planWith(base.plan, change), [change.id]); const edited = result.snapshot.manifest;
    expect(edited.timeline.markers.some((marker) => marker.sceneId === scene.id && marker.type === 'transition')).toBe(true);
    expect(edited.timeline.tracks.find((track) => track.type === 'video')?.clips.find((clip) => clip.sceneId === scene.id)?.metadata.transition).toEqual(edited.timeline.scenes[1].transition);
  });

  it('skips an operation when its required operation is not selected', async () => {
    const fixture = await editingFixture(); const base = setup(fixture); const scene = fixture.manifest.timeline.scenes[1];
    const prerequisite = { ...operation(fixture.manifest.projectId, scene.id, scene.endMs - 300), id: 'prerequisite' };
    const dependent = { ...operation(fixture.manifest.projectId, scene.id, scene.endMs - 800), id: 'dependent', dependencies: ['prerequisite'] };
    const result = transformTimeline(base.snapshot, deriveEffectiveEditPlan({ ...base.plan, operations: [prerequisite, dependent] }), ['dependent']);
    expect(result.applied).toEqual([]); expect(result.skipped).toContain('dependent');
  });
});

beforeEach(() => useEditingStore.setState({ activeProjectId: null, currentPlan: null, currentPreview: null, workingSnapshot: null, applyStatus: 'idle', operations: [], conflicts: [], revisionsByProject: {}, staleRevisionsByProject: {}, redoByProject: {}, undoAvailable: false, redoAvailable: false, currentRevisionId: null, lastError: null, lastAppliedAt: null }));

function setup(fixture: Awaited<ReturnType<typeof editingFixture>>) { const revisionId = createManifestRevisionId(fixture.manifest); const snapshot = createTimelineSnapshot(fixture.manifest, revisionId); const plan = compileEditPlan({ projectId: fixture.manifest.projectId, manifest: fixture.manifest, directorReport: fixture.report, revisionId }); return { snapshot, plan }; }
function operation(projectId: string, sceneId: string, proposedEndMs: number): EditOperation { return { id: 'same-operation', sourceDecisionId: null, projectId, sceneId, type: 'shorten', priority: 'high', reason: 'quality audit', evidence: [], expectedImpact: 1, confidence: 90, automaticallyApplicable: true, requestedBy: 'user', parameters: { proposedEndMs }, dependencies: [], conflicts: [], status: 'proposed', createdAt: '2026-01-01T00:00:00.000Z' }; }
function planWith(plan: ReturnType<typeof compileEditPlan>, item: EditOperation) { return deriveEffectiveEditPlan({ ...plan, operations: [item] }); }
function revision(snapshot: ReturnType<typeof createTimelineSnapshot>) { return { id: snapshot.revisionId, projectId: snapshot.projectId, parentRevisionId: snapshot.parentRevisionId, createdAt: snapshot.createdAt, operationIds: [], snapshot }; }
