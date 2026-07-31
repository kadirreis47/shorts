import { applicationContainer, dependencyTokens } from '@/core/di';
import { TypedEventBus, type ApplicationEventMap } from '@/core/events';
import { persistenceManager } from '@/persistence';
import { createChannelService } from '@/services/channelService';

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
    dependencyTokens.channelService,
    () => createChannelService(),
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
