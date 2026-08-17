export type SubtitleAlignmentSource = 'estimated' | 'word-timestamps' | 'imported';
export type SubtitleAnimation = 'none' | 'fade' | 'pop' | 'karaoke' | 'word-highlight' | 'bounce';

export interface SubtitleWord {
  id: string;
  sceneId: string;
  text: string;
  normalizedText: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  confidence: number;
  emphasis: boolean;
  punctuation: boolean;
}

export interface SubtitleCue {
  id: string;
  sceneId: string;
  text: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  wordIds: string[];
  lineCount: number;
  emphasisWordIds: string[];
}

export interface SubtitleStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineSpacing: number;
  strokeWidth: number;
  shadowDepth: number;
  textColor: string;
  highlightColor: string;
  backgroundColor: string;
  backgroundOpacity: number;
  position: 'top' | 'center' | 'bottom';
  maxWordsPerCue: number;
  maxCharactersPerLine: number;
  animation: SubtitleAnimation;
  uppercase: boolean;
}

export interface SubtitleTimeline {
  /** Explicit canonical visibility; false means there are intentionally no burn-in cues. */
  enabled: boolean;
  source: SubtitleAlignmentSource;
  language: string;
  durationMs: number;
  words: SubtitleWord[];
  cues: SubtitleCue[];
  style: SubtitleStyle;
  metrics: SubtitleMetrics;
}

export interface SubtitleMetrics {
  wordCount: number;
  cueCount: number;
  averageWordsPerCue: number;
  averageCueDurationMs: number;
  readingSpeedWpm: number;
  coverage: number;
  estimatedConfidence: number;
}

/**
 * Bounded, authoring-level subtitle choices accepted by the canonical media
 * builder. This deliberately does not expose ASS or browser-preview values.
 */
export type CanonicalSubtitlePreset = 'karaoke' | 'highlight' | 'classic' | 'minimal';

export interface CanonicalSubtitleConfiguration {
  enabled: boolean;
  preset: CanonicalSubtitlePreset;
  textColor: string | null;
  highlightColor: string | null;
}

export interface SubtitleBuildOptions {
  language?: string;
  style?: Partial<SubtitleStyle>;
  canonical?: CanonicalSubtitleConfiguration;
}
