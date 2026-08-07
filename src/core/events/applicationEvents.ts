import type { AppErrorCode } from '@/core/errors';
import type { Channel } from '@/lib/types';
import type { PersistenceHydrationResult } from '@/persistence/persistenceManager';

export interface ApplicationEventMap extends Record<string, unknown> {
  'export-intelligence:job-queued': { jobId: string; projectId: string; presetId: string; queuedAt: string };
  'export-intelligence:progress': { jobId: string; progress: import('@/core/export-intelligence').ExportProgress };
  'export-intelligence:completed': { jobId: string; artifact: import('@/core/export-intelligence').ExportArtifact; completedAt: string };
  'export-intelligence:failed': { jobId: string; failure: import('@/core/export-intelligence').ExportFailure; failedAt: string };
  'export-intelligence:cancelled': { jobId: string; cancelledAt: string };
  'export-intelligence:capabilities-detected': { capability: import('@/core/export-intelligence').ExportCapability; detectedAt: string };
  'platform-optimization:analysis-started': { projectId: string; platformId: import('@/core/platform-optimization').PlatformId; startedAt: string };
  'platform-optimization:analysis-completed': { projectId: string; platformId: import('@/core/platform-optimization').PlatformId; plan: import('@/core/platform-optimization').PlatformOptimizationPlan; completedAt: string };
  'platform-optimization:preview-started': { projectId: string; platformId: import('@/core/platform-optimization').PlatformId; startedAt: string };
  'platform-optimization:preview-completed': { projectId: string; preview: import('@/core/platform-optimization').PlatformOptimizationPreview; completedAt: string };
  'platform-optimization:apply-started': { projectId: string; platformId: import('@/core/platform-optimization').PlatformId; startedAt: string };
  'platform-optimization:apply-completed': { projectId: string; snapshot: import('@/core/platform-optimization').PlatformVariantSnapshot; completedAt: string };
  'platform-optimization:apply-failed': { projectId: string; message: string; failedAt: string };
  'platform-optimization:profile-changed': { projectId: string; platformId: import('@/core/platform-optimization').PlatformId; profileVersion: string; changedAt: string };
  'subtitle-intelligence:analysis-started': { projectId: string; revisionId: string; requestId: number; startedAt: string };
  'subtitle-intelligence:plan-completed': { projectId: string; plan: import('@/core/subtitle-intelligence').SubtitleIntelligencePlan; requestId: number; completedAt: string };
  'subtitle-intelligence:preview-created': { projectId: string; preview: import('@/core/subtitle-intelligence').SubtitleIntelligencePreview; createdAt: string };
  'subtitle-intelligence:apply-completed': { projectId: string; result: import('@/core/subtitle-intelligence').SubtitleIntelligenceResult; completedAt: string };
  'subtitle-intelligence:undo-completed': { projectId: string; revisionId: string; completedAt: string };
  'subtitle-intelligence:redo-completed': { projectId: string; revisionId: string; completedAt: string };
  'subtitle-intelligence:failed': { projectId: string; stage: 'analysis' | 'apply'; requestId?: number; message: string; failedAt: string };
  'visual-production:analysis-started': { projectId: string; revisionId: string; requestId: number; startedAt: string };
  'visual-production:plan-completed': { projectId: string; plan: import('@/core/visual-production').VisualProductionPlan; requestId: number; completedAt: string };
  'visual-production:preview-created': { projectId: string; preview: import('@/core/visual-production').VisualProductionPreview; createdAt: string };
  'visual-production:apply-completed': { projectId: string; result: import('@/core/visual-production').VisualProductionResult; completedAt: string };
  'visual-production:undo-completed': { projectId: string; revisionId: string; completedAt: string };
  'visual-production:redo-completed': { projectId: string; revisionId: string; completedAt: string };
  'visual-production:failed': { projectId: string; stage: 'analysis' | 'apply'; requestId?: number; message: string; failedAt: string };
  'audio-production:analysis-started': { projectId: string; revisionId: string; startedAt: string };
  'audio-production:analyzer-completed': { projectId: string; analyzer: string; completedAt: string };
  'audio-production:plan-completed': { projectId: string; plan: import('@/core/audio-production').AudioProductionPlan; completedAt: string };
  'audio-production:preview-created': { projectId: string; preview: import('@/core/audio-production').AudioProductionPreview; createdAt: string };
  'audio-production:apply-started': { projectId: string; planId: string; revisionId: string; startedAt: string };
  'audio-production:apply-completed': { projectId: string; result: import('@/core/audio-production').AudioProductionResult; completedAt: string };
  'audio-production:apply-failed': { projectId: string; stage: 'analysis' | 'apply'; message: string; failedAt: string };
  'audio-production:undo-completed': { projectId: string; revisionId: string; completedAt: string };
  'audio-production:redo-completed': { projectId: string; revisionId: string; completedAt: string };
  'editing:plan-started': { projectId: string; revisionId: string; startedAt: string };
  'editing:plan-completed': { projectId: string; plan: import('@/core/editing').EditPlan; completedAt: string };
  'editing:preview-created': { projectId: string; preview: import('@/core/editing').EditPreview; createdAt: string };
  'editing:apply-started': { projectId: string; planId: string; revisionId: string; startedAt: string };
  'editing:operation-applied': { projectId: string; operationId: string; revisionId: string; appliedAt: string };
  'editing:apply-completed': { projectId: string; result: import('@/core/editing').EditApplyResult; completedAt: string };
  'editing:apply-failed': { projectId: string; stage: 'plan' | 'apply'; message: string; failedAt: string };
  'editing:undo-completed': { projectId: string; revisionId: string; completedAt: string };
  'editing:redo-completed': { projectId: string; revisionId: string; completedAt: string };
  'director:analysis-started': {
    projectId: string;
    sceneCount: number;
    startedAt: string;
  };
  'director:analyzer-completed': {
    projectId: string;
    analyzerId: string;
    status: 'completed' | 'failed';
    affectedSceneCount: number;
    message: string;
    completedAt: string;
  };
  'director:analysis-completed': {
    projectId: string;
    overallScore: number;
    recommendationCount: number;
    analyzerFailureCount: number;
    completedAt: string;
    report: import('@/core/director').DirectorReport;
  };
  'director:analysis-failed': {
    projectId: string;
    message: string;
    cancelled: boolean;
    failedAt: string;
  };
  'director:scene-ranked': { projectId: string; sceneCount: number; rankedAt: string };
  'director:retention-map-completed': { projectId: string; segmentCount: number; completedAt: string };
  'director:edit-plan-created': { projectId: string; decisionCount: number; createdAt: string };
  'director:report-persisted': { projectId: string; reportVersion: string; persistedAt: string };
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
  'render:queue-paused': {
    activeJobs: number;
    queuedJobs: number;
    pausedAt: string;
  };
  'render:queue-resumed': {
    activeJobs: number;
    queuedJobs: number;
    resumedAt: string;
  };
  'render:concurrency-changed': {
    previousConcurrency: number;
    concurrency: number;
    activeJobs: number;
    queuedJobs: number;
    changedAt: string;
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
