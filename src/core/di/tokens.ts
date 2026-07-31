import type { AIPipelineRunner } from '@/core/ai-pipeline';
import type { AssetProviderEngine } from '@/core/media';
import type { RenderEngine } from '@/core/render';
import type { EventBus, ApplicationEventMap } from '@/core/events';
import type { PersistenceManager } from '@/persistence/persistenceManager';
import type { QueryClient } from '@/core/query';
import type { AIApplicationService, AIPipelineMonitor, ChannelService, MediaEngine, RenderJobMonitor, ServiceExecutor } from '@/services';
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
  assetProviderEngine: createToken<AssetProviderEngine>('AssetProviderEngine'),
  mediaEngine: createToken<MediaEngine>('MediaEngine'),
  renderEngine: createToken<RenderEngine>('RenderEngine'),
  renderJobMonitor: createToken<RenderJobMonitor>('RenderJobMonitor'),
} as const;
