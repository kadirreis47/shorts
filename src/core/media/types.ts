import type { Scene } from '@/lib/types';

export type MediaAssetType =
  | 'image'
  | 'video'
  | 'ai_image'
  | 'broll'
  | 'overlay'
  | 'logo'
  | 'intro'
  | 'outro'
  | 'music'
  | 'voice'
  | 'sfx';

export type MediaTrackType =
  | 'video'
  | 'voice'
  | 'music'
  | 'subtitle'
  | 'overlay'
  | 'effects';

export type CameraMotion = 'none' | 'zoom_in' | 'zoom_out' | 'pan_left' | 'pan_right' | 'ken_burns';
export type TransitionType = 'cut' | 'fade' | 'crossfade' | 'slide' | 'zoom' | 'blur';

export interface MediaResolution {
  width: number;
  height: number;
}

export interface MediaProjectSettings {
  fps: number;
  resolution: MediaResolution;
  aspectRatio: string;
  defaultTransitionMs: number;
  wordsPerMinute: number;
  minimumSceneDurationMs: number;
  maximumSceneDurationMs: number;
}

export interface MediaAsset {
  id: string;
  type: MediaAssetType;
  source: string;
  durationMs?: number;
  mimeType?: string;
  metadata: Readonly<Record<string, unknown>>;
}

export interface MediaTransition {
  type: TransitionType;
  durationMs: number;
}

export interface MediaScene {
  id: string;
  index: number;
  text: string;
  visualPrompt: string;
  keywords: string[];
  startMs: number;
  endMs: number;
  durationMs: number;
  assetIds: string[];
  cameraMotion: CameraMotion;
  transition: MediaTransition;
  subtitleText: string;
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

export interface MediaTimeline {
  durationMs: number;
  scenes: MediaScene[];
  tracks: MediaTrack[];
}

export interface MediaProjectMetadata {
  title: string;
  source: 'ai-script' | 'manual' | 'imported';
  createdAt: string;
  updatedAt: string;
  tags: string[];
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
}

export interface RenderManifest {
  schemaVersion: '1.0';
  projectId: string;
  createdAt: string;
  durationMs: number;
  render: {
    fps: number;
    width: number;
    height: number;
    aspectRatio: string;
  };
  assets: MediaAsset[];
  timeline: MediaTimeline;
  metadata: MediaProjectMetadata;
}

export interface CreateMediaProjectInput {
  title: string;
  scenes: Scene[];
  tags?: string[];
  settings?: Partial<MediaProjectSettings>;
}

export interface MediaProjectBuildResult {
  project: MediaProject;
  manifest: RenderManifest;
  renderReady: boolean;
}
