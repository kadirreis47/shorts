export interface FFmpegCapabilities {
  available: boolean;
  executable: string | null;
  version: string | null;
  encoders: string[];
  hardwareEncoders: string[];
}

export interface FFmpegRunRequest {
  jobId: string;
  args: string[];
  outputPath?: string;
  subtitleContent?: string;
}

export interface FFmpegProgressPayload {
  jobId: string;
  frame: number;
  fps: number;
  outTimeMs: number;
  speed: number;
  progress: 'continue' | 'end';
}

export interface FFmpegRunResult {
  outputPath: string;
  sizeBytes: number;
  elapsedMs: number;
  exitCode: number;
  stderrTail: string[];
}

export interface FFmpegBridge {
  getCapabilities(): Promise<FFmpegCapabilities>;
  run(request: FFmpegRunRequest): Promise<FFmpegRunResult>;
  cancel(jobId: string): Promise<boolean>;
  onProgress(listener: (payload: FFmpegProgressPayload) => void): () => void;
}
