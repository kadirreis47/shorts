import type { AIPipelineRunner } from '@/core/ai-pipeline';
import type { EventBus, ApplicationEventMap } from '@/core/events';
import type { PersistenceManager } from '@/persistence/persistenceManager';
import type { QueryClient } from '@/core/query';
import type { AIApplicationService, AIPipelineMonitor, ChannelService, ServiceExecutor } from '@/services';
import type { DependencyToken } from './types';

function createToken<T>(name: string): DependencyToken<T> {
  return Symbol(name) as DependencyToken<T>;
}

export const dependencyTokens = {
  persistenceManager: createToken<PersistenceManager>('PersistenceManager'),
  eventBus: createToken<EventBus<ApplicationEventMap>>('ApplicationEventBus'),
  serviceExecutor: createToken<ServiceExecutor>('ServiceExecutor'),
  queryClient: createToken<QueryClient>('QueryClient'),
  aiPipelineRunner: createToken<AIPipelineRunner>('AIPipelineRunner'),
  aiApplicationService: createToken<AIApplicationService>('AIApplicationService'),
  aiPipelineMonitor: createToken<AIPipelineMonitor>('AIPipelineMonitor'),
  channelService: createToken<ChannelService>('ChannelService'),
} as const;
