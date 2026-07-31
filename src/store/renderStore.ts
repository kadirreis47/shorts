import { create } from 'zustand';
import type {
  RenderJobSnapshot,
  RenderOutputKind,
  RenderStage,
} from '@/core/render';

interface RenderStoreState {
  activeJobs: Record<string, RenderJobSnapshot>;
  history: RenderJobSnapshot[];
  queued: (payload: {
    jobId: string;
    projectId: string;
    adapterId: string;
    queuedAt: string;
  }) => void;
  started: (payload: {
    jobId: string;
    adapterId: string;
    startedAt: string;
  }) => void;
  progressed: (payload: {
    jobId: string;
    stage: RenderStage;
    progress: number;
    message: string;
    updatedAt: string;
  }) => void;
  completed: (payload: {
    jobId: string;
    outputKind: RenderOutputKind;
    outputUri: string;
    durationMs: number;
    completedAt: string;
  }) => void;
  failed: (payload: {
    jobId: string;
    message: string;
    failedAt: string;
  }) => void;
  cancelled: (payload: {
    jobId: string;
    cancelledAt: string;
  }) => void;
  tick: (now?: number) => void;
  clearHistory: () => void;
}

const HISTORY_LIMIT = 30;

export const useRenderStore = create<RenderStoreState>()((set) => ({
  activeJobs: {},
  history: [],

  queued: ({ jobId, projectId, adapterId, queuedAt }) =>
    set((state) => ({
      activeJobs: {
        ...state.activeJobs,
        [jobId]: {
          id: jobId,
          projectId,
          adapterId,
          status: 'queued',
          stage: 'queued',
          progress: 0,
          message: 'Render işi kuyruğa alındı',
          preset: {
            id: 'shorts-standard',
            name: 'Shorts Standard',
            container: 'mp4',
            videoCodec: 'h264',
            audioCodec: 'aac',
            quality: 'standard',
            hardwareAcceleration: 'auto',
          },
          output: null,
          error: null,
          queuedAt,
          startedAt: null,
          completedAt: null,
          elapsedMs: 0,
        },
      },
    })),

  started: ({ jobId, adapterId, startedAt }) =>
    set((state) => {
      const current = state.activeJobs[jobId];
      if (!current) return state;
      return {
        activeJobs: {
          ...state.activeJobs,
          [jobId]: {
            ...current,
            adapterId,
            status: 'preparing',
            stage: 'validating',
            progress: 1,
            message: 'Render işi hazırlanıyor',
            startedAt,
          },
        },
      };
    }),

  progressed: ({ jobId, stage, progress, message, updatedAt }) =>
    set((state) => {
      const current = state.activeJobs[jobId];
      if (!current) return state;
      return {
        activeJobs: {
          ...state.activeJobs,
          [jobId]: {
            ...current,
            status:
              stage === 'finalizing'
                ? 'finalizing'
                : stage === 'validating' || stage === 'planning'
                  ? 'preparing'
                  : 'rendering',
            stage,
            progress,
            message,
            elapsedMs: current.startedAt
              ? Math.max(0, Date.parse(updatedAt) - Date.parse(current.startedAt))
              : 0,
          },
        },
      };
    }),

  completed: ({ jobId, outputKind, outputUri, durationMs, completedAt }) =>
    set((state) =>
      moveToHistory(state, jobId, {
        status: 'completed',
        stage: 'completed',
        progress: 100,
        message:
          outputKind === 'video'
            ? 'Video render tamamlandı'
            : 'Render yürütme planı hazır',
        output: {
          kind: outputKind,
          uri: outputUri,
          mimeType:
            outputKind === 'video'
              ? 'video/mp4'
              : 'application/vnd.shortsflow.render-plan+json',
          durationMs,
          metadata: {},
        },
        elapsedMs: durationMs,
        completedAt,
      }),
    ),

  failed: ({ jobId, message, failedAt }) =>
    set((state) =>
      moveToHistory(state, jobId, {
        status: 'failed',
        message: 'Render işlemi başarısız oldu',
        error: message,
        completedAt: failedAt,
      }),
    ),

  cancelled: ({ jobId, cancelledAt }) =>
    set((state) =>
      moveToHistory(state, jobId, {
        status: 'cancelled',
        message: 'Render işlemi iptal edildi',
        completedAt: cancelledAt,
      }),
    ),

  tick: (now = Date.now()) =>
    set((state) => {
      const activeEntries = Object.entries(state.activeJobs);
      if (activeEntries.length === 0) return state;

      return {
        activeJobs: Object.fromEntries(
          activeEntries.map(([jobId, job]) => [
            jobId,
            {
              ...job,
              elapsedMs: job.startedAt
                ? Math.max(0, now - Date.parse(job.startedAt))
                : 0,
            },
          ]),
        ),
      };
    }),

  clearHistory: () => set({ history: [] }),
}));

function moveToHistory(
  state: RenderStoreState,
  jobId: string,
  patch: Partial<RenderJobSnapshot>,
): Pick<RenderStoreState, 'activeJobs' | 'history'> {
  const current = state.activeJobs[jobId];
  if (!current) {
    return {
      activeJobs: state.activeJobs,
      history: state.history,
    };
  }

  const finished: RenderJobSnapshot = {
    ...current,
    ...patch,
  };
  const { [jobId]: _removed, ...activeJobs } = state.activeJobs;

  return {
    activeJobs,
    history: [finished, ...state.history].slice(0, HISTORY_LIMIT),
  };
}
