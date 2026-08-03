import { create } from 'zustand';
import type {
  AssetResolutionReport,
  AudioMixMetrics,
  MediaProject,
  MediaValidationReport,
  RenderManifest,
  SubtitleMetrics,
  TimelineMetrics,
} from '@/core/media';
import { createManifestRevisionId } from '@/core/editing/editPlanCompiler';

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
  validation: MediaValidationReport | null;
  qualityScore: number;
  validationIssueCount: number;
  validationRequired: boolean;
  validatedManifestFingerprint: string | null;
  setBuildStarted: () => void;
  setBuildResult: (
    project: MediaProject,
    manifest: RenderManifest,
    renderReady: boolean,
    assetResolution?: AssetResolutionReport,
    validation?: MediaValidationReport,
  ) => void;
  setBuildError: (message: string) => void;
  clearMediaProject: () => void;
  replaceEditedManifest: (manifest: RenderManifest) => void;
  replaceValidatedManifest: (manifest: RenderManifest, validation: MediaValidationReport) => void;
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
  validation: null,
  qualityScore: 0,
  validationIssueCount: 0,
  validationRequired: false,
  validatedManifestFingerprint: null,
  setBuildStarted: () => set({ building: true, error: null }),
  setBuildResult: (project, manifest, renderReady, assetResolution, validation) => set(() => { const resolvedValidation = validation ?? manifest.validation; const validatedManifest = resolvedValidation ? { ...manifest, validation: resolvedValidation } : manifest; return {
    project,
    manifest: validatedManifest,
    renderReady: renderReady && resolvedValidation?.renderReady === true,
    building: false,
    error: null,
    timelineMetrics: project.timeline.metrics,
    markerCount: project.timeline.markers.length,
    assetResolution: assetResolution ?? null,
    subtitleMetrics: project.subtitles.metrics,
    subtitleCueCount: project.subtitles.cues.length,
    audioMetrics: project.audio.metrics,
    audioSegmentCount: project.audio.voice.length + project.audio.music.length + project.audio.sfx.length,
    validation: resolvedValidation,
    qualityScore: resolvedValidation?.score ?? 0,
    validationIssueCount: resolvedValidation?.issues.length ?? 0,
    validationRequired: resolvedValidation === null,
    validatedManifestFingerprint: resolvedValidation ? createManifestRevisionId(validatedManifest) : null,
  }; }),
  setBuildError: (error) => set({ building: false, error, renderReady: false }),
  replaceEditedManifest: (manifest) => set((state) => state.project?.id === manifest.projectId ? manifestState(state.project, { ...manifest, validation: null }, null, false, true) : state),
  replaceValidatedManifest: (manifest, validation) => set((state) => state.project?.id === manifest.projectId ? manifestState(state.project, { ...manifest, validation }, validation, validation.renderReady, false) : state),
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
    validation: null,
    qualityScore: 0,
    validationIssueCount: 0,
    validationRequired: false,
    validatedManifestFingerprint: null,
  }),
}));

function manifestState(project: MediaProject, manifest: RenderManifest, validation: MediaValidationReport | null, renderReady: boolean, validationRequired: boolean): Partial<MediaState> { return {
  manifest, project: { ...project, scenes: manifest.timeline.scenes, assets: manifest.assets, tracks: manifest.timeline.tracks, timeline: manifest.timeline, subtitles: manifest.subtitles, audio: manifest.audio, metadata: manifest.metadata },
  renderReady, validation, qualityScore: validation?.score ?? 0, validationIssueCount: validation?.issues.length ?? 0,
  validationRequired, validatedManifestFingerprint: validation ? createManifestRevisionId(manifest) : null,
  timelineMetrics: manifest.timeline.metrics, markerCount: manifest.timeline.markers.length, subtitleMetrics: manifest.subtitles.metrics,
  subtitleCueCount: manifest.subtitles.cues.length, audioMetrics: manifest.audio.metrics,
  audioSegmentCount: manifest.audio.voice.length + manifest.audio.music.length + manifest.audio.sfx.length,
}; }
