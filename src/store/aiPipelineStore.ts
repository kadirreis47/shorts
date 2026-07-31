import { create } from 'zustand';
import type { AppErrorCode } from '@/core/errors';

export type AIPipelineViewStatus =
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface AIPipelineRunView {
  runId: string;
  pipelineId: string;
  title: string;
  status: AIPipelineViewStatus;
  currentStepId: string | null;
  currentStepTitle: string | null;
  currentStepIndex: number;
  totalSteps: number;
  progress: number;
  attempt: number;
  maxAttempts: number;
  retryCount: number;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  elapsedMs: number;
  errorCode: AppErrorCode | null;
  errorMessage: string | null;
}

interface AIPipelineStoreState {
  activeRuns: Record<string, AIPipelineRunView>;
  history: AIPipelineRunView[];
  started: (run: Pick<AIPipelineRunView, 'runId' | 'pipelineId' | 'title' | 'totalSteps' | 'startedAt'>) => void;
  stepStarted: (payload: {
    runId: string;
    stepId: string;
    title: string;
    stepIndex: number;
    totalSteps: number;
    startedAt: string;
  }) => void;
  stepRetrying: (payload: {
    runId: string;
    attempt: number;
    nextAttempt: number;
    maxAttempts: number;
    retryingAt: string;
  }) => void;
  stepCompleted: (payload: {
    runId: string;
    stepIndex: number;
    totalSteps: number;
    completedAt: string;
  }) => void;
  completed: (payload: {
    runId: string;
    durationMs: number;
    completedAt: string;
  }) => void;
  failed: (payload: {
    runId: string;
    code: AppErrorCode;
    message: string;
    failedAt: string;
  }) => void;
  cancelled: (payload: { runId: string; cancelledAt: string }) => void;
  tick: (now?: number) => void;
  clearHistory: () => void;
}

const HISTORY_LIMIT = 25;

function clampProgress(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function moveToHistory(
  state: AIPipelineStoreState,
  runId: string,
  patch: Partial<AIPipelineRunView>,
): Pick<AIPipelineStoreState, 'activeRuns' | 'history'> {
  const current = state.activeRuns[runId];
  if (!current) {
    return { activeRuns: state.activeRuns, history: state.history };
  }

  const finished: AIPipelineRunView = {
    ...current,
    ...patch,
  };
  const { [runId]: _removed, ...activeRuns } = state.activeRuns;

  return {
    activeRuns,
    history: [finished, ...state.history].slice(0, HISTORY_LIMIT),
  };
}

export const useAIPipelineStore = create<AIPipelineStoreState>()((set) => ({
  activeRuns: {},
  history: [],

  started: ({ runId, pipelineId, title, totalSteps, startedAt }) =>
    set((state) => ({
      activeRuns: {
        ...state.activeRuns,
        [runId]: {
          runId,
          pipelineId,
          title,
          status: 'running',
          currentStepId: null,
          currentStepTitle: null,
          currentStepIndex: -1,
          totalSteps,
          progress: 0,
          attempt: 0,
          maxAttempts: 1,
          retryCount: 0,
          startedAt,
          updatedAt: startedAt,
          completedAt: null,
          elapsedMs: 0,
          errorCode: null,
          errorMessage: null,
        },
      },
    })),

  stepStarted: ({ runId, stepId, title, stepIndex, totalSteps, startedAt }) =>
    set((state) => {
      const current = state.activeRuns[runId];
      if (!current) return state;

      return {
        activeRuns: {
          ...state.activeRuns,
          [runId]: {
            ...current,
            currentStepId: stepId,
            currentStepTitle: title,
            currentStepIndex: stepIndex,
            totalSteps,
            progress: clampProgress((stepIndex / Math.max(1, totalSteps)) * 100),
            attempt: 1,
            maxAttempts: 1,
            updatedAt: startedAt,
          },
        },
      };
    }),

  stepRetrying: ({ runId, nextAttempt, maxAttempts, retryingAt }) =>
    set((state) => {
      const current = state.activeRuns[runId];
      if (!current) return state;

      return {
        activeRuns: {
          ...state.activeRuns,
          [runId]: {
            ...current,
            attempt: nextAttempt,
            maxAttempts,
            retryCount: current.retryCount + 1,
            updatedAt: retryingAt,
          },
        },
      };
    }),

  stepCompleted: ({ runId, stepIndex, totalSteps, completedAt }) =>
    set((state) => {
      const current = state.activeRuns[runId];
      if (!current) return state;

      return {
        activeRuns: {
          ...state.activeRuns,
          [runId]: {
            ...current,
            progress: clampProgress(((stepIndex + 1) / Math.max(1, totalSteps)) * 100),
            updatedAt: completedAt,
          },
        },
      };
    }),

  completed: ({ runId, durationMs, completedAt }) =>
    set((state) =>
      moveToHistory(state, runId, {
        status: 'completed',
        progress: 100,
        elapsedMs: durationMs,
        completedAt,
        updatedAt: completedAt,
      }),
    ),

  failed: ({ runId, code, message, failedAt }) =>
    set((state) => {
      const current = state.activeRuns[runId];
      const elapsedMs = current
        ? Math.max(0, Date.parse(failedAt) - Date.parse(current.startedAt))
        : 0;

      return moveToHistory(state, runId, {
        status: 'failed',
        elapsedMs,
        completedAt: failedAt,
        updatedAt: failedAt,
        errorCode: code,
        errorMessage: message,
      });
    }),

  cancelled: ({ runId, cancelledAt }) =>
    set((state) => {
      const current = state.activeRuns[runId];
      const elapsedMs = current
        ? Math.max(0, Date.parse(cancelledAt) - Date.parse(current.startedAt))
        : 0;

      return moveToHistory(state, runId, {
        status: 'cancelled',
        elapsedMs,
        completedAt: cancelledAt,
        updatedAt: cancelledAt,
      });
    }),

  tick: (now = Date.now()) =>
    set((state) => {
      const entries = Object.entries(state.activeRuns);
      if (entries.length === 0) return state;

      return {
        activeRuns: Object.fromEntries(
          entries.map(([runId, run]) => [
            runId,
            {
              ...run,
              elapsedMs: Math.max(0, now - Date.parse(run.startedAt)),
            },
          ]),
        ),
      };
    }),

  clearHistory: () => set({ history: [] }),
}));
