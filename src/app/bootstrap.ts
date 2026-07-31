import { isSupabaseConfigured } from '@/lib/supabase';
import { useAppStore, useChannelStore, useUIStore } from '@/store';

let bootstrapPromise: Promise<void> | null = null;

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Uygulama başlatılırken beklenmeyen bir hata oluştu.';
}

async function runBootstrap() {
  const appStore = useAppStore.getState();

  appStore.beginBootstrap();
  appStore.setOffline(!navigator.onLine || !isSupabaseConfigured);
  useUIStore.getState().resetTransientUI();

  try {
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
  bootstrapPromise = null;
  return bootstrapApplication();
}
