import type { PersistenceManager } from '@/persistence/persistenceManager';
import type { ChannelService } from '@/services/channelService';
import type { DependencyToken } from './types';

function createToken<T>(name: string): DependencyToken<T> {
  return Symbol(name) as DependencyToken<T>;
}

export const dependencyTokens = {
  persistenceManager: createToken<PersistenceManager>('PersistenceManager'),
  channelService: createToken<ChannelService>('ChannelService'),
} as const;
