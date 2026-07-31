import { applicationContainer, dependencyTokens } from '@/core/di';
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
    dependencyTokens.channelService,
    () => createChannelService(),
  );

  dependenciesRegistered = true;
  return applicationContainer;
}

export function resetApplicationDependencies() {
  applicationContainer.reset();
  dependenciesRegistered = false;
}
