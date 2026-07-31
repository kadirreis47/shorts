import type { AppErrorCode } from '@/core/errors';
import type { Channel } from '@/lib/types';
import type { PersistenceHydrationResult } from '@/persistence/persistenceManager';

export interface ApplicationEventMap extends Record<string, unknown> {
  'app:bootstrap-started': { startedAt: string };
  'app:hydration-completed': {
    completedAt: string;
    result: PersistenceHydrationResult;
  };
  'app:ready': { readyAt: string };
  'app:bootstrap-failed': { failedAt: string; error: string };
  'service:operation-succeeded': {
    operation: string;
    durationMs: number;
    completedAt: string;
  };
  'service:operation-failed': {
    operation: string;
    code: AppErrorCode;
    message: string;
    retryable: boolean;
    durationMs: number;
    failedAt: string;
  };
  'ai:pipeline-started': {
    runId: string;
    pipelineId: string;
    title: string;
    totalSteps: number;
    startedAt: string;
  };
  'ai:pipeline-step-started': {
    runId: string;
    pipelineId: string;
    stepId: string;
    title: string;
    stepIndex: number;
    totalSteps: number;
    startedAt: string;
  };
  'ai:pipeline-step-completed': {
    runId: string;
    pipelineId: string;
    stepId: string;
    stepIndex: number;
    totalSteps: number;
    durationMs: number;
    completedAt: string;
  };
  'ai:pipeline-completed': {
    runId: string;
    pipelineId: string;
    durationMs: number;
    completedAt: string;
  };
  'ai:pipeline-failed': {
    runId: string;
    pipelineId: string;
    code: AppErrorCode;
    message: string;
    retryable: boolean;
    failedAt: string;
  };
  'ai:pipeline-cancelled': {
    runId: string;
    pipelineId: string;
    cancelledAt: string;
  };
  'channel:list-loaded': { channels: Channel[]; loadedAt: string };
  'channel:created': { channel: Channel; createdAt: string };
  'channel:updated': { channel: Channel; updatedAt: string };
  'channel:deleted': { channelId: string; deletedAt: string };
  'channel:selected': { channelId: string | null; selectedAt: string };
}
