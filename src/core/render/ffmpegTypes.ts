export interface GPUDeviceInfo {
  index: number;
  name: string;
  driverVersion: string | null;
  memoryTotalMiB: number | null;
  memoryFreeMiB: number | null;
  utilizationPercent: number | null;
  temperatureCelsius: number | null;
}

export interface FFmpegCapabilities {
  available: boolean;
  executable: string | null;
  version: string | null;
  encoders: string[];
  hardwareEncoders: string[];
  gpuDevices: GPUDeviceInfo[];
}

export interface FFmpegRunRequest {
  jobId: string;
  args: string[];
  outputPath?: string;
  subtitleContent?: string;
  concatContent?: string;
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
  getCapabilities(forceRefresh?: boolean): Promise<FFmpegCapabilities>;
  run(request: FFmpegRunRequest): Promise<FFmpegRunResult>;
  cancel(jobId: string): Promise<boolean>;
  fileExists(path: string): Promise<boolean>;
  getSegmentPath(fingerprint: string): Promise<string>;
  segmentExists(fingerprint: string): Promise<boolean>;
  getSegmentCacheStats(): Promise<import('./segmentCache').SegmentCacheStats>;
  clearSegmentCache(): Promise<void>;
  analyzeOutput(path: string): Promise<import('./renderDiagnosticsTypes').RenderDiagnostics>;
  onProgress(listener: (payload: FFmpegProgressPayload) => void): () => void;
}
