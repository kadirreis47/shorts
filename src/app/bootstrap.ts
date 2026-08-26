import { applicationContainer, dependencyTokens } from '@/core/di';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useAppStore, useChannelStore, useUIStore } from '@/store';
import { registerApplicationDependencies } from './registerDependencies';
import { attachRenderQueueInspector } from '@/services/renderQueueInspectorMonitor';
import { attachRenderRecoveryCenter } from '@/services/renderRecoveryCenterMonitor';
import { configureDirectorAnalysisController } from '@/services/directorAnalysisController';
import { configureEditingController } from '@/services/editingController';
import { configureAudioProductionController } from '@/services/audioProductionController';
import { configureVisualProductionController } from '@/services/visualProductionController';
import { configureSubtitleIntelligenceController } from '@/services/subtitleIntelligenceController';
import { initializePublishingQueue } from '@/services/publishingController';

let bootstrapPromise: Promise<void> | null = null;
let bootstrapUserId: string | null = null;
let bootstrapGeneration = 0;
let detachRenderQueueInspector: (() => void) | null = null;
let detachRenderRecoveryCenter: (() => void) | null = null;

class BootstrapCancelledError extends Error {}

function assertCurrentBootstrap(userId: string, generation: number) {
  if (generation !== bootstrapGeneration || bootstrapUserId !== userId) {
    throw new BootstrapCancelledError();
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Uygulama başlatılırken beklenmeyen bir hata oluştu.';
}

async function runBootstrap(userId: string, generation: number) {
  assertCurrentBootstrap(userId, generation);
  registerApplicationDependencies();

  const appStore = useAppStore.getState();
  const persistenceManager = applicationContainer.resolve(
    dependencyTokens.persistenceManager,
  );
  const eventBus = applicationContainer.resolve(dependencyTokens.eventBus);
  const renderEngine = applicationContainer.resolve(
    dependencyTokens.renderEngine,
  );
  configureDirectorAnalysisController(
    applicationContainer.resolve(dependencyTokens.directorApplicationService),
    applicationContainer.resolve(dependencyTokens.mediaEngine),
  );
  configureEditingController(applicationContainer.resolve(dependencyTokens.editingApplicationService));
  configureAudioProductionController(applicationContainer.resolve(dependencyTokens.audioProductionApplicationService));
  configureVisualProductionController(applicationContainer.resolve(dependencyTokens.visualProductionApplicationService));
  configureSubtitleIntelligenceController(applicationContainer.resolve(dependencyTokens.subtitleIntelligenceApplicationService));

  detachRenderQueueInspector?.();
  detachRenderQueueInspector = attachRenderQueueInspector(
    eventBus,
    (jobId) => renderEngine.getJob(jobId),
    () => renderEngine.listJobs(),
    () => renderEngine.isQueuePaused(),
  );

  const recoveryStore = applicationContainer.resolve(
    dependencyTokens.renderRecoveryStore,
  );
  detachRenderRecoveryCenter?.();
  detachRenderRecoveryCenter = attachRenderRecoveryCenter(
    eventBus,
    recoveryStore,
  );

  const startedAt = new Date().toISOString();
  assertCurrentBootstrap(userId, generation);
  appStore.beginBootstrap();
  void globalThis.window?.electronAPI?.appVersion?.()
    .then((version) => {
      if (generation === bootstrapGeneration && bootstrapUserId === userId && /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(version)) {
        useAppStore.getState().setVersion(version);
      }
    })
    .catch(() => undefined);
  appStore.setOffline(!navigator.onLine || !isSupabaseConfigured);
  await eventBus.emit('app:bootstrap-started', { startedAt });

  try {
    assertCurrentBootstrap(userId, generation);
    const hydrationResult = await persistenceManager.hydrate(userId);
    assertCurrentBootstrap(userId, generation);
    // Restore the single shared publishing queue, reconcile interrupted jobs,
    // and install the runtime-only next-due wake-up after persistence hydration.
    await initializePublishingQueue();
    assertCurrentBootstrap(userId, generation);

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
    assertCurrentBootstrap(userId, generation);
    await useChannelStore.getState().loadChannels();
    assertCurrentBootstrap(userId, generation);
    useAppStore.getState().markReady();

    await eventBus.emit('app:ready', {
      readyAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof BootstrapCancelledError) return;
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

export function bootstrapApplication(userId: string) {
  if (!userId) throw new Error('An authenticated user is required before application bootstrap.');

  if (!bootstrapPromise || bootstrapUserId !== userId) {
    const generation = ++bootstrapGeneration;
    bootstrapUserId = userId;
    bootstrapPromise = runBootstrap(userId, generation);
  }

  return bootstrapPromise;
}

export function retryApplicationBootstrap(userId: string) {
  registerApplicationDependencies();
  bootstrapPromise = null;
  bootstrapUserId = userId;

  const persistenceManager = applicationContainer.resolve(
    dependencyTokens.persistenceManager,
  );

  void persistenceManager.retryHydration();
  return bootstrapApplication(userId);
}

export function invalidateApplicationBootstrap() {
  bootstrapGeneration += 1;
  bootstrapPromise = null;
  bootstrapUserId = null;
  useAppStore.getState().reset();
  useUIStore.getState().resetTransientUI();
}
