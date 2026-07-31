import { applicationContainer, dependencyTokens } from '@/core/di';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useAppStore, useChannelStore, useUIStore } from '@/store';
import { registerApplicationDependencies } from './registerDependencies';

let bootstrapPromise: Promise<void> | null = null;

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Uygulama başlatılırken beklenmeyen bir hata oluştu.';
}

async function runBootstrap() {
  registerApplicationDependencies();

  const appStore = useAppStore.getState();
  const persistenceManager = applicationContainer.resolve(
    dependencyTokens.persistenceManager,
  );

  appStore.beginBootstrap();
  appStore.setOffline(!navigator.onLine || !isSupabaseConfigured);

  try {
    const hydrationResult = await persistenceManager.hydrate();

    if (hydrationResult.failedStores.length > 0) {
      console.warn(
        '[Bootstrap] Some stores could not be restored:',
        hydrationResult.failedStores,
      );
    }

    useUIStore.getState().resetTransientUI();
    await useChannelStore.getState().loadChannels();
    useAppStore.getState().markReady();
  } catch (error) {
    useAppStore.getState().setError({
      message: getErrorMessage(error),
      code: 'APP_BOOTSTRAP_FAILED',
      occurredAt: new Date().toISOString(),
    });
  }
}

export function bootstrapApplication() {
  if (!bootstrapPromise) {
    bootstrapPromise = runBootstrap();
  }

  return bootstrapPromise;
}

export function retryApplicationBootstrap() {
  registerApplicationDependencies();
  bootstrapPromise = null;

  const persistenceManager = applicationContainer.resolve(
    dependencyTokens.persistenceManager,
  );

  void persistenceManager.retryHydration();
  return bootstrapApplication();
}
