import { create } from 'zustand';
import type {
  RenderRecoveryRecord,
  RenderRecoverySnapshot,
} from '@/core/render';

interface RenderRecoveryCenterState {
  records: RenderRecoveryRecord[];
  interrupted: RenderRecoveryRecord[];
  selectedJobId: string | null;
  hydrate: (snapshot: RenderRecoverySnapshot) => void;
  select: (jobId: string | null) => void;
  remove: (jobId: string) => void;
  clearTerminal: () => void;
  reset: () => void;
}

export const useRenderRecoveryCenterStore =
  create<RenderRecoveryCenterState>()((set) => ({
    records: [],
    interrupted: [],
    selectedJobId: null,

    hydrate: (snapshot) =>
      set((state) => ({
        records: [...snapshot.records],
        interrupted: [...snapshot.interrupted],
        selectedJobId:
          state.selectedJobId &&
          snapshot.records.some(
            (record) => record.jobId === state.selectedJobId,
          )
            ? state.selectedJobId
            : snapshot.interrupted[0]?.jobId ??
              snapshot.records[0]?.jobId ??
              null,
      })),

    select: (jobId) => set({ selectedJobId: jobId }),

    remove: (jobId) =>
      set((state) => ({
        records: state.records.filter(
          (record) => record.jobId !== jobId,
        ),
        interrupted: state.interrupted.filter(
          (record) => record.jobId !== jobId,
        ),
        selectedJobId:
          state.selectedJobId === jobId
            ? null
            : state.selectedJobId,
      })),

    clearTerminal: () =>
      set((state) => {
        const active = state.records.filter((record) =>
          ['queued', 'running', 'interrupted'].includes(record.status),
        );
        return {
          records: active,
          interrupted: active.filter(
            (record) => record.status === 'interrupted',
          ),
          selectedJobId:
            active.some(
              (record) => record.jobId === state.selectedJobId,
            )
              ? state.selectedJobId
              : active[0]?.jobId ?? null,
        };
      }),

    reset: () =>
      set({
        records: [],
        interrupted: [],
        selectedJobId: null,
      }),
  }));
