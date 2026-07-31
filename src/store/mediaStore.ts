import { create } from 'zustand';
import type {
  AssetResolutionReport,
  AudioMixMetrics,
  MediaProject,
  RenderManifest,
  SubtitleMetrics,
  TimelineMetrics,
} from '@/core/media';

interface MediaState {
  project: MediaProject | null;
  manifest: RenderManifest | null;
  renderReady: boolean;
  building: boolean;
  error: string | null;
  timelineMetrics: TimelineMetrics | null;
  markerCount: number;
  assetResolution: AssetResolutionReport | null;
  subtitleMetrics: SubtitleMetrics | null;
  subtitleCueCount: number;
  audioMetrics: AudioMixMetrics | null;
  audioSegmentCount: number;
  setBuildStarted: () => void;
  setBuildResult: (
    project: MediaProject,
    manifest: RenderManifest,
    renderReady: boolean,
    assetResolution?: AssetResolutionReport,
  ) => void;
  setBuildError: (message: string) => void;
  clearMediaProject: () => void;
}

export const useMediaStore = create<MediaState>()((set) => ({
  project: null,
  manifest: null,
  renderReady: false,
  building: false,
  error: null,
  timelineMetrics: null,
  markerCount: 0,
  assetResolution: null,
  subtitleMetrics: null,
  subtitleCueCount: 0,
  audioMetrics: null,
  audioSegmentCount: 0,
  setBuildStarted: () => set({ building: true, error: null }),
  setBuildResult: (project, manifest, renderReady, assetResolution) => set({
    project,
    manifest,
    renderReady,
    building: false,
    error: null,
    timelineMetrics: project.timeline.metrics,
    markerCount: project.timeline.markers.length,
    assetResolution: assetResolution ?? null,
    subtitleMetrics: project.subtitles.metrics,
    subtitleCueCount: project.subtitles.cues.length,
    audioMetrics: project.audio.metrics,
    audioSegmentCount: project.audio.voice.length + project.audio.music.length + project.audio.sfx.length,
  }),
  setBuildError: (error) => set({ building: false, error, renderReady: false }),
  clearMediaProject: () => set({
    project: null,
    manifest: null,
    renderReady: false,
    building: false,
    error: null,
    timelineMetrics: null,
    markerCount: 0,
    assetResolution: null,
    subtitleMetrics: null,
    subtitleCueCount: 0,
    audioMetrics: null,
    audioSegmentCount: 0,
  }),
}));
