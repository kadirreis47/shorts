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
  const eventBus = applicationContainer.resolve(dependencyTokens.eventBus);

  const startedAt = new Date().toISOString();
  appStore.beginBootstrap();
  appStore.setOffline(!navigator.onLine || !isSupabaseConfigured);
  await eventBus.emit('app:bootstrap-started', { startedAt });

  try {
    const hydrationResult = await persistenceManager.hydrate();

    await eventBus.emit('app:hydration-completed', {
      completedAt: new Date().toISOString(),
      result: hydrationResult,
    });

    if (hydrationResult.failedStores.length > 0) {
      console.warn(
        '[Bootstrap] Some stores could not be restored:',
        hydrationResult.failedStores,
      );
    }

    useUIStore.getState().resetTransientUI();
    await useChannelStore.getState().loadChannels();
    useAppStore.getState().markReady();

    await eventBus.emit('app:ready', {
      readyAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = getErrorMessage(error);

    useAppStore.getState().setError({
      message,
      code: 'APP_BOOTSTRAP_FAILED',
      occurredAt: new Date().toISOString(),
    });

    await eventBus.emit('app:bootstrap-failed', {
      failedAt: new Date().toISOString(),
      error: message,
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
