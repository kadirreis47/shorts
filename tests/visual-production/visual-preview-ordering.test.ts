import { afterEach, describe, expect, it, vi } from 'vitest';
import { createManifestRevisionId, createTimelineSnapshot } from '@/core/editing';
import { createVisualAnalysisRequestIdentity, createVisualProductionEngine, visualApprovalSignature } from '@/core/visual-production';
import { applyActiveVisualPlan, configureVisualProductionController, refreshVisualPreview } from '@/services/visualProductionController';
import type { VisualProductionApplicationService } from '@/services/visualProductionApplicationService';
import { useMediaStore } from '@/store/mediaStore';
import { useVisualProductionStore } from '@/store/visualProductionStore';
import { editingFixture } from '../editing/fixtures';

afterEach(() => { configureVisualProductionController(null); useMediaStore.setState(useMediaStore.getInitialState(), true); useVisualProductionStore.setState(useVisualProductionStore.getInitialState(), true); });

async function setup() { const base = await editingFixture(); const manifest = structuredClone(base.manifest); manifest.assets.push({ id: 'preview-asset', type: 'video', source: 'preview.mp4', metadata: { brightness: .1 } }); const scene = manifest.timeline.scenes[0]; scene.assetIds = ['preview-asset']; manifest.timeline.tracks.find((track) => track.type === 'video')!.clips.push({ id: 'preview-clip', sceneId: scene.id, assetId: 'preview-asset', startMs: scene.startMs, endMs: scene.endMs, durationMs: scene.durationMs, offsetMs: 0, metadata: {} }); useMediaStore.getState().setBuildResult(base.project, manifest, base.renderReady, base.assetResolution, base.validation); const installed = useMediaStore.getState().manifest!; const snapshot = createTimelineSnapshot(installed, createManifestRevisionId(installed)); const engine = createVisualProductionEngine(); const plan = engine.analyze({ manifest: installed, snapshot }); const operation = plan.operations.find((item) => item.type === 'brightness')!; useVisualProductionStore.getState().replace(snapshot); const analysisRequest = createVisualAnalysisRequestIdentity(snapshot, 1); useVisualProductionStore.getState().start(analysisRequest); useVisualProductionStore.getState().complete(analysisRequest, plan, snapshot); return { engine, plan, snapshot, operation, manifest: installed }; }
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; }
function service(createPreview: VisualProductionApplicationService['createPreview'], apply: VisualProductionApplicationService['apply'] = async () => { throw new Error('not used'); }): VisualProductionApplicationService { return { async createPlan() { throw new Error('not used'); }, createPreview, apply, async revisionCompleted() {} }; }

describe('visual preview latest-request-wins lifecycle', () => {
  it('keeps preview B when A completes after the newer approval request', async () => {
    const state = await setup(); const waits = [deferred<ReturnType<typeof state.engine.preview>>(), deferred<ReturnType<typeof state.engine.preview>>()]; const signals: AbortSignal[] = []; let call = 0;
    configureVisualProductionController(service(async (_plan, _snapshot, _ids, signal) => { signals.push(signal!); return waits[call++].promise; }));
    const requestA = refreshVisualPreview();
    useVisualProductionStore.getState().approve(state.operation.id, true);
    const requestB = refreshVisualPreview();
    waits[1].resolve(state.engine.preview(state.plan, state.snapshot, [state.operation.id]));
    await expect(requestB).resolves.toBe(true);
    waits[0].resolve(state.engine.preview(state.plan, state.snapshot, []));
    await expect(requestA).resolves.toBe(false);
    expect(signals[0].aborted).toBe(true);
    expect(useVisualProductionStore.getState().preview?.approvalSignature).toBe(visualApprovalSignature([state.operation.id]));
    expect(useVisualProductionStore.getState().preview?.operationCount).toBe(1);
    expect(useVisualProductionStore.getState().previewStatus).toBe('ready');
  });

  it('ignores a stale request error without replacing the newest preview or error state', async () => {
    const state = await setup(); const waits = [deferred<ReturnType<typeof state.engine.preview>>(), deferred<ReturnType<typeof state.engine.preview>>()]; let call = 0;
    configureVisualProductionController(service(async () => waits[call++].promise));
    const requestA = refreshVisualPreview(); useVisualProductionStore.getState().approve(state.operation.id, true); const requestB = refreshVisualPreview();
    waits[1].resolve(state.engine.preview(state.plan, state.snapshot, [state.operation.id])); await requestB;
    waits[0].reject(new Error('old failure')); await expect(requestA).resolves.toBe(false);
    expect(useVisualProductionStore.getState().error).toBeNull(); expect(useVisualProductionStore.getState().previewStatus).toBe('ready');
  });

  it('rejects completion after plan state or manifest revision changes', async () => {
    const state = await setup(); const planWait = deferred<ReturnType<typeof state.engine.preview>>(); configureVisualProductionController(service(async () => planWait.promise)); const planRequest = refreshVisualPreview();
    useVisualProductionStore.getState().toggle(state.operation.id, false); planWait.resolve(state.engine.preview(state.plan, state.snapshot, [])); await expect(planRequest).resolves.toBe(false); expect(useVisualProductionStore.getState().preview).toBeNull();
    useVisualProductionStore.getState().toggle(state.operation.id, true); const manifestWait = deferred<ReturnType<typeof state.engine.preview>>(); configureVisualProductionController(service(async () => manifestWait.promise)); const manifestRequest = refreshVisualPreview(); const changed = structuredClone(state.manifest); changed.timeline.scenes[0].text += ' changed'; useMediaStore.getState().replaceEditedManifest(changed); manifestWait.resolve(state.engine.preview(useVisualProductionStore.getState().plan!, state.snapshot, [])); await expect(manifestRequest).rejects.toThrow(/project changed/i); expect(useVisualProductionStore.getState().preview).toBeNull();
  });

  it('keeps apply disabled at the controller boundary until the newest approval-bound preview completes', async () => {
    const state = await setup(); const wait = deferred<ReturnType<typeof state.engine.preview>>(); const apply = vi.fn(async () => { throw new Error('must not run'); }); configureVisualProductionController(service(async () => wait.promise, apply)); useVisualProductionStore.getState().approve(state.operation.id, true); const refreshing = refreshVisualPreview();
    await expect(applyActiveVisualPlan()).rejects.toThrow(/Wait for the latest preview/); expect(apply).not.toHaveBeenCalled();
    wait.resolve(state.engine.preview(state.plan, state.snapshot, [state.operation.id])); await refreshing; expect(useVisualProductionStore.getState().isPreviewCurrent()).toBe(true);
  });
});
