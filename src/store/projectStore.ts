import { create } from 'zustand';
import type {
  ProjectDraft,
  ProjectSummary,
  SaveStatus,
} from '@/store/types';

interface ProjectState {
  currentProject: ProjectSummary | null;
  recentProjects: ProjectSummary[];
  drafts: ProjectDraft[];
  saveStatus: SaveStatus;
  lastSavedAt: string | null;
  setCurrentProject: (project: ProjectSummary | null) => void;
  setRecentProjects: (projects: ProjectSummary[]) => void;
  upsertDraft: (draft: ProjectDraft) => void;
  removeDraft: (draftId: string) => void;
  setSaveStatus: (status: SaveStatus) => void;
  markSaved: () => void;
  reset: () => void;
}

const initialState = {
  currentProject: null,
  recentProjects: [],
  drafts: [],
  saveStatus: 'idle' as SaveStatus,
  lastSavedAt: null,
};

export const useProjectStore = create<ProjectState>()((set) => ({
  ...initialState,
  setCurrentProject: (currentProject) => set({ currentProject }),
  setRecentProjects: (recentProjects) => set({ recentProjects }),
  upsertDraft: (draft) =>
    set((state) => {
      const exists = state.drafts.some((item) => item.id === draft.id);

      return {
        drafts: exists
          ? state.drafts.map((item) => (item.id === draft.id ? draft : item))
          : [draft, ...state.drafts],
      };
    }),
  removeDraft: (draftId) =>
    set((state) => ({
      drafts: state.drafts.filter((draft) => draft.id !== draftId),
    })),
  setSaveStatus: (saveStatus) => set({ saveStatus }),
  markSaved: () =>
    set({
      saveStatus: 'saved',
      lastSavedAt: new Date().toISOString(),
    }),
  reset: () => set(initialState),
}));
