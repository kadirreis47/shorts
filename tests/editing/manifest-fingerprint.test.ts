import { beforeEach, describe, expect, it } from 'vitest';
import { MANIFEST_FINGERPRINT_VERSION, createEditingEngine, createManifestRevisionId, createTimelineSnapshot, isTimelineSnapshotCurrent } from '@/core/editing';
import { TypedEventBus, type ApplicationEventMap } from '@/core/events';
import { applyActiveEditPlan, configureEditingController, undoActiveEdit } from '@/services/editingController';
import { createEditingApplicationService } from '@/services/editingApplicationService';
import { createEditingMonitor } from '@/services/editingMonitor';
import { useEditingStore } from '@/store/editingStore';
import { useMediaStore } from '@/store/mediaStore';
import { editingFixture } from './fixtures';

type FixtureManifest = Awaited<ReturnType<typeof editingFixture>>['manifest'];

describe('complete editable manifest fingerprint', () => {
  it.each([
    ['subtitle word timing', (manifest: FixtureManifest) => { manifest.subtitles.words[0].startMs += 1; }],
    ['subtitle word text', (manifest: FixtureManifest) => { manifest.subtitles.words[0].text += '!'; }],
    ['audio automation', (manifest: FixtureManifest) => { manifest.audio.automation[0].gain -= 0.1; }],
    ['asset metadata', (manifest: FixtureManifest) => { ensureAsset(manifest).metadata = { ...ensureAsset(manifest).metadata, editorialLabel: 'updated' }; }],
    ['clip duration', (manifest: FixtureManifest) => { manifest.timeline.tracks[0].clips[0].durationMs -= 1; }],
    ['track state', (manifest: FixtureManifest) => { manifest.timeline.tracks[0].muted = !manifest.timeline.tracks[0].muted; }],
    ['clip metadata', (manifest: FixtureManifest) => { manifest.timeline.tracks[0].clips[0].metadata = { edit: 'new' }; }],
    ['render setting', (manifest: FixtureManifest) => { manifest.render.width += 2; }],
    ['global music', (manifest: FixtureManifest) => { manifest.audio.music[0].gain -= 0.1; }],
    ['subtitle presentation', (manifest: FixtureManifest) => { manifest.subtitles.style.fontSize += 1; }],
  ] as const)('changes when %s changes', async (_name, mutate) => {
    const { manifest } = await editingFixture(); const changed = structuredClone(manifest); mutate(changed);
    expect(createManifestRevisionId(changed)).not.toBe(createManifestRevisionId(manifest));
  });

  it('ignores object key insertion order', async () => {
    const { manifest } = await editingFixture(); const left = structuredClone(manifest); const right = structuredClone(manifest);
    ensureAsset(left).metadata = { alpha: 1, beta: 2 }; ensureAsset(right).metadata = { beta: 2, alpha: 1 };
    expect(createManifestRevisionId(left)).toBe(createManifestRevisionId(right));
  });
  it('gives a semantic clone the same fingerprint', async () => { const { manifest } = await editingFixture(); expect(createManifestRevisionId(structuredClone(manifest))).toBe(createManifestRevisionId(manifest)); });
  it('does not stale a snapshot for top-level creation time or derived validation', async () => { const fixture = await editingFixture(); const changed = structuredClone(fixture.manifest); changed.createdAt = '2099-01-01T00:00:00.000Z'; changed.validation = fixture.validation; expect(createManifestRevisionId(changed)).toBe(createManifestRevisionId(fixture.manifest)); });
  it('rejects an older fingerprint version', async () => { const { manifest } = await editingFixture(); const snapshot = createTimelineSnapshot(manifest, createManifestRevisionId(manifest)); expect(isTimelineSnapshotCurrent({ ...snapshot, fingerprintVersion: MANIFEST_FINGERPRINT_VERSION - 1 }, manifest)).toBe(false); });
});

describe('complete fingerprint stale-apply protection', () => {
  it('rejects apply after a previously omitted field changes and preserves the active manifest', async () => {
    const fixture = await prepareController(); const changed = structuredClone(fixture.manifest); changed.audio.automation[0].gain = 0.123; useMediaStore.setState({ manifest: changed });
    await expect(applyActiveEditPlan(fixture.plan.operations.map((operation) => operation.id))).rejects.toThrow(/Stale timeline revision/);
    expect(useMediaStore.getState().manifest?.audio.automation[0].gain).toBe(0.123);
  });
  it('prevents old-version undo history from replacing current data', async () => {
    const fixture = await editingFixture(); const current = createTimelineSnapshot(fixture.manifest, createManifestRevisionId(fixture.manifest)); const old = { ...current, fingerprintVersion: MANIFEST_FINGERPRINT_VERSION - 1 };
    useMediaStore.getState().setBuildResult(fixture.project, fixture.manifest, true, undefined, fixture.validation); useEditingStore.setState({ activeProjectId: fixture.manifest.projectId, workingSnapshot: old, revisionsByProject: { [fixture.manifest.projectId]: [] } });
    expect(() => undoActiveEdit()).toThrow(/history is stale/); expect(useMediaStore.getState().manifest).toEqual(fixture.manifest);
  });
});

beforeEach(() => { useEditingStore.setState({ activeProjectId: null, currentPlan: null, currentPreview: null, workingSnapshot: null, applyStatus: 'idle', operations: [], conflicts: [], revisionsByProject: {}, staleRevisionsByProject: {}, redoByProject: {}, undoAvailable: false, redoAvailable: false, currentRevisionId: null, lastError: null, lastAppliedAt: null }); useMediaStore.getState().clearMediaProject(); });

async function prepareController() { const fixture = await editingFixture(); const bus = new TypedEventBus<ApplicationEventMap>(); const service = createEditingApplicationService(createEditingEngine(), bus); const monitor = createEditingMonitor(bus); monitor.start(); configureEditingController(service); useMediaStore.getState().setBuildResult(fixture.project, fixture.manifest, true, undefined, fixture.validation); const snapshot = createTimelineSnapshot(fixture.manifest, createManifestRevisionId(fixture.manifest)); const { plan } = await service.createPlan(fixture.report, fixture.manifest, snapshot); useEditingStore.getState().setWorkingSnapshot(snapshot); const preview = await service.createPreview(plan, snapshot); useEditingStore.getState().planCompleted(plan); useEditingStore.getState().previewCreated(preview); monitor.stop(); return { ...fixture, plan }; }
function ensureAsset(manifest: FixtureManifest) { const existing = manifest.assets[0]; if (existing) return existing; const asset: FixtureManifest['assets'][number] = { id: 'fingerprint-asset', type: 'image', source: 'fixture.png', metadata: {} }; manifest.assets.push(asset); return asset; }
