import { afterEach, describe, expect, it, vi } from 'vitest';
import { detachPersistenceOwner, persistenceManager } from '@/persistence/persistenceManager';
import {
  useAIStore,
  useAnalyticsStore,
  useAudioProductionStore,
  useChannelStore,
  useDirectorReportStore,
  useEditingStore,
  useExportIntelligenceStore,
  usePublishingStore,
  useProjectStore,
  useSettingsStore,
  useSubtitleIntelligenceStore,
  useUIStore,
  useVisualProductionStore,
  useAIPipelineStore,
  useRenderStore,
} from '@/store';
import { useRenderQueueInspectorStore } from '@/store/renderQueueInspectorStore';
import { useRenderRecoveryCenterStore } from '@/store/renderRecoveryCenterStore';
import { usePlatformOptimizationStore } from '@/store/platformOptimizationStore';

const persistedStores = [
  useUIStore,
  useSettingsStore,
  useAIStore,
  useChannelStore,
  useProjectStore,
  useDirectorReportStore,
  useEditingStore,
  useAudioProductionStore,
  useVisualProductionStore,
  useSubtitleIntelligenceStore,
  useExportIntelligenceStore,
  usePublishingStore,
  useAnalyticsStore,
];

describe('persistenceManager', () => {
  afterEach(() => vi.restoreAllMocks());

  it('clears analytics persistence with every other managed store', async () => {
    const clearStorage = persistedStores.map((store) =>
      vi.spyOn(store.persist, 'clearStorage').mockResolvedValue(undefined),
    );

    await persistenceManager.clearAll();

    clearStorage.forEach((clear) => expect(clear).toHaveBeenCalledOnce());
    expect(useAnalyticsStore.persist.clearStorage).toHaveBeenCalledOnce();
  });

  it('clears runtime-only private state when the persistence owner detaches', () => {
    useAIPipelineStore.setState({ history: [{} as never] });
    useRenderStore.setState({ history: [{} as never] });
    useRenderQueueInspectorStore.setState({ jobs: [{} as never], selectedJobId: 'render-a' });
    useRenderRecoveryCenterStore.setState({ records: [{} as never], interrupted: [{} as never], selectedJobId: 'recovery-a' });
    usePlatformOptimizationStore.getState().startAnalysis('project-a');

    detachPersistenceOwner();

    expect(useAIPipelineStore.getState().history).toEqual([]);
    expect(useRenderStore.getState().history).toEqual([]);
    expect(useRenderQueueInspectorStore.getState()).toMatchObject({ jobs: [], selectedJobId: null });
    expect(useRenderRecoveryCenterStore.getState()).toMatchObject({ records: [], interrupted: [], selectedJobId: null });
    expect(usePlatformOptimizationStore.getState().activeProjectId).toBeNull();
  });
});
