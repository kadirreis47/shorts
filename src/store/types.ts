import type { ViewKey } from '@/components/Sidebar';

export type AppLifecycle = 'idle' | 'booting' | 'ready' | 'error';
export type ThemeMode = 'system' | 'light' | 'dark';
export type RenderQuality = 'draft' | 'standard' | 'high';
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
export type AIProviderId =
  | 'openai'
  | 'gemini'
  | 'claude'
  | 'grok'
  | 'openrouter';

export interface AppError {
  message: string;
  code?: string;
  occurredAt: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
}

export interface ProjectDraft {
  id: string;
  projectId: string;
  title: string;
  updatedAt: string;
  data: Record<string, unknown>;
}

export interface ModalState {
  id: string;
  payload?: Record<string, unknown>;
}

export type { ViewKey };
