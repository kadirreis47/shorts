import { afterEach, describe, expect, it, vi } from 'vitest';
import { persistenceManager } from '@/persistence/persistenceManager';
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
} from '@/store';

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
});
