import type { MediaStorageObject, Scene, VisualMode } from '@/lib/types';
import { assertCurrentMediaOwnerContext, type ValidatedMediaOwnerContext } from '@/lib/mediaStorage';
import type { CreateMediaProjectInput } from './types';

export type StudioRecipeCaptionStyle = 'karaoke' | 'highlight' | 'classic' | 'minimal';
export type StudioRecipeTransition = 'crossfade' | 'slide' | 'zoom' | 'fadeblack' | 'glitch' | 'shake' | 'whippan' | 'none';
export type StudioRecipeMotion = 'kenburns' | 'pan' | 'zoom_in' | 'zoom_out' | 'static';
export type StudioRecipeVoiceMode = 'elevenlabs' | 'browser' | 'none';
export type StudioRecipeExportSupport = 'supported' | 'partial' | 'unsupported' | 'preview-only';

export interface StudioProductionRecipeV1 {
  readonly version: 1;
  readonly projectId: string;
  readonly title: string;
  readonly scenes: readonly StudioProductionRecipeSceneV1[];
  readonly composition: {
    readonly motion: StudioRecipeMotion;
    readonly transition: StudioRecipeTransition;
  };
  readonly subtitles: {
    readonly enabled: boolean;
    readonly preset: StudioRecipeCaptionStyle;
    readonly textColor: string | null;
    readonly highlightColor: string | null;
  };
  readonly audio: {
    readonly narrationMode: StudioRecipeVoiceMode;
    readonly narration: StudioRecipeNarrationV1 | null;
    readonly music: { readonly id: string; readonly volume: number; readonly beatSync: boolean } | null;
  };
  readonly branding: {
    readonly watermark: { readonly text: string; readonly position: StudioRecipeWatermarkPosition } | null;
  };
  readonly output: {
    readonly aspectRatio: '9:16';
    readonly width: 1080;
    readonly height: 1920;
    readonly fps: 30;
  };
  readonly provenance: {
    readonly visualMode: VisualMode;
    readonly useBroll: boolean;
    readonly selectedStyleId: string | null;
    readonly characterProfileId: string | null;
    readonly characterName: string | null;
    readonly characterAppearance: string | null;
    readonly characterArtStyle: string | null;
  };
}

export interface StudioProductionRecipeSceneV1 {
  readonly id: string;
  readonly order: number;
  readonly text: string;
  readonly durationSeconds: number;
  readonly visual: string;
  readonly visualPrompt: string | null;
  readonly overlayText: string | null;
  readonly emphasis: boolean;
  readonly visualMode: VisualMode | null;
  readonly characterRef: string | null;
  readonly keywords: readonly string[];
  readonly media: StudioRecipeVisualMediaV1 | null;
}

export interface StudioRecipeVisualMediaV1 {
  readonly type: 'image' | 'video';
  readonly storage: MediaStorageObject | null;
  readonly sourceUrl: string | null;
}

export interface StudioRecipeNarrationV1 {
  readonly storage: MediaStorageObject;
  readonly durationMs: number;
  readonly scriptRevision: string;
  readonly voiceId: string;
}

export type StudioRecipeWatermarkPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface StudioProductionRecipeInput {
  projectId: string;
  title: string;
  scenes: readonly Scene[];
  captionStyle: StudioRecipeCaptionStyle;
  transitionStyle: StudioRecipeTransition;
  motionStyle: StudioRecipeMotion;
  showSubtitles: boolean;
  captionTextColor: string;
  captionHighlightColor: string;
  voiceoverMode: StudioRecipeVoiceMode;
  narration: StudioRecipeNarrationV1 | null;
  musicId: string;
  musicVolume: number;
  beatSync: boolean;
  watermarkText: string;
  watermarkPosition: string;
  visualMode: VisualMode;
  selectedStyleId: string;
  characterProfileId: string;
  useBroll: boolean;
  characterName: string;
  characterAppearance: string;
  characterArtStyle: string;
}

export interface NormalizedStudioProductionRecipeV1 {
  readonly recipe: StudioProductionRecipeV1;
  readonly identity: string;
  readonly exportSupport: StudioProductionRecipeExportCapabilities;
}

export interface StudioProductionRecipeExportCapabilities {
  readonly narration: StudioRecipeExportSupport;
  readonly browserSpeech: StudioRecipeExportSupport;
  readonly subtitles: StudioRecipeExportSupport;
  readonly motion: StudioRecipeExportSupport;
  readonly transitions: StudioRecipeExportSupport;
  readonly watermark: StudioRecipeExportSupport;
  readonly music: StudioRecipeExportSupport;
}

export const STUDIO_PRODUCTION_RECIPE_V1_EXPORT_CAPABILITIES: StudioProductionRecipeExportCapabilities = Object.freeze({
  narration: 'supported',
  browserSpeech: 'preview-only',
  subtitles: 'partial',
  motion: 'unsupported',
  transitions: 'unsupported',
  watermark: 'unsupported',
  music: 'unsupported',
});

const CAPTION_STYLES = new Set<StudioRecipeCaptionStyle>(['karaoke', 'highlight', 'classic', 'minimal']);
const TRANSITIONS = new Set<StudioRecipeTransition>(['crossfade', 'slide', 'zoom', 'fadeblack', 'glitch', 'shake', 'whippan', 'none']);
const MOTIONS = new Set<StudioRecipeMotion>(['kenburns', 'pan', 'zoom_in', 'zoom_out', 'static']);
const VOICE_MODES = new Set<StudioRecipeVoiceMode>(['elevenlabs', 'browser', 'none']);
const VISUAL_MODES = new Set<VisualMode>(['auto', 'ai_cartoon', 'ai_realistic', 'ai_anime', 'ai_horror', 'real_footage', 'mixed']);
const WATERMARK_POSITIONS = new Set<StudioRecipeWatermarkPosition>(['top-left', 'top-right', 'bottom-left', 'bottom-right']);
const PRIVATE_PATH = /^(?<owner>[^/]+)\/(?:videos\/[0-9a-f-]+\.webm|generated-images\/[0-9a-f-]+\.png|voiceovers\/[0-9a-f-]+\.mp3)$/i;
const TRANSIENT_SOURCE = /^(?:blob:|data:)|\/storage\/v1\/object\/sign\//i;

export function normalizeStudioProductionRecipeV1(
  input: StudioProductionRecipeInput,
  ownerContext: ValidatedMediaOwnerContext,
): NormalizedStudioProductionRecipeV1 {
  assertCurrentMediaOwnerContext(ownerContext);
  const safeOwnerId = requiredText(ownerContext.ownerId, 'A validated owner is required for a production recipe.');
  const projectId = requiredText(input.projectId, 'A production recipe requires a project id.');
  const voiceMode = enumValue(input.voiceoverMode, VOICE_MODES, 'voiceover mode');
  const narration = input.narration === null ? null : normalizeNarration(input.narration, safeOwnerId);
  if (voiceMode !== 'elevenlabs' && narration) throw new Error('Only ElevenLabs mode may contain canonical narration.');

  const recipe: StudioProductionRecipeV1 = {
    version: 1,
    projectId,
    title: input.title.trim() || 'Untitled Media Project',
    scenes: normalizeScenes(input.scenes, safeOwnerId),
    composition: {
      motion: enumValue(input.motionStyle, MOTIONS, 'motion style'),
      transition: enumValue(input.transitionStyle, TRANSITIONS, 'transition style'),
    },
    subtitles: {
      enabled: Boolean(input.showSubtitles),
      preset: enumValue(input.captionStyle, CAPTION_STYLES, 'caption style'),
      textColor: normalizeColor(input.captionTextColor),
      highlightColor: normalizeColor(input.captionHighlightColor),
    },
    audio: {
      narrationMode: voiceMode,
      narration,
      music: normalizeMusic(input.musicId, input.musicVolume, input.beatSync),
    },
    branding: {
      watermark: normalizeWatermark(input.watermarkText, input.watermarkPosition),
    },
    output: { aspectRatio: '9:16', width: 1080, height: 1920, fps: 30 },
    provenance: {
      visualMode: enumValue(input.visualMode, VISUAL_MODES, 'visual mode'),
      useBroll: Boolean(input.useBroll),
      selectedStyleId: optionalText(input.selectedStyleId),
      characterProfileId: optionalText(input.characterProfileId),
      characterName: optionalText(input.characterName),
      characterAppearance: optionalText(input.characterAppearance),
      characterArtStyle: optionalText(input.characterArtStyle),
    },
  };
  return {
    recipe,
    identity: recipeIdentity(recipe),
    exportSupport: STUDIO_PRODUCTION_RECIPE_V1_EXPORT_CAPABILITIES,
  };
}

export function compileStudioProductionRecipeV1(
  normalized: NormalizedStudioProductionRecipeV1,
): CreateMediaProjectInput {
  const { recipe } = normalized;
  const narration = recipe.audio.narration;
  return {
    projectId: recipe.projectId,
    title: recipe.title,
    scenes: recipe.scenes.map(recipeSceneToScene),
    settings: {
      aspectRatio: recipe.output.aspectRatio,
      resolution: { width: recipe.output.width, height: recipe.output.height },
      fps: recipe.output.fps,
    },
    audio: {
      narrationMode: recipe.audio.narrationMode === 'elevenlabs' && narration ? 'required' : 'silent',
    },
    narration: narration ? {
      storage: narration.storage,
      durationMs: narration.durationMs,
      scriptRevision: narration.scriptRevision,
      voiceId: narration.voiceId,
    } : undefined,
    productionRecipe: normalized,
  };
}

export function recipeIdentity(recipe: StudioProductionRecipeV1): string {
  const serialized = stableStringify(recipe);
  let first = 2166136261;
  let second = 2246822519;
  for (let index = 0; index < serialized.length; index += 1) {
    const code = serialized.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ code, 3266489917);
  }
  return `studio-recipe-v1-${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}

function normalizeScenes(scenes: readonly Scene[], ownerId: string): StudioProductionRecipeSceneV1[] {
  const normalized = scenes.map((scene, order) => {
    const text = requiredText(scene.text, `Scene ${order + 1} requires text.`);
    const durationSeconds = boundedNumber(scene.duration, .1, 300, `Scene ${order + 1} duration`);
    return {
      id: `scene-${order + 1}`,
      order,
      text,
      durationSeconds,
      visual: String(scene.visual ?? '').trim(),
      visualPrompt: optionalText(scene.imagePrompt),
      overlayText: optionalText(scene.overlayText),
      emphasis: scene.emphasis === true,
      visualMode: scene.visualMode === undefined ? null : enumValue(scene.visualMode, VISUAL_MODES, `Scene ${order + 1} visual mode`),
      characterRef: optionalText(scene.characterRef),
      keywords: [...new Set((scene.keywords ?? []).map((value) => String(value).trim()).filter(Boolean))],
      media: normalizeSceneMedia(scene, ownerId),
    };
  });
  if (!normalized.length) throw new Error('A production recipe requires at least one scene.');
  return normalized;
}

function normalizeSceneMedia(scene: Scene, ownerId: string): StudioRecipeVisualMediaV1 | null {
  const storage = scene.videoStorage ?? scene.imageStorage ?? null;
  const sourceUrl = scene.videoUrl ?? scene.imageUrl ?? null;
  if (storage) {
    assertOwnedStorage(storage, ownerId);
    return { type: scene.videoStorage ? 'video' : 'image', storage: cloneStorage(storage), sourceUrl: null };
  }
  if (!sourceUrl) return null;
  if (!isTrustedExternalSource(sourceUrl)) {
    throw new Error('Scene media must use a durable private identity or trusted HTTPS URL.');
  }
  return { type: scene.videoUrl ? 'video' : 'image', storage: null, sourceUrl };
}

function normalizeNarration(value: StudioRecipeNarrationV1, ownerId: string): StudioRecipeNarrationV1 {
  assertOwnedStorage(value.storage, ownerId);
  if (!/\/voiceovers\/[0-9a-f-]+\.mp3$/i.test(value.storage.objectPath)) {
    throw new Error('Canonical narration must reference an owner-scoped voiceover MP3.');
  }
  return {
    storage: cloneStorage(value.storage),
    durationMs: boundedInteger(value.durationMs, 1, 3_600_000, 'Narration duration'),
    scriptRevision: requiredText(value.scriptRevision, 'Narration script revision is required.'),
    voiceId: requiredText(value.voiceId, 'Narration voice id is required.'),
  };
}

function isTrustedExternalSource(value: string): boolean {
  if (TRANSIENT_SOURCE.test(value)) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    return ![...url.searchParams.keys()].some((key) => /^(?:token|sig|signature|access_token|apikey|api_key)$/i.test(key));
  } catch {
    return false;
  }
}

function recipeSceneToScene(scene: StudioProductionRecipeSceneV1): Scene {
  return {
    text: scene.text,
    duration: scene.durationSeconds,
    visual: scene.visual,
    imagePrompt: scene.visualPrompt ?? undefined,
    overlayText: scene.overlayText ?? undefined,
    emphasis: scene.emphasis,
    visualMode: scene.visualMode ?? undefined,
    characterRef: scene.characterRef ?? undefined,
    keywords: [...scene.keywords],
    ...(scene.media?.type === 'video' ? {
      videoStorage: scene.media.storage ?? undefined,
      videoUrl: scene.media.sourceUrl ?? undefined,
    } : scene.media?.type === 'image' ? {
      imageStorage: scene.media.storage ?? undefined,
      imageUrl: scene.media.sourceUrl ?? undefined,
    } : {}),
  };
}

function assertOwnedStorage(storage: MediaStorageObject, ownerId: string): void {
  if (!storage || storage.bucket !== 'media' || typeof storage.objectPath !== 'string') {
    throw new Error('Production recipe media identity is invalid.');
  }
  const match = PRIVATE_PATH.exec(storage.objectPath);
  if (!match || match.groups?.owner !== ownerId) {
    throw new Error('Production recipe media is not owned by the authenticated user.');
  }
}

function normalizeMusic(id: string, volume: number, beatSync: boolean): StudioProductionRecipeV1['audio']['music'] {
  const safeId = optionalText(id);
  return safeId ? { id: safeId, volume: boundedNumber(volume, 0, 1, 'Music volume'), beatSync: Boolean(beatSync) } : null;
}

function normalizeWatermark(text: string, position: string): StudioProductionRecipeV1['branding']['watermark'] {
  const safeText = optionalText(text);
  if (!safeText) return null;
  if (safeText.length > 120) throw new Error('Watermark text is too long.');
  return { text: safeText, position: enumValue(position, WATERMARK_POSITIONS, 'watermark position') };
}

function normalizeColor(value: string): string | null {
  const safe = optionalText(value);
  if (!safe) return null;
  if (!/^#[0-9a-f]{6}$/i.test(safe)) throw new Error('Caption colors must be six-digit hex values.');
  return safe.toUpperCase();
}

function enumValue<T extends string>(value: unknown, values: ReadonlySet<T>, label: string): T {
  if (typeof value !== 'string' || !values.has(value as T)) throw new Error(`Unsupported ${label}.`);
  return value as T;
}
function requiredText(value: unknown, message: string): string { const text = typeof value === 'string' ? value.trim() : ''; if (!text) throw new Error(message); return text; }
function optionalText(value: unknown): string | null { const text = typeof value === 'string' ? value.trim() : ''; return text || null; }
function boundedNumber(value: unknown, min: number, max: number, label: string): number { if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`${label} is invalid.`); return Math.round(value * 1000) / 1000; }
function boundedInteger(value: unknown, min: number, max: number, label: string): number { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${label} is invalid.`); return value; }
function cloneStorage(storage: MediaStorageObject): MediaStorageObject { return { bucket: 'media', objectPath: storage.objectPath }; }
function stableStringify(value: unknown): string { return JSON.stringify(sortValue(value)); }
function sortValue(value: unknown): unknown { if (Array.isArray(value)) return value.map(sortValue); if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => [key, sortValue(nested)])); return value; }
