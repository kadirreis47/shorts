import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ModalState, ViewKey } from '@/store/types';

interface UIState {
  currentView: ViewKey;
  sidebarOpen: boolean;
  commandPaletteOpen: boolean;
  activeModal: ModalState | null;
  navigate: (view: ViewKey) => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  openModal: (modal: ModalState) => void;
  closeModal: () => void;
  resetTransientUI: () => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      currentView: 'dashboard',
      sidebarOpen: true,
      commandPaletteOpen: false,
      activeModal: null,
      navigate: (currentView) => set({ currentView }),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      toggleSidebar: () =>
        set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setCommandPaletteOpen: (commandPaletteOpen) =>
        set({ commandPaletteOpen }),
      openModal: (activeModal) => set({ activeModal }),
      closeModal: () => set({ activeModal: null }),
      resetTransientUI: () =>
        set({
          commandPaletteOpen: false,
          activeModal: null,
        }),
    }),
    {
      name: 'shortsflow-ui',
      version: 1,
      partialize: (state) => ({
        currentView: state.currentView,
        sidebarOpen: state.sidebarOpen,
      }),
    },
  ),
);
