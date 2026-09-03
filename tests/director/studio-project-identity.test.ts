// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDirectorEngine } from '@/core/director';
import { createMediaEngine, type AssetProviderEngine } from '@/core/media';
import { TypedEventBus, type ApplicationEventMap } from '@/core/events';
import { activateStudioProject, createStudioProjectIdentity, resolveStudioProjectId, startNewStudioProject } from '@/services/studioProjectIdentity';
import { useDirectorReportStore, useMediaStore, useProjectStore } from '@/store';
import { directorInput } from './fixtures';

const assetEngine: AssetProviderEngine = {
  async resolve() {
    return { assets: [], report: { resolutions: [], providerUsage: {}, cacheHits: 0, cacheMisses: 0,
      resolvedCount: 0, unresolvedCount: 1, duplicateCandidatesRejected: 0 } };
  },
  clearCache() {},
};

describe('Studio project identity lifecycle', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    useMediaStore.getState().clearMediaProject();
    useDirectorReportStore.getState().reset();
    useProjectStore.getState().reset();
  });

  it('aynı Studio mountunda yeni taslaklara farklı kimlik verir', () => {
    const identity = createStudioProjectIdentity('draft-one');
    const second = startNewStudioProject(identity);
    const third = startNewStudioProject(identity);
    expect(new Set(['draft-one', second, third]).size).toBe(3);
  });

  it('aynı taslak tekrar analiz edildiğinde kimliği korur', () => {
    const identity = createStudioProjectIdentity('stable-draft');
    expect(identity.current()).toBe('stable-draft');
    expect(identity.current()).toBe('stable-draft');
  });

  it('yeni taslak raporu eskisini korur ve currentReport yeni projeye geçer', async () => {
    const oldReport = await createDirectorEngine().analyze(directorInput());
    useDirectorReportStore.getState().analysisCompleted(oldReport);
    const identity = createStudioProjectIdentity(oldReport.projectId);
    const newProjectId = startNewStudioProject(identity);
    const newReport = { ...oldReport, projectId: newProjectId };
    useDirectorReportStore.getState().analysisCompleted(newReport);
    expect(Object.keys(useDirectorReportStore.getState().reportsByProject)).toEqual(expect.arrayContaining([oldReport.projectId, newProjectId]));
    expect(useDirectorReportStore.getState().currentReport?.projectId).toBe(newProjectId);
  });

  it('kayıtlı projenin gerçek kimliğini taslak kimliğine tercih eder', () => {
    expect(resolveStudioProjectId('saved-project', 'draft-project')).toBe('saved-project');
    const identity = createStudioProjectIdentity('draft-project');
    expect(activateStudioProject(identity, 'saved-project')).toBe('saved-project');
    expect(identity.current()).toBe('saved-project');
  });

  it('yeni taslak başladığında stale manifesti temizler', async () => {
    const mediaEngine = createMediaEngine(new TypedEventBus<ApplicationEventMap>(), assetEngine);
    const result = await mediaEngine.buildProject({ projectId: 'old-project', title: 'Old', scenes: [
      { sceneId: 'visual-scene-00000000-0000-4000-8000-000000000001', text: 'Eski sahne', duration: 3, visual: 'Eski görsel' },
    ] });
    useMediaStore.getState().setBuildResult(result.project, result.manifest, result.renderReady, result.assetResolution, result.validation);
    const identity = createStudioProjectIdentity('old-project');
    const newProjectId = startNewStudioProject(identity);
    expect(newProjectId).not.toBe('old-project');
    expect(useMediaStore.getState().manifest).toBeNull();
  });
});
