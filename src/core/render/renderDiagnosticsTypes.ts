export interface RenderStreamDiagnostics {
  codecName: string | null;
  codecLongName: string | null;
  profile: string | null;
  width: number | null;
  height: number | null;
  pixelFormat: string | null;
  frameRate: number | null;
  bitRate: number | null;
  durationSeconds: number | null;
  sampleRate: number | null;
  channels: number | null;
  channelLayout: string | null;
}

export interface RenderDiagnostics {
  outputPath: string;
  containerFormat: string | null;
  durationSeconds: number | null;
  sizeBytes: number;
  overallBitRate: number | null;
  video: RenderStreamDiagnostics | null;
  audio: RenderStreamDiagnostics | null;
  warnings: string[];
  qualityScore: number;
  passed: boolean;
  analyzedAt: string;
}
