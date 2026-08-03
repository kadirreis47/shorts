import {
  useAIStore,
  useChannelStore,
  useProjectStore,
  useSettingsStore,
  useUIStore,
  useDirectorReportStore,
  useEditingStore,
} from '@/store';

export type PersistenceStoreName =
  | 'ui'
  | 'settings'
  | 'ai'
  | 'channels'
  | 'projects'
  | 'director'
  | 'editing';

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
];

let hydrationPromise: Promise<PersistenceHydrationResult> | null = null;

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown persistence error.';
}

async function hydrateAllStores(): Promise<PersistenceHydrationResult> {
  const result: PersistenceHydrationResult = {
    hydratedStores: [],
    failedStores: [],
  };

  await Promise.all(
    stores.map(async ({ name, persist }) => {
      try {
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
  hydrate() {
    if (!hydrationPromise) {
      hydrationPromise = hydrateAllStores();
    }

    return hydrationPromise;
  },

  retryHydration() {
    hydrationPromise = null;
    return this.hydrate();
  },

  hasHydrated() {
    return stores.every(({ persist }) => persist.hasHydrated());
  },

  async clearAll() {
    await Promise.all(stores.map(({ persist }) => persist.clearStorage()));
  },
};

export type PersistenceManager = typeof persistenceManager;
