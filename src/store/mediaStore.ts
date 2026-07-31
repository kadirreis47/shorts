import { create } from 'zustand';
import type { MediaProject, RenderManifest } from '@/core/media';

interface MediaState {
  project: MediaProject | null;
  manifest: RenderManifest | null;
  renderReady: boolean;
  building: boolean;
  error: string | null;
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
  setBuildStarted: () => set({ building: true, error: null }),
  setBuildResult: (project, manifest, renderReady) => set({
    project,
    manifest,
    renderReady,
    building: false,
    error: null,
  }),
  setBuildError: (error) => set({ building: false, error, renderReady: false }),
  clearMediaProject: () => set({
    project: null,
    manifest: null,
    renderReady: false,
    building: false,
    error: null,
  }),
}));
