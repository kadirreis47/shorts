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
  'ai:pipeline-step-retrying': {
    runId: string;
    pipelineId: string;
    stepId: string;
    stepIndex: number;
    attempt: number;
    nextAttempt: number;
    maxAttempts: number;
    delayMs: number;
    code: AppErrorCode;
    message: string;
    retryingAt: string;
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
  'asset:search-started': { sceneId: string; queries: string[]; startedAt: string; };
  'asset:provider-selected': { sceneId: string; providerId: string; selectedAt: string; };
  'asset:cache-hit': { sceneId: string; providerId: string; candidateCount: number; hitAt: string; };
  'asset:provider-failed': { sceneId: string; providerId: string; message: string; failedAt: string; };
  'asset:candidate-ranked': { sceneId: string; providerId: string; candidateId: string; score: number; rankedAt: string; };
  'asset:resolved': { sceneId: string; assetId: string; providerId: string; resolvedAt: string; };
  'asset:unresolved': { sceneId: string; queries: string[]; unresolvedAt: string; };
  'media:project-created': {
    projectId: string;
    title: string;
    sceneCount: number;
    createdAt: string;
  };
  'media:assets-resolved': {
    projectId: string;
    assetCount: number;
    resolvedAt: string;
  };
  'media:timeline-built': {
    projectId: string;
    durationMs: number;
    sceneCount: number;
    trackCount: number;
    markerCount: number;
    pacingScore: number;
    builtAt: string;
  };
  'subtitle:timeline-built': {
    projectId: string;
    wordCount: number;
    cueCount: number;
    readingSpeedWpm: number;
    builtAt: string;
  };
  'audio:timeline-built': {
    projectId: string;
    voiceSegmentCount: number;
    sfxCount: number;
    duckingEventCount: number;
    voiceCoverage: number;
    builtAt: string;
  };
  'media:manifest-built': {
    projectId: string;
    durationMs: number;
    renderReady: boolean;
    builtAt: string;
  };
  'channel:list-loaded': { channels: Channel[]; loadedAt: string };
  'channel:created': { channel: Channel; createdAt: string };
  'channel:updated': { channel: Channel; updatedAt: string };
  'channel:deleted': { channelId: string; deletedAt: string };
  'channel:selected': { channelId: string | null; selectedAt: string };
}
