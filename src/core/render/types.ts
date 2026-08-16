import type { RenderManifest } from '@/core/media';

export type RenderJobStatus =
  | 'queued'
  | 'preparing'
  | 'rendering'
  | 'finalizing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type RenderStage =
  | 'queued'
  | 'validating'
  | 'planning'
  | 'assets'
  | 'video'
  | 'audio'
  | 'subtitles'
  | 'finalizing'
  | 'completed';

export type RenderOutputKind = 'plan' | 'video';

export interface RenderPreset {
  id: string;
  name: string;
  container: 'mp4' | 'webm';
  videoCodec: 'h264' | 'hevc' | 'av1' | 'vp9';
  audioCodec: 'aac' | 'opus';
  quality: 'draft' | 'standard' | 'high';
  hardwareAcceleration: 'auto' | 'disabled' | 'nvenc';
  /** Effective encoder selected by the export planner. */
  encoder?: string;
  encoderMode?: 'software' | 'hardware';
  bitrateKbps?: number;
  maxBitrateKbps?: number;
  bufferSizeKbps?: number;
  crf?: number;
  encoderPreset?: string;
  frameRate?: number;
  pixelFormat?: 'yuv420p' | 'yuv444p';
  gopFrames?: number;
  keyframeInterval?: number;
  threads?: number;
  audioBitrateKbps?: number;
  sampleRate?: number;
  audioChannels?: number;
  colorSpace?: string;
  profile?: string;
}

export interface RenderJobRequest {
  manifest: RenderManifest;
  preset?: Partial<RenderPreset>;
  outputPath?: string;
  metadata?: Readonly<Record<string, unknown>>;
  forceRender?: boolean;
  incremental?: boolean;
}

export interface RenderProgress {
  jobId: string;
  stage: RenderStage;
  progress: number;
  frame?: number;
  totalFrames?: number;
  message: string;
  updatedAt: string;
}

export interface RenderOutput {
  kind: RenderOutputKind;
  uri: string;
  mimeType: string;
  sizeBytes?: number;
  durationMs: number;
  metadata: Readonly<Record<string, unknown>>;
}

export interface RenderJobSnapshot {
  id: string;
  projectId: string;
  adapterId: string | null;
  status: RenderJobStatus;
  stage: RenderStage;
  progress: number;
  message: string;
  preset: RenderPreset;
  outputPath?: string;
  output: RenderOutput | null;
  error: string | null;
  queuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  elapsedMs: number;
}

export interface RenderExecutionContext {
  jobId: string;
  manifest: RenderManifest;
  preset: RenderPreset;
  outputPath?: string;
  signal: AbortSignal;
  incrementalPlan?: import('./incrementalTypes').IncrementalRenderPlan;
  reportProgress: (
    progress: Omit<RenderProgress, 'jobId' | 'updatedAt'>,
  ) => Promise<void>;
}

export interface RenderAdapter {
  readonly id: string;
  readonly name: string;
  canRender(manifest: RenderManifest, preset: RenderPreset): boolean;
  render(context: RenderExecutionContext): Promise<RenderOutput>;
}

export interface RenderEngineOptions {
  concurrency?: number;
  defaultPreset?: Partial<RenderPreset>;
  cache?: import('./renderCache').RenderCache;
  outputExists?: (uri: string) => Promise<boolean>;
  incrementalPlanner?: import('./incrementalRenderPlanner').IncrementalRenderPlanner;
  recoveryStore?: import('./renderRecovery').RenderRecoveryStore;
  retryPolicy?: Partial<import('./renderResilience').RenderRetryPolicy>;
  circuitBreaker?: import('./renderResilience').RenderCircuitBreaker;
  metricsCollector?: import('./renderMetrics').RenderMetricsCollector;
  /**
   * Resolves execution-only media immediately before an adapter runs. The
   * engine retains and checkpoints the original canonical request.
   */
  materializeManifestForExecution?: (
    manifest: RenderManifest,
  ) => Promise<RenderManifest>;
}

export interface RenderEngine {
  submit(request: RenderJobRequest): Promise<RenderJobSnapshot>;
  cancel(jobId: string): boolean;
  cancelAll(): void;
  getJob(jobId: string): RenderJobSnapshot | null;
  listJobs(): RenderJobSnapshot[];
  registerAdapter(adapter: RenderAdapter): void;
  getConcurrency(): number;
  setConcurrency(concurrency: number): number;
  pauseQueue(): void;
  resumeQueue(): void;
  isQueuePaused(): boolean;
  retry(jobId: string): Promise<RenderJobSnapshot>;
  metrics(): import('./renderMetrics').RenderPerformanceSnapshot;
  resetMetrics(): void;
  dispose(): void;
}

export const DEFAULT_RENDER_PRESET: RenderPreset = {
  id: 'shorts-standard',
  name: 'Shorts Standard',
  container: 'mp4',
  videoCodec: 'h264',
  audioCodec: 'aac',
  quality: 'standard',
  hardwareAcceleration: 'auto',
};
