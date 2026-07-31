import { createAIPipelineRunner } from '@/core/ai-pipeline';
import { applicationContainer, dependencyTokens } from '@/core/di';
import { TypedEventBus, type ApplicationEventMap } from '@/core/events';
import { createQueryClient } from '@/core/query';
import { persistenceManager } from '@/persistence';
import {
  createAIApplicationService,
  createChannelService,
  createServiceExecutor,
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

  dependenciesRegistered = true;
  return applicationContainer;
}

export function resetApplicationDependencies() {
  if (applicationContainer.has(dependencyTokens.aiPipelineRunner)) {
    applicationContainer.resolve(dependencyTokens.aiPipelineRunner).cancelAll();
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
