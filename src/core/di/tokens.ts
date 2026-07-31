import type { EventBus, ApplicationEventMap } from '@/core/events';
import type { PersistenceManager } from '@/persistence/persistenceManager';
import type { ChannelService, ServiceExecutor } from '@/services';
import type { DependencyToken } from './types';

function createToken<T>(name: string): DependencyToken<T> {
  return Symbol(name) as DependencyToken<T>;
}

export const dependencyTokens = {
  persistenceManager: createToken<PersistenceManager>('PersistenceManager'),
  eventBus: createToken<EventBus<ApplicationEventMap>>('ApplicationEventBus'),
  serviceExecutor: createToken<ServiceExecutor>('ServiceExecutor'),
  channelService: createToken<ChannelService>('ChannelService'),
} as const;
