export type SubtitleAlignmentSource = 'estimated' | 'word-timestamps' | 'imported';
export type SubtitleAnimation = 'none' | 'pop' | 'karaoke' | 'word-highlight' | 'bounce';

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

export interface SubtitleBuildOptions {
  language?: string;
  style?: Partial<SubtitleStyle>;
}
