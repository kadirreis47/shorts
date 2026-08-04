import type { AIPipelineRunner } from '@/core/ai-pipeline';
import type { DirectorEngine } from '@/core/director';
import type { EditingEngine } from '@/core/editing';
import type { AudioProductionEngine } from '@/core/audio-production';
import type { AssetProviderEngine } from '@/core/media';
import type {
  RenderEngine,
  RenderRecoveryStore,
} from '@/core/render';
import type {
  EventBus,
  ApplicationEventMap,
} from '@/core/events';
import type { PersistenceManager } from '@/persistence/persistenceManager';
import type { QueryClient } from '@/core/query';
import type {
  AIApplicationService,
  AIPipelineMonitor,
  ChannelService,
  MediaEngine,
  RenderJobMonitor,
  ServiceExecutor,
  DirectorApplicationService,
  DirectorMonitor,
  EditingApplicationService,
  EditingMonitor,
  AudioProductionApplicationService,
  AudioProductionMonitor,
} from '@/services';
import type { DependencyToken } from './types';

function createToken<T>(name: string): DependencyToken<T> {
  return Symbol(name) as DependencyToken<T>;
}

export const dependencyTokens = {
  audioProductionEngine: createToken<AudioProductionEngine>('AudioProductionEngine'),
  audioProductionApplicationService: createToken<AudioProductionApplicationService>('AudioProductionApplicationService'),
  audioProductionMonitor: createToken<AudioProductionMonitor>('AudioProductionMonitor'),
  editingEngine: createToken<EditingEngine>('EditingEngine'),
  editingApplicationService: createToken<EditingApplicationService>('EditingApplicationService'),
  editingMonitor: createToken<EditingMonitor>('EditingMonitor'),
  directorEngine:
    createToken<DirectorEngine>('DirectorEngine'),
  directorApplicationService:
    createToken<DirectorApplicationService>('DirectorApplicationService'),
  directorMonitor:
    createToken<DirectorMonitor>('DirectorMonitor'),
  persistenceManager:
    createToken<PersistenceManager>('PersistenceManager'),
  eventBus:
    createToken<EventBus<ApplicationEventMap>>('ApplicationEventBus'),
  serviceExecutor:
    createToken<ServiceExecutor>('ServiceExecutor'),
  queryClient:
    createToken<QueryClient>('QueryClient'),
  aiPipelineRunner:
    createToken<AIPipelineRunner>('AIPipelineRunner'),
  aiApplicationService:
    createToken<AIApplicationService>('AIApplicationService'),
  aiPipelineMonitor:
    createToken<AIPipelineMonitor>('AIPipelineMonitor'),
  channelService:
    createToken<ChannelService>('ChannelService'),
  assetProviderEngine:
    createToken<AssetProviderEngine>('AssetProviderEngine'),
  mediaEngine:
    createToken<MediaEngine>('MediaEngine'),
  renderRecoveryStore:
    createToken<RenderRecoveryStore>('RenderRecoveryStore'),
  renderEngine:
    createToken<RenderEngine>('RenderEngine'),
  renderJobMonitor:
    createToken<RenderJobMonitor>('RenderJobMonitor'),
} as const;
