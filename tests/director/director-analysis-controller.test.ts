import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compileStudioProductionRecipeV1, createMediaEngine, normalizeStudioProductionRecipeV1, type AssetProviderEngine, type MediaEngine, type MediaProjectBuildResult } from '@/core/media';
import { createDirectorEngine, type DirectorEngine } from '@/core/director';
import { TypedEventBus, type ApplicationEventMap } from '@/core/events';
import { createDirectorApplicationService, createDirectorInput } from '@/services/directorApplicationService';
import { analyzeActiveDirectorProject, cancelActiveDirectorAnalysis, configureDirectorAnalysisController } from '@/services/directorAnalysisController';
import { createDirectorRequestSourceLifetimeV1, createDirectorSnapshotRequestSourceV1, type DirectorCurrentRequestSourceV1, type DirectorRequestSourceLifetimeV1 } from '@/services/directorSnapshotRequestAdapter';
import { createDirectorMonitor } from '@/services/directorMonitor';
import { useDirectorReportStore } from '@/store/directorReportStore';
import { useMediaStore } from '@/store/mediaStore';
import { createVisualSpatialEvidenceRecord, type CreateSpatialContinuityEvidenceReportInput } from '@/core/visual-intelligence';
import type { TrustedImageDisplayGeometryV1 } from '@/core/media/imageDisplayGeometry';
import type { Scene } from '@/lib/types';
import { setValidatedOwnerId } from '@/auth/identity';
import { captureValidatedMediaOwnerContext } from '@/lib/mediaStorage';

const PROJECT = 'studio-active';
const SCENES: Scene[] = [
  { sceneId: 'visual-scene-00000000-0000-4000-8000-000000000001', text: 'A fast hook.', duration: 3, visual: 'Hook' },
  { sceneId: 'visual-scene-00000000-0000-4000-8000-000000000002', text: 'The result.', duration: 4, visual: 'Result' },
];
const assetEngine: AssetProviderEngine = {
  async resolve() {
    return { assets: [], report: { resolutions: [], providerUsage: {}, cacheHits: 0, cacheMisses: 0,
      resolvedCount: 0, unresolvedCount: 2, duplicateCandidatesRejected: 0 } };
  },
  clearCache() {},
};

function visualInput(projectId = PROJECT, scenes: readonly Scene[] = SCENES): CreateSpatialContinuityEvidenceReportInput {
  return {
    projectId,
    scenes,
    appliedSpatialEvidence: {},
    trustedImageGeometry: {},
    evaluationTimeMs: 0,
    outputDimensions: { width: 1080, height: 1920 },
    compositionDefaults: { motion: 'pan', transition: 'crossfade' },
  };
}

function request(
  current: { value: DirectorCurrentRequestSourceV1 },
  recipeIdentity = 'recipe-1',
  input = visualInput(),
  lifetime?: DirectorRequestSourceLifetimeV1,
) {
  const normalized = normalizeStudioProductionRecipeV1({
    projectId: PROJECT,
    title: recipeIdentity,
    scenes: input.scenes,
    captionStyle: 'karaoke',
    transitionStyle: 'crossfade',
    motionStyle: 'pan',
    showSubtitles: true,
    captionTextColor: '',
    captionHighlightColor: '',
    voiceoverMode: 'none',
    narration: null,
    musicId: '',
    musicVolume: 0.25,
    beatSync: false,
    watermarkText: '',
    watermarkPosition: 'bottom-right',
    visualMode: 'auto',
    selectedStyleId: '',
    characterProfileId: '',
    useBroll: false,
    characterName: '',
    characterAppearance: '',
    characterArtStyle: '',
  }, captureValidatedMediaOwnerContext());
  current.value = { projectId: PROJECT, studioRecipeIdentity: normalized.identity, visualPlanningInput: input };
  return createDirectorSnapshotRequestSourceV1({
    projectId: PROJECT,
    buildInput: compileStudioProductionRecipeV1(normalized),
    studioRecipeIdentity: normalized.identity,
    visualPlanningInput: input,
    readCurrentProjectId: () => lifetime ? lifetime.read(() => current.value.projectId) : current.value.projectId,
    readCurrentSource: () => lifetime ? lifetime.read(() => current.value) : current.value,
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

describe('Director analysis controller', () => {
  let bus: TypedEventBus<ApplicationEventMap>;
  let mediaEngine: MediaEngine;
  let monitor: ReturnType<typeof createDirectorMonitor>;

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    setValidatedOwnerId('00000000-0000-4000-8000-000000000001');
    bus = new TypedEventBus<ApplicationEventMap>();
    mediaEngine = createMediaEngine(bus, assetEngine);
    monitor = createDirectorMonitor(bus);
    monitor.start();
    useMediaStore.getState().clearMediaProject();
    useDirectorReportStore.getState().reset();
    configureDirectorAnalysisController(createDirectorApplicationService(createDirectorEngine(), bus), mediaEngine);
  });
  afterEach(() => {
    monitor.stop();
    configureDirectorAnalysisController(null, null);
    setValidatedOwnerId(null);
    vi.restoreAllMocks();
  });

  it('accepts one current canonical request and stores its report once', async () => {
    const current = { value: {} as DirectorCurrentRequestSourceV1 };
    const completed = vi.fn();
    const write = vi.spyOn(useDirectorReportStore.getState(), 'analysisCompleted');
    bus.on('director:analysis-completed', completed);
    const outcome = await analyzeActiveDirectorProject(request(current));
    expect(outcome.status).toBe('accepted');
    if (outcome.status !== 'accepted') throw new Error('Expected accepted outcome.');
    expect(outcome.report.projectId).toBe(PROJECT);
    expect(outcome.report.reportVersion).toBe('2.1');
    expect(outcome.report).toHaveProperty('visualPlanningBinding');
    expect(useMediaStore.getState().manifest?.projectId).toBe(PROJECT);
    expect(useDirectorReportStore.getState().currentReport).toEqual(outcome.report);
    expect(completed).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledOnce();
    expect(write.mock.calls[0][0]).toBe(outcome.report);
  });

  it('does not install a late build after a newer request owns the generation', async () => {
    const firstBuild = deferred<MediaProjectBuildResult>();
    const secondBuild = deferred<MediaProjectBuildResult>();
    const currentA = { value: {} as DirectorCurrentRequestSourceV1 };
    const currentB = { value: {} as DirectorCurrentRequestSourceV1 };
    const sourceA = request(currentA, 'recipe-a');
    const sourceB = request(currentB, 'recipe-b');
    const realBuilds = [
      await mediaEngine.buildProject(sourceA.buildInput),
      await mediaEngine.buildProject(sourceB.buildInput),
    ];
    let call = 0;
    const gatedEngine: MediaEngine = { buildProject: () => (call++ === 0 ? firstBuild.promise : secondBuild.promise) };
    configureDirectorAnalysisController(createDirectorApplicationService(createDirectorEngine(), bus), gatedEngine);
    const setBuildResult = vi.spyOn(useMediaStore.getState(), 'setBuildResult');
    const analysisA = analyzeActiveDirectorProject(sourceA);
    const analysisB = analyzeActiveDirectorProject(sourceB);
    firstBuild.resolve(realBuilds[0]);
    const outcomeA = await analysisA;
    expect(outcomeA).toEqual({ status: 'rejected', reason: 'superseded' });
    expect(setBuildResult).not.toHaveBeenCalled();
    secondBuild.resolve(realBuilds[1]);
    const outcomeB = await analysisB;
    expect(outcomeB.status).toBe('accepted');
    expect(setBuildResult).toHaveBeenCalledTimes(1);
  });

  it('uses abort cooperatively but rejects an explicitly cancelled build by generation-owned state', async () => {
    const buildGate = deferred<MediaProjectBuildResult>();
    const built = await mediaEngine.buildProject(request({ value: {} as DirectorCurrentRequestSourceV1 }).buildInput);
    configureDirectorAnalysisController(createDirectorApplicationService(createDirectorEngine(), bus), {
      buildProject: () => buildGate.promise,
    });
    const current = { value: {} as DirectorCurrentRequestSourceV1 };
    const analysis = analyzeActiveDirectorProject(request(current));
    cancelActiveDirectorAnalysis();
    buildGate.resolve(built);
    expect(await analysis).toEqual({ status: 'rejected', reason: 'cancelled' });
    expect(useMediaStore.getState().manifest).toBeNull();
  });

  it('does not let a superseded build failure clobber the newer lifecycle', async () => {
    const firstBuild = deferred<MediaProjectBuildResult>();
    const secondBuild = deferred<MediaProjectBuildResult>();
    const sourceA = request({ value: {} as DirectorCurrentRequestSourceV1 }, 'recipe-a');
    const sourceB = request({ value: {} as DirectorCurrentRequestSourceV1 }, 'recipe-b');
    const built = await mediaEngine.buildProject(sourceB.buildInput);
    let call = 0;
    configureDirectorAnalysisController(createDirectorApplicationService(createDirectorEngine(), bus), {
      buildProject: () => (call++ === 0 ? firstBuild.promise : secondBuild.promise),
    });
    const failed = vi.fn();
    bus.on('director:analysis-failed', failed);
    const analysisA = analyzeActiveDirectorProject(sourceA);
    const analysisB = analyzeActiveDirectorProject(sourceB);
    firstBuild.reject(new Error('late build failure'));
    await expect(analysisA).rejects.toThrow('late build failure');
    expect(failed).not.toHaveBeenCalled();
    secondBuild.resolve(built);
    expect((await analysisB).status).toBe('accepted');
  });

  it('rejects a project switch before final completion admission', async () => {
    const gate = deferred<void>();
    const realDirector = createDirectorEngine();
    const delayedDirector: DirectorEngine = {
      analyze: async (input, options) => {
        await gate.promise;
        return realDirector.analyze(input, options);
      },
    };
    configureDirectorAnalysisController(createDirectorApplicationService(delayedDirector, bus), mediaEngine);
    const current = { value: {} as DirectorCurrentRequestSourceV1 };
    const analysis = analyzeActiveDirectorProject(request(current));
    await waitForAnalysisStart(analysis);
    current.value = { ...current.value, projectId: 'project-b' };
    useDirectorReportStore.getState().selectProjectReport('project-b');
    gate.resolve();
    expect(await analysis).toEqual({ status: 'rejected', reason: 'project-changed' });
    expect(useDirectorReportStore.getState().currentReport).toBeNull();
    expect(useDirectorReportStore.getState().activeProjectId).toBe('project-b');
  });

  it('rejects a canonical Recipe change while the installed manifest still matches', async () => {
    const gate = deferred<void>();
    const realDirector = createDirectorEngine();
    const delayedDirector: DirectorEngine = {
      analyze: async (input, options) => {
        await gate.promise;
        return realDirector.analyze(input, options);
      },
    };
    configureDirectorAnalysisController(createDirectorApplicationService(delayedDirector, bus), mediaEngine);
    const current = { value: {} as DirectorCurrentRequestSourceV1 };
    const analysis = analyzeActiveDirectorProject(request(current));
    await waitForAnalysisStart(analysis);
    current.value = { ...current.value, studioRecipeIdentity: `${current.value.studioRecipeIdentity}-changed` };
    gate.resolve();
    expect(await analysis).toEqual({ status: 'rejected', reason: 'manifest-stale' });
    expect(useDirectorReportStore.getState().currentReport).toBeNull();
  });

  it('rejects a Media Store manifest mutation during analyzer awaits', async () => {
    const gate = deferred<void>();
    const realDirector = createDirectorEngine();
    const delayedDirector: DirectorEngine = {
      analyze: async (input, options) => {
        await gate.promise;
        return realDirector.analyze(input, options);
      },
    };
    configureDirectorAnalysisController(createDirectorApplicationService(delayedDirector, bus), mediaEngine);
    const current = { value: {} as DirectorCurrentRequestSourceV1 };
    const analysis = analyzeActiveDirectorProject(request(current));
    await vi.waitFor(() => expect(useDirectorReportStore.getState().analysisStatus).toBe('running'));
    const changed = structuredClone(useMediaStore.getState().manifest!);
    changed.timeline.scenes[0].sourceScene.text = 'Manifest changed';
    useMediaStore.setState({ manifest: changed });
    gate.resolve();
    expect(await analysis).toEqual({ status: 'rejected', reason: 'manifest-stale' });
    expect(useDirectorReportStore.getState().currentReport).toBeNull();
  });

  it('rejects changed visual semantics before completion reaches the report store', async () => {
    const gate = deferred<void>();
    const realDirector = createDirectorEngine();
    const delayedDirector: DirectorEngine = {
      analyze: async (input, options) => {
        await gate.promise;
        return realDirector.analyze(input, options);
      },
    };
    configureDirectorAnalysisController(createDirectorApplicationService(delayedDirector, bus), mediaEngine);
    const current = { value: {} as DirectorCurrentRequestSourceV1 };
    const analysis = analyzeActiveDirectorProject(request(current));
    await vi.waitFor(() => expect(useDirectorReportStore.getState().analysisStatus).toBe('running'));
    current.value = {
      ...current.value,
      visualPlanningInput: visualInput(PROJECT, [SCENES[0], { ...SCENES[1], compositionOverride: { motion: 'static' } }]),
    };
    gate.resolve();
    expect(await analysis).toEqual({ status: 'rejected', reason: 'visual-snapshot-stale' });
    expect(useDirectorReportStore.getState().currentReport).toBeNull();
  });

  it('revalidates through the real completion monitor when state changes after first validation', async () => {
    monitor.stop();
    const current = { value: {} as DirectorCurrentRequestSourceV1 };
    const source = request(current);
    const completionDispatch = vi.fn(() => {
      current.value = { ...current.value, studioRecipeIdentity: `${current.value.studioRecipeIdentity}-changed` };
    });
    bus.on('director:analysis-completed', completionDispatch);
    monitor.start();
    const write = vi.spyOn(useDirectorReportStore.getState(), 'analysisCompleted');

    const outcome = await analyzeActiveDirectorProject(source);

    expect(completionDispatch).toHaveBeenCalledOnce();
    expect(outcome).toEqual({ status: 'rejected', reason: 'manifest-stale' });
    expect(write).not.toHaveBeenCalled();
    expect(useDirectorReportStore.getState().currentReport).toBeNull();
  });

  it('fails closed when the originating Studio source lifetime is invalidated during analysis', async () => {
    const gate = deferred<void>();
    const realDirector = createDirectorEngine();
    configureDirectorAnalysisController(createDirectorApplicationService({
      analyze: async (input, options) => { await gate.promise; return realDirector.analyze(input, options); },
    }, bus), mediaEngine);
    const lifetime = createDirectorRequestSourceLifetimeV1();
    const current = { value: {} as DirectorCurrentRequestSourceV1 };
    const analysis = analyzeActiveDirectorProject(request(current, 'unmount', visualInput(), lifetime));
    await vi.waitFor(() => expect(useDirectorReportStore.getState().analysisStatus).toBe('running'));
    lifetime.invalidate();
    gate.resolve();
    expect(await analysis).toEqual({ status: 'rejected', reason: 'source-unavailable' });
    expect(useDirectorReportStore.getState().currentReport).toBeNull();
  });

  it('does not accept when the monitor validator throws after completion dispatch begins', async () => {
    monitor.stop();
    bus.on('director:analysis-completed', () => {
      const manifest = useMediaStore.getState().manifest! as unknown as Record<string, unknown>;
      manifest.cycle = manifest;
    });
    monitor.start();
    const write = vi.spyOn(useDirectorReportStore.getState(), 'analysisCompleted');
    const current = { value: {} as DirectorCurrentRequestSourceV1 };
    await expect(analyzeActiveDirectorProject(request(current))).rejects.toThrow(/cyclic manifest/u);
    expect(write).not.toHaveBeenCalled();
    expect(useDirectorReportStore.getState().currentReport).toBeNull();
  });

  it('does not accept when the existing report-store writer throws', async () => {
    const write = vi.spyOn(useDirectorReportStore.getState(), 'analysisCompleted').mockImplementation(() => { throw new Error('store failed'); });
    const current = { value: {} as DirectorCurrentRequestSourceV1 };
    await expect(analyzeActiveDirectorProject(request(current))).rejects.toThrow('store failed');
    expect(write).toHaveBeenCalledOnce();
    expect(useDirectorReportStore.getState().currentReport).toBeNull();
  });

  it('keeps B authoritative when A finishes its analyzer after supersession', async () => {
    const enteredA = deferred<void>();
    const finishA = deferred<void>();
    const realDirector = createDirectorEngine();
    let analyzerRequest = 0;
    const delayedDirector: DirectorEngine = {
      analyze: async (input, options) => {
        if (analyzerRequest++ === 0) {
          enteredA.resolve();
          await finishA.promise;
        }
        return realDirector.analyze(input, options);
      },
    };
    configureDirectorAnalysisController(createDirectorApplicationService(delayedDirector, bus), mediaEngine);
    const completed = vi.fn(); const failed = vi.fn(); const progress = vi.fn();
    bus.on('director:analysis-completed', completed);
    bus.on('director:analysis-failed', failed);
    bus.on('director:analyzer-completed', progress);
    const currentA = { value: {} as DirectorCurrentRequestSourceV1 };
    const currentB = { value: {} as DirectorCurrentRequestSourceV1 };
    const analysisA = analyzeActiveDirectorProject(request(currentA, 'analyzer-a'));
    await enteredA.promise;
    const outcomeB = await analyzeActiveDirectorProject(request(currentB, 'analyzer-b'));
    const progressAfterB = progress.mock.calls.length;
    finishA.resolve();
    const outcomeA = await analysisA;

    expect(outcomeB.status).toBe('accepted');
    expect(outcomeA).toEqual({ status: 'rejected', reason: 'superseded' });
    expect(completed).toHaveBeenCalledOnce();
    expect(failed).not.toHaveBeenCalled();
    expect(progress).toHaveBeenCalledTimes(progressAfterB);
    if (outcomeB.status === 'accepted') expect(useDirectorReportStore.getState().currentReport).toEqual(outcomeB.report);
  });

  it('rejects spatial authority expiry at the completion boundary', async () => {
    const gate = deferred<void>();
    const realDirector = createDirectorEngine();
    configureDirectorAnalysisController(createDirectorApplicationService({
      analyze: async (input, options) => { await gate.promise; return realDirector.analyze(input, options); },
    }, bus), mediaEngine);
    const expiry = Date.parse('2098-09-06T00:00:01.000Z');
    const initial = spatialInput(`idga1_${'a'.repeat(43)}`, new Date(expiry).toISOString(), expiry - 1);
    const current = { value: {} as DirectorCurrentRequestSourceV1 };
    const analysis = analyzeActiveDirectorProject(request(current, 'expiry', initial));
    await waitForAnalysisStart(analysis);
    current.value = { ...current.value, visualPlanningInput: spatialInput(`idga1_${'a'.repeat(43)}`, new Date(expiry).toISOString(), expiry) };
    gate.resolve();
    expect(await analysis).toEqual({ status: 'rejected', reason: 'visual-snapshot-stale' });
    expect(useDirectorReportStore.getState().currentReport).toBeNull();
  });

  it('accepts equivalent opaque reauthorization during analysis', async () => {
    const gate = deferred<void>();
    const realDirector = createDirectorEngine();
    configureDirectorAnalysisController(createDirectorApplicationService({
      analyze: async (input, options) => { await gate.promise; return realDirector.analyze(input, options); },
    }, bus), mediaEngine);
    const evaluation = Date.parse('2098-09-06T00:00:00.000Z');
    const initial = spatialInput(`idga1_${'a'.repeat(43)}`, '2098-09-06T00:00:01.000Z', evaluation);
    const current = { value: {} as DirectorCurrentRequestSourceV1 };
    const analysis = analyzeActiveDirectorProject(request(current, 'reauth', initial));
    await waitForAnalysisStart(analysis);
    current.value = { ...current.value, visualPlanningInput: spatialInput(`idga1_${'b'.repeat(43)}`, '2099-01-01T00:00:00.000Z', evaluation) };
    gate.resolve();
    const outcome = await analysis;
    expect(outcome.status).toBe('accepted');
    if (outcome.status === 'accepted') expect(useDirectorReportStore.getState().currentReport).toEqual(outcome.report);
  });
});

function spatialInput(reference: string, expiresAt: string, evaluationTimeMs: number): CreateSpatialContinuityEvidenceReportInput {
  const imageScene: Scene = {
    sceneId: SCENES[0].sceneId, text: 'One', duration: 3, visual: 'One',
    imageStorage: { bucket: 'media', objectPath: '00000000-0000-4000-8000-000000000001/generated-images/00000000-0000-4000-8000-000000000002.png' },
  };
  const mediaIdentity = `media:${imageScene.imageStorage!.objectPath}`;
  const geometry: TrustedImageDisplayGeometryV1 = {
    version: 1, mediaIdentity,
    encodedDimensions: { width: 1200, height: 800 }, displayDimensions: { width: 1200, height: 800 }, encodedToDisplay: 'identity',
    contentDigest: 'a'.repeat(64), executionAuthority: { version: 1, reference, expiresAt },
  };
  imageScene.imageDisplayGeometry = geometry;
  const evidence = createVisualSpatialEvidenceRecord({
    projectId: PROJECT, sceneId: imageScene.sceneId, sceneIndex: 0, scope: 'applied-image', mediaIdentity,
  }, {
    status: 'evaluated', contractVersion: 'visual-spatial-v1', analyzerVersion: 'test', sourceDimensions: { width: 1200, height: 800 },
    focalPoint: { x: 0.5, y: 0.5 }, confidenceBand: 'medium',
  }, { mediaIdentity, contentDigest: 'a'.repeat(64), encodedDimensions: { width: 1200, height: 800 } });
  return {
    projectId: PROJECT, scenes: [imageScene], appliedSpatialEvidence: { [imageScene.sceneId]: evidence },
    trustedImageGeometry: { [imageScene.sceneId]: geometry }, evaluationTimeMs,
    outputDimensions: { width: 1080, height: 1920 }, compositionDefaults: { motion: 'pan', transition: 'crossfade' },
  };
}

async function waitForAnalysisStart(analysis: Promise<unknown>): Promise<void> {
  await Promise.race([
    vi.waitFor(() => expect(useDirectorReportStore.getState().analysisStatus).toBe('running')),
    analysis.then((outcome) => { throw new Error(`Analysis settled before start: ${JSON.stringify(outcome)}`); }),
  ]);
}
