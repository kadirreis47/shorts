import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createPersistentStorage } from '@/persistence/storeStorage';
import type {
  AIProviderId,
  RenderQuality,
  ThemeMode,
} from '@/store/types';

interface SettingsState {
  language: string;
  theme: ThemeMode;
  aiProvider: AIProviderId;
  autosaveEnabled: boolean;
  cacheEnabled: boolean;
  renderQuality: RenderQuality;
  setLanguage: (language: string) => void;
  setTheme: (theme: ThemeMode) => void;
  setAIProvider: (provider: AIProviderId) => void;
  setAutosaveEnabled: (enabled: boolean) => void;
  setCacheEnabled: (enabled: boolean) => void;
  setRenderQuality: (quality: RenderQuality) => void;
  resetSettings: () => void;
}

const defaults = {
  language: 'tr',
  theme: 'system' as ThemeMode,
  aiProvider: 'openai' as AIProviderId,
  autosaveEnabled: true,
  cacheEnabled: true,
  renderQuality: 'standard' as RenderQuality,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaults,
      setLanguage: (language) => set({ language }),
      setTheme: (theme) => set({ theme }),
      setAIProvider: (aiProvider) => set({ aiProvider }),
      setAutosaveEnabled: (autosaveEnabled) => set({ autosaveEnabled }),
      setCacheEnabled: (cacheEnabled) => set({ cacheEnabled }),
      setRenderQuality: (renderQuality) => set({ renderQuality }),
      resetSettings: () => set(defaults),
    }),
    {
      name: 'shortsflow-settings',
      version: 2,
      storage: createPersistentStorage<SettingsState>(),
      skipHydration: true,
      partialize: (state) => ({
        language: state.language,
        theme: state.theme,
        aiProvider: state.aiProvider,
        autosaveEnabled: state.autosaveEnabled,
        cacheEnabled: state.cacheEnabled,
        renderQuality: state.renderQuality,
      }),
    },
  ),
);
