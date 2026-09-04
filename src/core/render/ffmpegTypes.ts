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
  ffprobeAvailable?: boolean;
  ffprobeExecutable?: string | null;
  ffprobeVersion?: string | null;
}

export interface FFmpegRunRequest {
  operation: 'full-render' | 'segment-render' | 'segment-concat';
  jobId: string;
  outputPath?: string;
  outputResourceReference?: string;
  intent: import('./nativeRenderIntent').CanonicalNativeRenderIntent;
}

export interface FFmpegImageGeometryAuthorityDeclaration {
  inputIndex: number;
  authorityReference: string;
  mediaIdentity: string;
  expectedOrientation: import('@/core/media/imageDisplayGeometry').ImageEncodedToDisplayOrientation;
  contentDigest: string;
  encodedDimensions: import('@/core/media/imageFraming').ImageFramingDimensions;
  displayDimensions: import('@/core/media/imageFraming').ImageFramingDimensions;
  /** Present only for meaningful framing; compared to main-resolved geometry before execution. */
  framingBinding?: import('@/core/media/imageFraming').ImageFramingBindingV1;
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

export interface VerifiedExportActionResult {
  ok: boolean;
  message?: string;
}

export interface FFmpegBridge {
  getCapabilities(forceRefresh?: boolean): Promise<FFmpegCapabilities>;
  probeManualMp4?(bytes: ArrayBuffer): Promise<{ container: 'mp4'; codec: 'h264'; width: number; height: number; fps: number; durationMs: number; hasAudio: boolean }>;
  createCanonicalRenderPlan(request: FFmpegRunRequest): Promise<{ version: 1; reference: string; expiresAt: string }>;
  executeCanonicalRenderPlan(reference: string): Promise<FFmpegRunResult>;
  resolveImageDisplayGeometry?(
    accessToken: string,
    media: import('@/lib/types').MediaStorageObject,
  ): Promise<import('@/core/media/imageDisplayGeometry').TrustedImageDisplayGeometryV1>;
  cancel(jobId: string): Promise<boolean>;
  resourceExists(path: string): Promise<boolean>;
  materializeRenderArtifact?(sourcePath: string, destinationPath: string): Promise<{ path: string; sizeBytes: number }>;
  issueSegmentResource(fingerprint: string): Promise<{ reference: string; exists: boolean }>;
  getSegmentCacheStats(): Promise<import('./segmentCache').SegmentCacheStats>;
  clearSegmentCache(): Promise<void>;
  analyzeRenderArtifact(path: string): Promise<import('./renderDiagnosticsTypes').RenderDiagnostics>;
  verifyRenderArtifact?(path: string): Promise<{ diagnostics: import('./renderDiagnosticsTypes').RenderDiagnostics; integrity: { artifactPath: string; sizeBytes: number; contentDigest: string }; publishCapability: { version: 1; reference: string; expiresAt: string } | null }>;
  revalidateArtifact?(artifact: { artifactPath: string; sizeBytes: number; contentDigest: string }): Promise<{ ok: true; artifact: { artifactPath: string; sizeBytes: number; contentDigest: string } } | { ok: false; error: { code: string; message: string } }>;
  openVerifiedExport?(artifact: { artifactPath: string; sizeBytes: number; contentDigest: string }): Promise<VerifiedExportActionResult>;
  revealVerifiedExport?(artifact: { artifactPath: string; sizeBytes: number; contentDigest: string }): Promise<VerifiedExportActionResult>;
  saveVerifiedExportAs?(artifact: { artifactPath: string; sizeBytes: number; contentDigest: string }, destinationPath: string): Promise<VerifiedExportActionResult & { path?: string; sizeBytes?: number }>;
  onProgress(listener: (payload: FFmpegProgressPayload) => void): () => void;
  pickOutputPath?(options?: { defaultPath?: string; purpose?: 'render' | 'save-copy' }): Promise<string | null>;
}
