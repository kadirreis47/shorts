import { create } from 'zustand';
import type { AppError, AppLifecycle } from '@/store/types';

interface AppState {
  lifecycle: AppLifecycle;
  initialized: boolean;
  offline: boolean;
  version: string;
  error: AppError | null;
  beginBootstrap: () => void;
  markReady: () => void;
  setOffline: (offline: boolean) => void;
  setVersion: (version: string) => void;
  setError: (error: AppError | null) => void;
  reset: () => void;
}

const initialState = {
  lifecycle: 'idle' as AppLifecycle,
  initialized: false,
  offline: false,
  version: '1.1.0',
  error: null,
};

export const useAppStore = create<AppState>()((set) => ({
  ...initialState,
  beginBootstrap: () =>
    set({
      lifecycle: 'booting',
      initialized: false,
      error: null,
    }),
  markReady: () =>
    set({
      lifecycle: 'ready',
      initialized: true,
      error: null,
    }),
  setOffline: (offline) => set({ offline }),
  setVersion: (version) => set({ version }),
  setError: (error) =>
    set({
      error,
      lifecycle: error ? 'error' : 'idle',
    }),
  reset: () => set(initialState),
}));
