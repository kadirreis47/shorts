import { applicationContainer, dependencyTokens } from '@/core/di';
import { TypedEventBus, type ApplicationEventMap } from '@/core/events';
import { persistenceManager } from '@/persistence';
import { createChannelService, createServiceExecutor } from '@/services';

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
  if (applicationContainer.has(dependencyTokens.eventBus)) {
    applicationContainer.resolve(dependencyTokens.eventBus).clear();
  }

  applicationContainer.reset();
  dependenciesRegistered = false;
}
