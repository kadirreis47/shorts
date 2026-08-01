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
  'media:validation-completed': {
    projectId: string;
    score: number;
    renderReady: boolean;
    errorCount: number;
    warningCount: number;
    validatedAt: string;
  };
  'media:manifest-built': {
    projectId: string;
    durationMs: number;
    renderReady: boolean;
    builtAt: string;
  };
  'render:diagnostics-completed': {
    jobId: string;
    projectId: string;
    qualityScore: number;
    passed: boolean;
    warningCount: number;
    outputPath: string;
    analyzedAt: string;
  };
  'render:subtitle-render-completed': {
    jobId: string;
    projectId: string;
    cueCount: number;
    karaokeReadyCueCount: number;
    completedAt: string;
  };
  'render:visual-effects-completed': {
    jobId: string;
    projectId: string;
    cameraMotionScenes: number;
    transitionScenes: number;
    completedAt: string;
  };
  'render:audio-mix-completed': {
    jobId: string;
    projectId: string;
    voiceInputs: number;
    musicInputs: number;
    sfxInputs: number;
    duckingApplied: boolean;
    targetLufs: number;
    completedAt: string;
  };
  'render:zero-copy-assembly-completed': {
    jobId: string;
    projectId: string;
    renderedSegments: number;
    reusedSegments: number;
    outputUri: string;
    completedAt: string;
  };
  'render:segment-cache-used': {
    jobId: string;
    projectId: string;
    renderedSegments: number;
    reusedSegments: number;
    segmentCount: number;
    completedAt: string;
  };
  'render:incremental-plan-created': {
    jobId: string;
    projectId: string;
    planId: string;
    totalScenes: number;
    renderedScenes: number;
    reusableScenes: number;
    estimatedSavedPercent: number;
    fullRenderRequired: boolean;
    createdAt: string;
  };
  'render:incremental-snapshot-stored': {
    jobId: string;
    projectId: string;
    planId: string;
    outputUri: string;
    sceneCount: number;
    storedAt: string;
  };
  'render:cache-hit': {
    jobId: string;
    projectId: string;
    fingerprint: string;
    outputUri: string;
    savedRenderMs: number;
    hitAt: string;
  };
  'render:cache-miss': {
    jobId: string;
    projectId: string;
    fingerprint: string;
    missedAt: string;
  };
  'render:cache-stored': {
    jobId: string;
    projectId: string;
    fingerprint: string;
    outputUri: string;
    renderMs: number;
    storedAt: string;
  };
  'render:hardware-selected': {
    jobId: string;
    backend: 'cpu' | 'nvenc';
    encoder: string;
    gpuName: string | null;
    memoryFreeMiB: number | null;
    reason: string;
    automatic: boolean;
  };
  'render:hardware-waiting': {
    jobId: string;
    backend: 'cpu' | 'nvenc';
    waitingJobs: number;
    reason: string;
  };
  'render:metrics-updated': {
    snapshot: import('@/core/render').RenderPerformanceSnapshot;
  };
  'render:job-retrying': {
    jobId: string;
    projectId: string;
    adapterId: string;
    attempt: number;
    nextAttempt: number;
    delayMs: number;
    failureKind: import('@/core/render').RenderFailureKind;
    reason: string;
    retryingAt: string;
  };
  'render:circuit-open': {
    jobId: string;
    projectId: string;
    adapterId: string;
    retryAfterMs: number;
    consecutiveFailures: number;
    openedAt: string | null;
  };
  'render:recovery-detected': {
    interruptedJobs: number;
    detectedAt: string;
  };
  'render:checkpoint-written': {
    jobId: string;
    projectId: string;
    stage: import('@/core/render').RenderStage;
    progress: number;
    writtenAt: string;
  };
  'render:job-queued': {
    jobId: string;
    projectId: string;
    adapterId: string;
    queuedAt: string;
  };
  'render:job-started': {
    jobId: string;
    projectId: string;
    adapterId: string;
    startedAt: string;
  };
  'render:job-progress': {
    jobId: string;
    projectId: string;
    stage: import('@/core/render').RenderStage;
    progress: number;
    message: string;
    frame?: number;
    totalFrames?: number;
    updatedAt: string;
  };
  'render:job-completed': {
    jobId: string;
    projectId: string;
    outputKind: import('@/core/render').RenderOutputKind;
    outputUri: string;
    durationMs: number;
    completedAt: string;
  };
  'render:job-failed': {
    jobId: string;
    projectId: string;
    message: string;
    failedAt: string;
  };
  'render:job-cancelled': {
    jobId: string;
    projectId: string;
    cancelledAt: string;
  };
  'channel:list-loaded': { channels: Channel[]; loadedAt: string };
  'channel:created': { channel: Channel; createdAt: string };
  'channel:updated': { channel: Channel; updatedAt: string };
  'channel:deleted': { channelId: string; deletedAt: string };
  'channel:selected': { channelId: string | null; selectedAt: string };
}
