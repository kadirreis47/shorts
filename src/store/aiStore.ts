import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createPersistentStorage } from '@/persistence/storeStorage';
import type { AIProviderId } from '@/store/types';

export interface AIUsage {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
}

interface PersistedAIState {
  activeProvider: AIProviderId;
  activeModel: string | null;
  temperature: number;
  maxTokens: number;
  streaming: boolean;
}

interface AIState {
  activeProvider: AIProviderId;
  activeModel: string | null;
  temperature: number;
  maxTokens: number;
  streaming: boolean;
  busy: boolean;
  lastError: string | null;
  usage: AIUsage;
  setActiveProvider: (provider: AIProviderId) => void;
  setActiveModel: (model: string | null) => void;
  setTemperature: (temperature: number) => void;
  setMaxTokens: (maxTokens: number) => void;
  setStreaming: (streaming: boolean) => void;
  setBusy: (busy: boolean) => void;
  setLastError: (error: string | null) => void;
  recordUsage: (usage: Partial<AIUsage>) => void;
  resetUsage: () => void;
}

const createEmptyUsage = (): AIUsage => ({
  requests: 0,
  inputTokens: 0,
  outputTokens: 0,
  estimatedCost: 0,
});

export const useAIStore = create<AIState>()(
  persist(
    (set) => ({
      activeProvider: 'openai',
      activeModel: null,
      temperature: 0.7,
      maxTokens: 2048,
      streaming: false,
      busy: false,
      lastError: null,
      usage: createEmptyUsage(),
      setActiveProvider: (activeProvider) => set({ activeProvider }),
      setActiveModel: (activeModel) => set({ activeModel }),
      setTemperature: (temperature) =>
        set({ temperature: Math.min(2, Math.max(0, temperature)) }),
      setMaxTokens: (maxTokens) =>
        set({ maxTokens: Math.max(1, Math.round(maxTokens)) }),
      setStreaming: (streaming) => set({ streaming }),
      setBusy: (busy) => set({ busy }),
      setLastError: (lastError) => set({ lastError }),
      recordUsage: (usage) =>
        set((state) => ({
          usage: {
            requests: state.usage.requests + (usage.requests ?? 0),
            inputTokens: state.usage.inputTokens + (usage.inputTokens ?? 0),
            outputTokens: state.usage.outputTokens + (usage.outputTokens ?? 0),
            estimatedCost:
              state.usage.estimatedCost + (usage.estimatedCost ?? 0),
          },
        })),
      resetUsage: () => set({ usage: createEmptyUsage() }),
    }),
    {
      name: 'shortsflow-ai',
      version: 1,
      storage: createPersistentStorage<PersistedAIState>(),
      skipHydration: true,
      partialize: (state) => ({
        activeProvider: state.activeProvider,
        activeModel: state.activeModel,
        temperature: state.temperature,
        maxTokens: state.maxTokens,
        streaming: state.streaming,
      }),
    },
  ),
);
