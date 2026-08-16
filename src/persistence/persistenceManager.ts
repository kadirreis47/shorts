import {
  useAIStore,
  useChannelStore,
  useProjectStore,
  useSettingsStore,
  useUIStore,
  useDirectorReportStore,
  useEditingStore,
  useAudioProductionStore,
  useVisualProductionStore,
  useSubtitleIntelligenceStore,
  useExportIntelligenceStore,
  usePublishingStore,
  useAnalyticsStore,
  useAIPipelineStore,
  useRenderStore,
} from '@/store';
import { currentPersistenceOwnerId } from '@/persistence/userScopedStorage';
import { useMediaStore } from '@/store/mediaStore';
import { useRenderAnalyticsStore } from '@/store/renderAnalyticsStore';
import { useRenderQueueInspectorStore } from '@/store/renderQueueInspectorStore';
import { useRenderRecoveryCenterStore } from '@/store/renderRecoveryCenterStore';
import { usePlatformOptimizationStore } from '@/store/platformOptimizationStore';

export type PersistenceStoreName =
  | 'ui'
  | 'settings'
  | 'ai'
  | 'channels'
  | 'projects'
  | 'director'
  | 'editing'
  | 'audio-production'
  | 'visual-production'
  | 'subtitle-intelligence'
  | 'export-intelligence'
  | 'publishing'
  | 'analytics'
  | 'render-analytics';

export interface PersistenceHydrationResult {
  hydratedStores: PersistenceStoreName[];
  failedStores: Array<{
    store: PersistenceStoreName;
    error: string;
  }>;
}

const stores = [
  { name: 'ui' as const, persist: useUIStore.persist },
  { name: 'settings' as const, persist: useSettingsStore.persist },
  { name: 'ai' as const, persist: useAIStore.persist },
  { name: 'channels' as const, persist: useChannelStore.persist },
  { name: 'projects' as const, persist: useProjectStore.persist },
  { name: 'director' as const, persist: useDirectorReportStore.persist },
  { name: 'editing' as const, persist: useEditingStore.persist },
  { name: 'audio-production' as const, persist: useAudioProductionStore.persist },
  { name: 'visual-production' as const, persist: useVisualProductionStore.persist },
  { name: 'subtitle-intelligence' as const, persist: useSubtitleIntelligenceStore.persist },
  { name: 'export-intelligence' as const, persist: useExportIntelligenceStore.persist },
  { name: 'publishing' as const, persist: usePublishingStore.persist },
  { name: 'analytics' as const, persist: useAnalyticsStore.persist },
];

let hydrationPromise: Promise<PersistenceHydrationResult> | null = null;
let hydrationOwnerId: string | null = null;

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown persistence error.';
}

function resetPrivateMemory() {
  const persisted = [...stores.map(({ persist }) => persist), useRenderAnalyticsStore.persist] as any[];
  const stateStores = [useUIStore, useSettingsStore, useAIStore, useChannelStore, useProjectStore, useDirectorReportStore, useEditingStore, useAudioProductionStore, useVisualProductionStore, useSubtitleIntelligenceStore, useExportIntelligenceStore, usePublishingStore, useAnalyticsStore, useRenderAnalyticsStore] as any[];
  const originals = persisted.map((persist) => persist.getOptions().storage);
  persisted.forEach((persist) => persist.setOptions({ storage: { getItem: async () => null, setItem: async () => undefined, removeItem: async () => undefined } }));
  persisted.forEach((persist, index) => {
    const store = stateStores[index]!;
    store.setState(store.getInitialState(), true);
  });
  persisted.forEach((persist, index) => persist.setOptions({ storage: originals[index] }));
  useMediaStore.getState().clearMediaProject();
  useAIPipelineStore.setState(useAIPipelineStore.getInitialState(), true);
  useRenderStore.setState(useRenderStore.getInitialState(), true);
  useRenderQueueInspectorStore.setState(useRenderQueueInspectorStore.getInitialState(), true);
  useRenderRecoveryCenterStore.setState(useRenderRecoveryCenterStore.getInitialState(), true);
  usePlatformOptimizationStore.setState(usePlatformOptimizationStore.getInitialState(), true);
}

async function hydrateAllStores(ownerId: string): Promise<PersistenceHydrationResult> {
  const result: PersistenceHydrationResult = {
    hydratedStores: [],
    failedStores: [],
  };

  await Promise.all(
    [...stores, { name: 'render-analytics' as const, persist: useRenderAnalyticsStore.persist }].map(async ({ name, persist }) => {
      try {
        if (currentPersistenceOwnerId() !== ownerId) return;
        await persist.rehydrate();
        result.hydratedStores.push(name);
      } catch (error) {
        console.warn(`[Persistence] Store hydration failed: ${name}`, error);
        result.failedStores.push({
          store: name,
          error: getErrorMessage(error),
        });
      }
    }),
  );

  return result;
}

export const persistenceManager = {
  hydrate(ownerId = currentPersistenceOwnerId()) {
    if (!ownerId) throw new Error('A validated owner is required before persistence hydration.');
    if (!hydrationPromise || hydrationOwnerId !== ownerId) {
      hydrationOwnerId = ownerId;
      resetPrivateMemory();
      hydrationPromise = hydrateAllStores(ownerId);
    }

    return hydrationPromise;
  },

  retryHydration() {
    hydrationPromise = null;
    hydrationOwnerId = null;
    return this.hydrate();
  },

  hasHydrated() {
    return stores.every(({ persist }) => persist.hasHydrated());
  },

  async clearAll() {
    await Promise.all(stores.map(({ persist }) => persist.clearStorage()));
  },
};

export function detachPersistenceOwner() {
  hydrationPromise = null;
  hydrationOwnerId = null;
  resetPrivateMemory();
}

export type PersistenceManager = typeof persistenceManager;
