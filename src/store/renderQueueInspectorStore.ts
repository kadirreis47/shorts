import { create } from 'zustand';
import type {
  RenderJobSnapshot,
  RenderJobStatus,
} from '@/core/render';

export interface RenderQueueItem {
  id: string;
  projectId: string;
  adapterId: string | null;
  status: RenderJobStatus;
  stage: RenderJobSnapshot['stage'];
  progress: number;
  message: string;
  outputPath?: string;
  queuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  elapsedMs: number;
  error: string | null;
}

interface RenderQueueInspectorState {
  jobs: RenderQueueItem[];
  selectedJobId: string | null;
  queuePaused: boolean;
  upsert: (snapshot: RenderJobSnapshot) => void;
  remove: (jobId: string) => void;
  select: (jobId: string | null) => void;
  setQueuePaused: (paused: boolean) => void;
  clearTerminal: () => void;
  reset: () => void;
}

const MAX_ITEMS = 100;

export const useRenderQueueInspectorStore =
  create<RenderQueueInspectorState>()((set) => ({
    jobs: [],
    selectedJobId: null,
    queuePaused: false,

    upsert: (snapshot) =>
      set((state) => {
        const item = mapSnapshot(snapshot);
        const jobs = [
          item,
          ...state.jobs.filter((job) => job.id !== item.id),
        ]
          .sort(sortJobs)
          .slice(0, MAX_ITEMS);

        return {
          jobs,
          selectedJobId:
            state.selectedJobId ?? item.id,
        };
      }),

    remove: (jobId) =>
      set((state) => ({
        jobs: state.jobs.filter((job) => job.id !== jobId),
        selectedJobId:
          state.selectedJobId === jobId
            ? null
            : state.selectedJobId,
      })),

    select: (jobId) => set({ selectedJobId: jobId }),

    setQueuePaused: (queuePaused) => set({ queuePaused }),

    clearTerminal: () =>
      set((state) => {
        const jobs = state.jobs.filter(
          (job) => !isTerminal(job.status),
        );
        return {
          jobs,
          selectedJobId:
            jobs.some((job) => job.id === state.selectedJobId)
              ? state.selectedJobId
              : jobs[0]?.id ?? null,
        };
      }),

    reset: () =>
      set({
        jobs: [],
        selectedJobId: null,
        queuePaused: false,
      }),
  }));

function mapSnapshot(
  snapshot: RenderJobSnapshot,
): RenderQueueItem {
  return {
    id: snapshot.id,
    projectId: snapshot.projectId,
    adapterId: snapshot.adapterId,
    status: snapshot.status,
    stage: snapshot.stage,
    progress: snapshot.progress,
    message: snapshot.message,
    outputPath: snapshot.outputPath,
    queuedAt: snapshot.queuedAt,
    startedAt: snapshot.startedAt,
    completedAt: snapshot.completedAt,
    elapsedMs: snapshot.elapsedMs,
    error: snapshot.error,
  };
}

function sortJobs(
  left: RenderQueueItem,
  right: RenderQueueItem,
): number {
  const leftTerminal = isTerminal(left.status);
  const rightTerminal = isTerminal(right.status);

  if (leftTerminal !== rightTerminal) {
    return leftTerminal ? 1 : -1;
  }

  return (
    Date.parse(right.queuedAt) -
    Date.parse(left.queuedAt)
  );
}

function isTerminal(status: RenderJobStatus): boolean {
  return (
    status === 'completed' ||
    status === 'failed' ||
    status === 'cancelled'
  );
}
