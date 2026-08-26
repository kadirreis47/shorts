import type { MediaStorageObject, Scene, VisualMode } from './types';
import type { CaptionStyle, MotionStyle, TransitionStyle } from './videoRenderer';
import type { AudioNarrationMode } from '@/core/media';
import type { StudioProductionRecipeInput } from '@/core/media';
import type { NarrationCharacterAlignment } from '@/shared/voiceoverAlignment';
import {
  ensureSceneVisualPlanningIds,
  normalizeVisualIntelligencePlanningState,
  type VisualIntelligencePlanningState,
} from '@/core/visual-intelligence';
import { readUserScopedLocalStorage, removeUserScopedLocalStorage, writeUserScopedLocalStorage } from '@/persistence/userScopedStorage';

export type StudioStep = 'topic' | 'script' | 'style' | 'voice' | 'render' | 'publish';
export type StudioVoiceoverMode = 'elevenlabs' | 'browser' | 'none';
/** Persisted UX acknowledgement only; Browser speech stays local preview-only. */
export type BrowserTtsFinalIntent = 'without-narration';

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
  /** Stable private identity only; legacy Blob/object-URL selections are intentionally not restored. */
  musicStorage?: MediaStorageObject;
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
  browserTtsFinalIntent?: BrowserTtsFinalIntent;
  selectedVoice: string;
  targetLanguage: string;
  narration?: {
    storage: MediaStorageObject;
    durationMs: number;
    scriptRevision: string;
    voiceId: string;
    alignment?: NarrationCharacterAlignment;
  };
  /** Advisory editorial planning only; excluded from Recipe V1 and render identity. */
  visualIntelligence?: VisualIntelligencePlanningState;
}

const STORAGE_KEY = 'shortsflow.studio.draft.v1';

export function loadStudioDraft(): StudioDraft | null {
  try {
    const raw = readUserScopedLocalStorage(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StudioDraft>;
    if (parsed.version !== 1 || typeof parsed.savedAt !== 'string') return null;
    return normalizeStudioDraft(parsed as StudioDraft);
  } catch {
    return null;
  }
}

export function saveStudioDraft(draft: StudioDraft): StudioDraft {
  const normalized = normalizeStudioDraft(draft);
  writeUserScopedLocalStorage(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function clearStudioDraft(): void {
  removeUserScopedLocalStorage(STORAGE_KEY);
}

/** Preserves V1.1 drafts while giving future async planning a stable scene binding. */
export function normalizeStudioDraft(draft: StudioDraft): StudioDraft {
  const { visualIntelligence: rawVisualIntelligence, ...rest } = draft;
  const scenes = ensureSceneVisualPlanningIds(Array.isArray(draft.scenes) ? draft.scenes : []);
  let visualIntelligence: VisualIntelligencePlanningState | undefined;
  try {
    visualIntelligence = normalizeVisualIntelligencePlanningState(rawVisualIntelligence);
  } catch {
    // Advisory planning must fail closed without making an otherwise durable V1.1 draft unreadable.
    visualIntelligence = undefined;
  }
  return {
    ...rest,
    scenes,
    ...(visualIntelligence ? { visualIntelligence } : {}),
  };
}

export function resolveStudioAudioNarrationMode(
  voiceoverMode: StudioVoiceoverMode,
  hasCanonicalNarration = false,
): AudioNarrationMode {
  return voiceoverMode === 'elevenlabs' && hasCanonicalNarration ? 'required' : 'silent';
}

/**
 * Draft persistence remains the single durable Studio state. This adapter
 * reconstructs the versioned recipe at the canonical render boundary instead
 * of persisting a competing copy of it.
 */
export function studioProductionRecipeInputFromDraft(draft: StudioDraft): StudioProductionRecipeInput {
  if (!draft.projectId?.trim()) throw new Error('A Studio draft requires a project id before canonical rendering.');
  return {
    projectId: draft.projectId,
    title: draft.title,
    scenes: draft.scenes,
    captionStyle: draft.captionStyle,
    transitionStyle: draft.transitionStyle,
    motionStyle: draft.motionStyle,
    showSubtitles: draft.showSubtitles,
    captionTextColor: draft.captionTextColor,
    captionHighlightColor: draft.captionHighlightColor,
    voiceoverMode: draft.voiceoverMode,
    narration: draft.narration ?? null,
    musicId: draft.musicId,
    musicStorage: draft.musicStorage ?? null,
    musicVolume: draft.musicVolume,
    beatSync: draft.beatSync,
    watermarkText: draft.watermarkText,
    watermarkPosition: draft.watermarkPosition,
    visualMode: draft.visualMode,
    selectedStyleId: draft.selectedStyleId,
    characterProfileId: draft.characterProfileId,
    useBroll: draft.useBroll,
    characterName: draft.characterName,
    characterAppearance: draft.characterAppearance,
    characterArtStyle: draft.characterArtStyle,
  };
}
