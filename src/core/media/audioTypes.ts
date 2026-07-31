export type AudioLayerType = 'voice' | 'music' | 'sfx';
export type AudioAutomationType = 'gain' | 'ducking';

export interface AudioMixSettings {
  masterGain: number;
  voiceGain: number;
  musicGain: number;
  sfxGain: number;
  duckingGain: number;
  duckingAttackMs: number;
  duckingReleaseMs: number;
  musicFadeInMs: number;
  musicFadeOutMs: number;
  targetLufs: number;
}

export interface AudioSegment {
  id: string;
  type: AudioLayerType;
  sceneId?: string;
  assetId?: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  gain: number;
  fadeInMs: number;
  fadeOutMs: number;
  metadata: Readonly<Record<string, unknown>>;
}

export interface AudioAutomationPoint {
  id: string;
  type: AudioAutomationType;
  trackType: AudioLayerType;
  timeMs: number;
  gain: number;
  sceneId?: string;
  metadata: Readonly<Record<string, unknown>>;
}

export interface AudioMixMetrics {
  durationMs: number;
  voiceCoverage: number;
  duckingEventCount: number;
  sfxCount: number;
  peakConcurrentLayers: number;
  estimatedIntegratedLufs: number;
}

export interface AudioTimeline {
  durationMs: number;
  settings: AudioMixSettings;
  voice: AudioSegment[];
  music: AudioSegment[];
  sfx: AudioSegment[];
  automation: AudioAutomationPoint[];
  metrics: AudioMixMetrics;
}

export interface AudioBuildOptions {
  settings?: Partial<AudioMixSettings>;
  musicAssetId?: string;
  voiceAssetIdsByScene?: Readonly<Record<string, string>>;
}
