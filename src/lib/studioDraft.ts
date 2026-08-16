import type { MediaStorageObject, Scene, VisualMode } from './types';
import type { CaptionStyle, MotionStyle, TransitionStyle } from './videoRenderer';
import type { AudioNarrationMode } from '@/core/media';
import { readUserScopedLocalStorage, removeUserScopedLocalStorage, writeUserScopedLocalStorage } from '@/persistence/userScopedStorage';

export type StudioStep = 'topic' | 'script' | 'style' | 'voice' | 'render' | 'publish';
export type StudioVoiceoverMode = 'elevenlabs' | 'browser' | 'none';

export interface StudioDraft {
  version: 1;
  projectId?: string;
  savedAt: string;
  step: StudioStep;
  channelId: string;
  topic: string;
  niche: string;
  tone: string;
  duration: number;
  title: string;
  hook: string;
  script: string;
  cta: string;
  scenes: Scene[];
  captionStyle: CaptionStyle;
  transitionStyle: TransitionStyle;
  motionStyle: MotionStyle;
  useBroll: boolean;
  musicId: string;
  musicVolume: number;
  visualMode: VisualMode;
  selectedStyleId: string;
  characterName: string;
  characterAppearance: string;
  characterArtStyle: string;
  characterProfileId: string;
  watermarkText: string;
  watermarkPosition: string;
  showSubtitles: boolean;
  captionTextColor: string;
  captionHighlightColor: string;
  beatSync: boolean;
  voiceoverMode: StudioVoiceoverMode;
  selectedVoice: string;
  targetLanguage: string;
  narration?: {
    storage: MediaStorageObject;
    durationMs: number;
    scriptRevision: string;
    voiceId: string;
  };
}

const STORAGE_KEY = 'shortsflow.studio.draft.v1';

export function loadStudioDraft(): StudioDraft | null {
  try {
    const raw = readUserScopedLocalStorage(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StudioDraft>;
    if (parsed.version !== 1 || typeof parsed.savedAt !== 'string') return null;
    return parsed as StudioDraft;
  } catch {
    return null;
  }
}

export function saveStudioDraft(draft: StudioDraft): void {
  writeUserScopedLocalStorage(STORAGE_KEY, JSON.stringify(draft));
}

export function clearStudioDraft(): void {
  removeUserScopedLocalStorage(STORAGE_KEY);
}

export function resolveStudioAudioNarrationMode(
  voiceoverMode: StudioVoiceoverMode,
  hasCanonicalNarration = false,
): AudioNarrationMode {
  return voiceoverMode === 'elevenlabs' && hasCanonicalNarration ? 'required' : 'silent';
}
