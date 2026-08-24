import type { Scene } from '@/lib/types';
import type { MediaStorageObject } from '@/lib/types';
import type { AssetResolutionReport } from './assetProviderTypes';
import type { CanonicalSubtitleConfiguration, SubtitleTimeline } from './subtitleTypes';
import type { AudioBuildOptions, AudioTimeline } from './audioTypes';
import type { MediaValidationReport } from './validationTypes';
import type { NormalizedStudioProductionRecipeV1 } from './studioProductionRecipe';
import type { NarrationCharacterAlignment } from '@/shared/voiceoverAlignment';

export type MediaAssetType =
  | 'image' | 'video' | 'ai_image' | 'broll' | 'overlay' | 'logo'
  | 'intro' | 'outro' | 'music' | 'voice' | 'sfx';

export type MediaTrackType = 'video' | 'voice' | 'music' | 'subtitle' | 'overlay' | 'effects';
export type CameraMotion = 'none' | 'zoom_in' | 'zoom_out' | 'pan_left' | 'pan_right' | 'ken_burns';
/**
 * Bounded user-approved motion intent. This is deliberately separate from
 * per-scene CameraMotion: `pan` is resolved deterministically per scene by
 * the media engine, while CameraMotion is the executable scene-level result.
 */
export type CanonicalMotionMode = 'none' | 'ken_burns' | 'pan' | 'zoom_in' | 'zoom_out';

export interface CanonicalMotionConfiguration {
  mode: CanonicalMotionMode;
}
export type CanonicalTransitionType = 'cut' | 'crossfade';

export interface CanonicalTransitionConfiguration {
  type: CanonicalTransitionType;
}
export type CanonicalWatermarkPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/** Bounded global branding intent; logo media is intentionally not part of V1.1. */
export interface CanonicalBrandingConfiguration {
  watermark: { text: string; position: CanonicalWatermarkPosition } | null;
}
export type TransitionType = 'cut' | 'fade' | 'crossfade' | 'slide' | 'zoom' | 'blur';
export type SceneRole = 'hook' | 'setup' | 'development' | 'payoff' | 'cta' | 'outro';
export type PacingPreset = 'calm' | 'balanced' | 'dynamic' | 'viral';
export type TimelineMarkerType = 'scene-start' | 'scene-end' | 'transition' | 'beat' | 'emphasis';

export interface MediaResolution { width: number; height: number; }

export interface MediaProjectSettings {
  fps: number;
  resolution: MediaResolution;
  aspectRatio: string;
  defaultTransitionMs: number;
  wordsPerMinute: number;
  minimumSceneDurationMs: number;
  maximumSceneDurationMs: number;
  pacingPreset: PacingPreset;
  transitionOverlap: number;
  beatIntervalMs: number;
  snapToFrames: boolean;
}

export interface MediaAsset {
  id: string;
  type: MediaAssetType;
  source: string;
  durationMs?: number;
  mimeType?: string;
  metadata: Readonly<Record<string, unknown>>;
}

export interface MediaTransition { type: TransitionType; durationMs: number; }

export interface MediaScene {
  id: string;
  index: number;
  role: SceneRole;
  text: string;
  visualPrompt: string;
  keywords: string[];
  startMs: number;
  endMs: number;
  durationMs: number;
  overlapBeforeMs: number;
  overlapAfterMs: number;
  assetIds: string[];
  cameraMotion: CameraMotion;
  transition: MediaTransition;
  subtitleText: string;
  intensity: number;
  sourceScene: Scene;
}

export interface MediaClip {
  id: string;
  sceneId: string;
  assetId?: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  offsetMs: number;
  metadata: Readonly<Record<string, unknown>>;
}

export interface MediaTrack {
  id: string;
  type: MediaTrackType;
  order: number;
  muted: boolean;
  volume: number;
  clips: MediaClip[];
}

export interface TimelineMarker {
  id: string;
  type: TimelineMarkerType;
  timeMs: number;
  sceneId?: string;
  label: string;
  metadata: Readonly<Record<string, unknown>>;
}

export interface TimelineMetrics {
  durationMs: number;
  averageSceneDurationMs: number;
  shortestSceneDurationMs: number;
  longestSceneDurationMs: number;
  cutsPerMinute: number;
  transitionCoverage: number;
  pacingScore: number;
}

export interface MediaTimeline {
  durationMs: number;
  scenes: MediaScene[];
  tracks: MediaTrack[];
  markers: TimelineMarker[];
  metrics: TimelineMetrics;
}

export interface MediaProjectMetadata {
  title: string;
  source: 'ai-script' | 'manual' | 'imported';
  createdAt: string;
  updatedAt: string;
  tags: string[];
  productionRecipe?: NormalizedStudioProductionRecipeV1;
}

export interface MediaProject {
  id: string;
  version: 1;
  settings: MediaProjectSettings;
  metadata: MediaProjectMetadata;
  scenes: MediaScene[];
  assets: MediaAsset[];
  tracks: MediaTrack[];
  timeline: MediaTimeline;
  subtitles: SubtitleTimeline;
  audio: AudioTimeline;
  branding?: CanonicalBrandingConfiguration;
}

export interface RenderManifest {
  schemaVersion: '1.4';
  projectId: string;
  createdAt: string;
  durationMs: number;
  render: { fps: number; width: number; height: number; aspectRatio: string; };
  assets: MediaAsset[];
  timeline: MediaTimeline;
  subtitles: SubtitleTimeline;
  audio: AudioTimeline;
  branding?: CanonicalBrandingConfiguration;
  validation: MediaValidationReport | null;
  metadata: MediaProjectMetadata;
}

export interface CreateMediaProjectInput {
  projectId?: string;
  title: string;
  scenes: Scene[];
  tags?: string[];
  settings?: Partial<MediaProjectSettings>;
  audio?: AudioBuildOptions;
  music?: {
    storage: MediaStorageObject;
    volume: number;
  };
  narration?: {
    storage: MediaStorageObject;
    durationMs: number;
    scriptRevision: string;
    voiceId: string;
    alignment?: NarrationCharacterAlignment;
  };
  subtitles?: CanonicalSubtitleConfiguration;
  motion?: CanonicalMotionConfiguration;
  transition?: CanonicalTransitionConfiguration;
  branding?: CanonicalBrandingConfiguration;
  productionRecipe?: NormalizedStudioProductionRecipeV1;
}

export interface MediaProjectBuildResult {
  project: MediaProject;
  manifest: RenderManifest;
  renderReady: boolean;
  assetResolution: AssetResolutionReport;
  subtitleTimeline: SubtitleTimeline;
  audioTimeline: AudioTimeline;
  validation: MediaValidationReport;
}
