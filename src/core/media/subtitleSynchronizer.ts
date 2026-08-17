import type { MediaProjectSettings, MediaScene } from './types';
import type {
  CanonicalSubtitleConfiguration,
  SubtitleBuildOptions,
  SubtitleCue,
  SubtitleMetrics,
  SubtitleStyle,
  SubtitleTimeline,
  SubtitleWord,
} from './subtitleTypes';

const DEFAULT_STYLE: SubtitleStyle = {
  fontFamily: 'Inter',
  fontSize: 64,
  fontWeight: 800,
  lineSpacing: 1.08,
  strokeWidth: 4,
  shadowDepth: 1,
  textColor: '#FFFFFF',
  // Match Studio's existing empty-state highlight swatch.
  highlightColor: '#10B981',
  backgroundColor: '#000000',
  backgroundOpacity: 0.34,
  position: 'bottom',
  maxWordsPerCue: 4,
  maxCharactersPerLine: 26,
  animation: 'word-highlight',
  uppercase: false,
};

const PUNCTUATION_PAUSE_WEIGHT: Readonly<Record<string, number>> = {
  ',': 0.55,
  ';': 0.75,
  ':': 0.75,
  '.': 1.2,
  '!': 1.35,
  '?': 1.35,
  '…': 1.5,
};

export function buildSubtitleTimeline(
  scenes: MediaScene[],
  settings: MediaProjectSettings,
  options: SubtitleBuildOptions = {},
): SubtitleTimeline {
  const canonical = options.canonical ? normalizeCanonicalSubtitleConfiguration(options.canonical) : null;
  const style = { ...DEFAULT_STYLE, ...(canonical ? canonicalSubtitleStyle(canonical) : {}), ...options.style };
  // Slice 4 executes overlaps as hard cuts: the outgoing scene loses the
  // following scene's overlap. Subtitle cues must use those same visual
  // boundaries or an outgoing cue can appear over the incoming scene.
  const subtitleScenes = scenes.map(effectiveSubtitleScene);
  const words = canonical?.enabled === false ? [] : subtitleScenes.flatMap((scene) => alignSceneWords(scene, settings));
  const cues = buildCues(
    words,
    style,
    canonical?.preset === 'highlight' || canonical?.preset === 'karaoke',
  );
  const durationMs = scenes.length > 0 ? scenes[scenes.length - 1].endMs : 0;

  return {
    enabled: canonical?.enabled ?? true,
    source: 'estimated',
    language: options.language ?? 'tr',
    durationMs,
    words,
    cues,
    style,
    metrics: calculateSubtitleMetrics(words, cues, durationMs),
  };
}

function effectiveSubtitleScene(scene: MediaScene): MediaScene {
  const overlapAfterMs = Number.isFinite(scene.overlapAfterMs)
    ? Math.max(0, Math.min(scene.durationMs, scene.overlapAfterMs))
    : 0;
  if (overlapAfterMs === 0) return scene;
  const durationMs = scene.durationMs - overlapAfterMs;
  return { ...scene, durationMs, endMs: scene.startMs + durationMs };
}

/** Maps the four Studio Recipe V1 presets to fixed ASS-supported semantics. */
export function canonicalSubtitleStyle(configuration: CanonicalSubtitleConfiguration): Partial<SubtitleStyle> {
  const canonical = normalizeCanonicalSubtitleConfiguration(configuration);
  const colors = {
    textColor: canonical.textColor ?? DEFAULT_STYLE.textColor,
    highlightColor: canonical.highlightColor ?? DEFAULT_STYLE.highlightColor,
  };
  switch (canonical.preset) {
    case 'karaoke':
      return { ...colors, fontWeight: 800, strokeWidth: 4, shadowDepth: 1, position: 'bottom', animation: 'karaoke' };
    case 'highlight':
      // The existing clean ASS path highlights only declared emphasis words.
      // Keep it distinct from synthetic-timing karaoke rather than claiming
      // a second word-by-word animation.
      return { ...colors, fontWeight: 800, strokeWidth: 4, shadowDepth: 1, backgroundOpacity: .48, position: 'bottom', animation: 'none' };
    case 'classic':
      return { ...colors, fontWeight: 700, strokeWidth: 3, shadowDepth: 2, backgroundOpacity: .42, position: 'bottom', animation: 'fade' };
    case 'minimal':
      return { ...colors, fontWeight: 700, strokeWidth: 2, shadowDepth: 1, backgroundOpacity: 0, position: 'bottom', animation: 'none' };
  }
}

function normalizeCanonicalSubtitleConfiguration(value: CanonicalSubtitleConfiguration | undefined): CanonicalSubtitleConfiguration {
  if (!value) throw new Error('A canonical subtitle configuration is required.');
  if (!['karaoke', 'highlight', 'classic', 'minimal'].includes(value.preset)) throw new Error('Unsupported canonical subtitle preset.');
  return {
    enabled: value.enabled === true,
    preset: value.preset,
    textColor: normalizeCanonicalColor(value.textColor),
    highlightColor: normalizeCanonicalColor(value.highlightColor),
  };
}

function normalizeCanonicalColor(value: string | null): string | null {
  if (value === null || value === '') return null;
  if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error('Canonical subtitle colors must be normalized hex values.');
  return value.toUpperCase();
}

function alignSceneWords(scene: MediaScene, settings: MediaProjectSettings): SubtitleWord[] {
  const tokens = tokenize(scene.subtitleText || scene.text);
  if (!tokens.length || scene.durationMs <= 0) return [];

  const frameMs = 1000 / Math.max(1, settings.fps);
  const weights = tokens.map((token) => tokenWeight(token));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = scene.startMs;

  return tokens.map((token, index) => {
    const isLast = index === tokens.length - 1;
    const rawDuration = scene.durationMs * (weights[index] / totalWeight);
    const startMs = snap(cursor, frameMs);
    const rawEnd = isLast ? scene.endMs : cursor + rawDuration;
    const endMs = Math.max(startMs + frameMs, snap(rawEnd, frameMs));
    cursor = rawEnd;

    return {
      id: createId('subtitle-word'),
      sceneId: scene.id,
      text: token,
      normalizedText: normalizeToken(token),
      startMs,
      endMs: Math.min(scene.endMs, endMs),
      durationMs: Math.max(frameMs, Math.min(scene.endMs, endMs) - startMs),
      confidence: 0.72,
      emphasis: scene.sourceScene.emphasis === true || isEmphasisToken(token),
      punctuation: /[,.!?:;…]$/u.test(token),
    };
  });
}

function buildCues(
  words: SubtitleWord[],
  style: SubtitleStyle,
  ensureCueEmphasis = false,
): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  let current: SubtitleWord[] = [];

  const flush = () => {
    if (!current.length) return;
    const text = current.map((word) => word.text).join(' ');
    const explicitEmphasis = current.filter((word) => word.emphasis).map((word) => word.id);
    const emphasisWordIds = explicitEmphasis.length > 0 || !ensureCueEmphasis
      ? explicitEmphasis
      : [deterministicCueEmphasis(current).id];
    cues.push({
      id: createId('subtitle-cue'),
      sceneId: current[0].sceneId,
      text: style.uppercase ? text.toLocaleUpperCase() : text,
      startMs: current[0].startMs,
      endMs: current[current.length - 1].endMs,
      durationMs: current[current.length - 1].endMs - current[0].startMs,
      wordIds: current.map((word) => word.id),
      lineCount: estimateLineCount(text, style.maxCharactersPerLine),
      emphasisWordIds,
    });
    current = [];
  };

  for (const word of words) {
    const sceneChanged = current.length > 0 && current[0].sceneId !== word.sceneId;
    const projected = [...current, word].map((item) => item.text).join(' ');
    const exceedsWords = current.length >= style.maxWordsPerCue;
    const exceedsCharacters = projected.length > style.maxCharactersPerLine * 2;

    if (sceneChanged || exceedsWords || exceedsCharacters) flush();
    current.push(word);

    if (/[.!?…]$/u.test(word.text)) flush();
  }

  flush();
  return cues;
}

/**
 * Bounded fallback for the Studio highlight/karaoke presets when ordinary
 * scene text has no explicit emphasis. It deliberately chooses only from the
 * already-estimated cue words; it is not word alignment.
 */
function deterministicCueEmphasis(words: readonly SubtitleWord[]): SubtitleWord {
  return words.reduce((best, word) => {
    const wordLength = word.normalizedText.length;
    const bestLength = best.normalizedText.length;
    return wordLength > bestLength ? word : best;
  });
}

export function calculateSubtitleMetrics(
  words: readonly SubtitleWord[],
  cues: readonly SubtitleCue[],
  durationMs: number,
): SubtitleMetrics {
  const spokenDurationMs = words.reduce((sum, word) => sum + word.durationMs, 0);
  const durationMinutes = Math.max(durationMs / 60000, 1 / 60);
  return {
    wordCount: words.length,
    cueCount: cues.length,
    averageWordsPerCue: cues.length ? round(words.length / cues.length) : 0,
    averageCueDurationMs: cues.length
      ? Math.round(cues.reduce((sum, cue) => sum + cue.durationMs, 0) / cues.length)
      : 0,
    readingSpeedWpm: Math.round(words.length / durationMinutes),
    coverage: durationMs ? round(spokenDurationMs / durationMs) : 0,
    estimatedConfidence: words.length
      ? round(words.reduce((sum, word) => sum + word.confidence, 0) / words.length)
      : 0,
  };
}

function tokenize(text: string): string[] {
  return text.trim().split(/\s+/u).filter(Boolean);
}

function tokenWeight(token: string): number {
  const normalized = normalizeToken(token);
  const characterWeight = Math.max(0.7, Math.min(2.4, normalized.length / 5));
  const punctuation = token.match(/[,.!?:;…]$/u)?.[0];
  return characterWeight + (punctuation ? PUNCTUATION_PAUSE_WEIGHT[punctuation] ?? 0 : 0);
}

function normalizeToken(token: string): string {
  return token.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function isEmphasisToken(token: string): boolean {
  return token.length > 2 && (token === token.toLocaleUpperCase() || /!$/.test(token));
}

function estimateLineCount(text: string, maxCharactersPerLine: number): number {
  return Math.max(1, Math.min(3, Math.ceil(text.length / Math.max(1, maxCharactersPerLine))));
}

function snap(value: number, frameMs: number): number {
  return Math.round(value / frameMs) * frameMs;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function createId(prefix: string): string {
  const suffix = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}
