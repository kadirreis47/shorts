import { createAIPipelineRunner } from '@/core/ai-pipeline';
import { createDirectorEngine } from '@/core/director';
import { createEditingEngine } from '@/core/editing';
import { createAudioProductionEngine } from '@/core/audio-production';
import { createVisualProductionEngine } from '@/core/visual-production';
import { createSubtitleIntelligenceEngine } from '@/core/subtitle-intelligence';
import { createPlatformOptimizationEngine } from '@/core/platform-optimization';
import { applicationContainer, dependencyTokens } from '@/core/di';
import { TypedEventBus, type ApplicationEventMap } from '@/core/events';
import { createQueryClient } from '@/core/query';
import { createAssetProviderEngine } from '@/core/media';
import {
  createFFmpegRenderAdapter,
  createHardwareScheduler,
  createIncrementalRenderPlanner,
  createRenderCache,
  createRenderEngine,
  createRenderRecoveryStore,
  createRenderPlanAdapter,
} from '@/core/render';
import { persistenceManager } from '@/persistence';
import {
  createAIApplicationService,
  createAIPipelineMonitor,
  createChannelService,
  createMediaEngine,
  createRenderJobMonitor,
  createServiceExecutor,
  createDirectorApplicationService,
  createDirectorMonitor,
  createEditingApplicationService,
  createEditingMonitor,
  createAudioProductionApplicationService,
  createAudioProductionMonitor,
  createVisualProductionApplicationService,
  createSubtitleIntelligenceApplicationService,
  createPlatformOptimizationApplicationService,
  createExportIntelligenceApplicationService,
  createPublishingApplicationService,
  createAnalyticsApplicationService,
} from '@/services';

let dependenciesRegistered = false;

export function registerApplicationDependencies() {
  if (dependenciesRegistered) return applicationContainer;

  applicationContainer.registerValue(
    dependencyTokens.persistenceManager,
    persistenceManager,
  );

  applicationContainer.registerSingleton(
    dependencyTokens.eventBus,
    () => new TypedEventBus<ApplicationEventMap>(),
  );

  applicationContainer.registerSingleton(
    dependencyTokens.queryClient,
    () => createQueryClient(),
  );

  applicationContainer.registerSingleton(
    dependencyTokens.directorEngine,
    () => createDirectorEngine(),
  );

  applicationContainer.registerSingleton(
    dependencyTokens.directorApplicationService,
    (container) => createDirectorApplicationService(
      container.resolve(dependencyTokens.directorEngine),
      container.resolve(dependencyTokens.eventBus),
    ),
  );

  applicationContainer.registerSingleton(
    dependencyTokens.directorMonitor,
    (container) => createDirectorMonitor(container.resolve(dependencyTokens.eventBus)),
  );

  applicationContainer.registerSingleton(dependencyTokens.editingEngine, () => createEditingEngine());
  applicationContainer.registerSingleton(dependencyTokens.editingApplicationService, (container) => createEditingApplicationService(
    container.resolve(dependencyTokens.editingEngine), container.resolve(dependencyTokens.eventBus),
  ));
  applicationContainer.registerSingleton(dependencyTokens.editingMonitor, (container) => createEditingMonitor(container.resolve(dependencyTokens.eventBus)));
  applicationContainer.registerSingleton(dependencyTokens.audioProductionEngine, () => createAudioProductionEngine());
  applicationContainer.registerSingleton(dependencyTokens.audioProductionApplicationService, (container) => createAudioProductionApplicationService(container.resolve(dependencyTokens.audioProductionEngine), container.resolve(dependencyTokens.eventBus)));
  applicationContainer.registerSingleton(dependencyTokens.audioProductionMonitor, (container) => createAudioProductionMonitor(container.resolve(dependencyTokens.eventBus)));
  applicationContainer.registerSingleton(dependencyTokens.visualProductionEngine, () => createVisualProductionEngine());
  applicationContainer.registerSingleton(dependencyTokens.visualProductionApplicationService, (container) => createVisualProductionApplicationService(container.resolve(dependencyTokens.visualProductionEngine), container.resolve(dependencyTokens.eventBus)));
  applicationContainer.registerSingleton(dependencyTokens.subtitleIntelligenceEngine, () => createSubtitleIntelligenceEngine());
  applicationContainer.registerSingleton(dependencyTokens.subtitleIntelligenceApplicationService, (container) => createSubtitleIntelligenceApplicationService(container.resolve(dependencyTokens.subtitleIntelligenceEngine), container.resolve(dependencyTokens.eventBus)));
  applicationContainer.registerSingleton(dependencyTokens.platformOptimizationApplicationService, () => createPlatformOptimizationApplicationService(createPlatformOptimizationEngine()));
  applicationContainer.registerSingleton(dependencyTokens.exportIntelligenceApplicationService, () => createExportIntelligenceApplicationService());
  applicationContainer.registerSingleton(dependencyTokens.publishingApplicationService, (container) => createPublishingApplicationService(container.resolve(dependencyTokens.eventBus)));
  applicationContainer.registerSingleton(dependencyTokens.analyticsApplicationService, (container) => createAnalyticsApplicationService(container.resolve(dependencyTokens.eventBus)));

  applicationContainer.registerSingleton(
    dependencyTokens.aiPipelineRunner,
    (container) => createAIPipelineRunner(
      container.resolve(dependencyTokens.eventBus),
    ),
  );

  applicationContainer.registerSingleton(
    dependencyTokens.aiApplicationService,
    (container) => createAIApplicationService(
      container.resolve(dependencyTokens.aiPipelineRunner),
    ),
  );

  applicationContainer.registerSingleton(
    dependencyTokens.aiPipelineMonitor,
    (container) => createAIPipelineMonitor(
      container.resolve(dependencyTokens.eventBus),
    ),
  );

  applicationContainer.registerSingleton(
    dependencyTokens.serviceExecutor,
    (container) => createServiceExecutor(
      container.resolve(dependencyTokens.eventBus),
    ),
  );

  applicationContainer.registerSingleton(
    dependencyTokens.channelService,
    (container) => createChannelService(
      container.resolve(dependencyTokens.serviceExecutor),
    ),
  );

  applicationContainer.registerSingleton(
    dependencyTokens.assetProviderEngine,
    (container) => createAssetProviderEngine(
      container.resolve(dependencyTokens.eventBus),
    ),
  );

  applicationContainer.registerSingleton(
    dependencyTokens.renderRecoveryStore,
    () => createRenderRecoveryStore(),
  );

  applicationContainer.registerSingleton(
    dependencyTokens.renderEngine,
    (container) => {
      const eventBus = container.resolve(dependencyTokens.eventBus);
      const hardwareScheduler = createHardwareScheduler(eventBus);
      const renderCache = createRenderCache();
      const incrementalPlanner = createIncrementalRenderPlanner();
      return createRenderEngine(
        eventBus,
        [createFFmpegRenderAdapter(hardwareScheduler), createRenderPlanAdapter()],
        {
          concurrency: 1,
          cache: renderCache,
          incrementalPlanner,
          recoveryStore: container.resolve(
            dependencyTokens.renderRecoveryStore,
          ),
          outputExists: async (uri) => {
            const bridge = window.electronAPI?.ffmpeg;
            if (!bridge || uri.startsWith('render-plan://')) return true;
            return bridge.fileExists(uri);
          },
        },
      );
    },
  );

  applicationContainer.registerSingleton(
    dependencyTokens.renderJobMonitor,
    (container) => createRenderJobMonitor(
      container.resolve(dependencyTokens.eventBus),
    ),
  );

  applicationContainer.registerSingleton(
    dependencyTokens.mediaEngine,
    (container) => createMediaEngine(
      container.resolve(dependencyTokens.eventBus),
      container.resolve(dependencyTokens.assetProviderEngine),
    ),
  );

  applicationContainer.resolve(dependencyTokens.aiPipelineMonitor).start();
  applicationContainer.resolve(dependencyTokens.renderJobMonitor).start();
  applicationContainer.resolve(dependencyTokens.directorMonitor).start();
  applicationContainer.resolve(dependencyTokens.editingMonitor).start();
  applicationContainer.resolve(dependencyTokens.audioProductionMonitor).start();

  dependenciesRegistered = true;
  return applicationContainer;
}

export function resetApplicationDependencies() {
  if (applicationContainer.has(dependencyTokens.audioProductionMonitor)) applicationContainer.resolve(dependencyTokens.audioProductionMonitor).stop();
  if (applicationContainer.has(dependencyTokens.editingMonitor)) applicationContainer.resolve(dependencyTokens.editingMonitor).stop();
  if (applicationContainer.has(dependencyTokens.directorMonitor)) {
    applicationContainer.resolve(dependencyTokens.directorMonitor).stop();
  }
  if (applicationContainer.has(dependencyTokens.renderJobMonitor)) {
    applicationContainer.resolve(dependencyTokens.renderJobMonitor).stop();
  }

  if (applicationContainer.has(dependencyTokens.renderEngine)) {
    applicationContainer.resolve(dependencyTokens.renderEngine).dispose();
  }

  if (applicationContainer.has(dependencyTokens.aiPipelineMonitor)) {
    applicationContainer.resolve(dependencyTokens.aiPipelineMonitor).stop();
  }

  if (applicationContainer.has(dependencyTokens.aiPipelineRunner)) {
    applicationContainer.resolve(dependencyTokens.aiPipelineRunner).cancelAll();
  }

  if (applicationContainer.has(dependencyTokens.assetProviderEngine)) {
    applicationContainer.resolve(dependencyTokens.assetProviderEngine).clearCache();
  }

  if (applicationContainer.has(dependencyTokens.queryClient)) {
    applicationContainer.resolve(dependencyTokens.queryClient).clear();
  }

  if (applicationContainer.has(dependencyTokens.eventBus)) {
    applicationContainer.resolve(dependencyTokens.eventBus).clear();
  }

  applicationContainer.reset();
  dependenciesRegistered = false;
}
