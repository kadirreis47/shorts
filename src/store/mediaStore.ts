import { create } from 'zustand';
import type { MediaProject, RenderManifest, TimelineMetrics } from '@/core/media';

interface MediaState {
  project: MediaProject | null;
  manifest: RenderManifest | null;
  renderReady: boolean;
  building: boolean;
  error: string | null;
  timelineMetrics: TimelineMetrics | null;
  markerCount: number;
  setBuildStarted: () => void;
  setBuildResult: (project: MediaProject, manifest: RenderManifest, renderReady: boolean) => void;
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
  setBuildStarted: () => set({ building: true, error: null }),
  setBuildResult: (project, manifest, renderReady) => set({
    project,
    manifest,
    renderReady,
    building: false,
    error: null,
    timelineMetrics: project.timeline.metrics,
    markerCount: project.timeline.markers.length,
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
  }),
}));
