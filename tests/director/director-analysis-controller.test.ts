import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMediaEngine, type AssetProviderEngine } from '@/core/media';
import { createDirectorEngine } from '@/core/director';
import { TypedEventBus, type ApplicationEventMap } from '@/core/events';
import { createDirectorApplicationService } from '@/services/directorApplicationService';
import { analyzeActiveDirectorProject, configureDirectorAnalysisController } from '@/services/directorAnalysisController';
import { useMediaStore } from '@/store/mediaStore';

const assetEngine: AssetProviderEngine = {
  async resolve() {
    return { assets: [], report: { resolutions: [], providerUsage: {}, cacheHits: 0, cacheMisses: 0,
      resolvedCount: 0, unresolvedCount: 2, duplicateCandidatesRejected: 0 } };
  },
  clearCache() {},
};

describe('Director analysis controller', () => {
  const bus = new TypedEventBus<ApplicationEventMap>();
  const mediaEngine = createMediaEngine(bus, assetEngine);

  beforeEach(() => {
    useMediaStore.getState().clearMediaProject();
    configureDirectorAnalysisController(createDirectorApplicationService(createDirectorEngine(), bus), mediaEngine);
  });
  afterEach(() => configureDirectorAnalysisController(null, null));

  it('aktif Studio projesini gerçek Media Engine ile manifest haline getirip analiz eder', async () => {
    const report = await analyzeActiveDirectorProject(undefined, { projectId: 'studio-active', buildInput: {
      title: 'Director test', scenes: [
        { sceneId: 'visual-scene-00000000-0000-4000-8000-000000000001', text: '3 sır ile hemen daha iyi video üret.', duration: 3, visual: 'Hızlı açılış', keywords: ['hook'] },
        { sceneId: 'visual-scene-00000000-0000-4000-8000-000000000002', text: 'Bu yöntem sonucu açıklar.', duration: 4, visual: 'Sonuç', keywords: ['result'] },
      ],
    } });
    expect(report.projectId).toBe('studio-active');
    expect(useMediaStore.getState().manifest?.projectId).toBe('studio-active');
  });

  it('aktif proje ve stale manifest kimlikleri uyuşmadığında analizi reddeder', async () => {
    const result = await mediaEngine.buildProject({ projectId: 'active', title: 'Active', scenes: [
      { sceneId: 'visual-scene-00000000-0000-4000-8000-000000000003', text: 'Sahne metni', duration: 3, visual: 'Görsel' },
    ] });
    result.manifest.projectId = 'stale';
    useMediaStore.getState().setBuildResult(result.project, result.manifest, result.renderReady, result.assetResolution, result.validation);
    await expect(analyzeActiveDirectorProject()).rejects.toThrow('Aktif proje ile manifest eşleşmiyor');
  });

  it('manifest üretilemediğinde eyleme dönük hata verir', async () => {
    await expect(analyzeActiveDirectorProject()).rejects.toThrow('Studio’da sahneleri hazırlayıp');
    await expect(analyzeActiveDirectorProject(undefined, { projectId: 'empty', buildInput: { title: 'Empty', scenes: [] } }))
      .rejects.toThrow('en az bir sahne');
  });
});
