import type { SubtitleStyle } from '@/core/media';
import type { CaptionStyleProfile } from './types';

export type CaptionProfileParameters = Pick<SubtitleStyle, 'fontFamily' | 'fontSize' | 'fontWeight' | 'lineSpacing' | 'strokeWidth' | 'shadowDepth' | 'position' | 'maxWordsPerCue' | 'maxCharactersPerLine' | 'animation'>;
export const CAPTION_STYLE_PROFILES: Readonly<Record<CaptionStyleProfile, CaptionProfileParameters>> = Object.freeze({
  shorts: { fontFamily: 'Inter', fontSize: 70, fontWeight: 900, lineSpacing: 1.05, strokeWidth: 5, shadowDepth: 1, position: 'bottom', maxWordsPerCue: 4, maxCharactersPerLine: 24, animation: 'word-highlight' },
  tiktok: { fontFamily: 'Arial', fontSize: 66, fontWeight: 800, lineSpacing: 1.08, strokeWidth: 5, shadowDepth: 1, position: 'center', maxWordsPerCue: 5, maxCharactersPerLine: 25, animation: 'pop' },
  reels: { fontFamily: 'Inter', fontSize: 68, fontWeight: 850, lineSpacing: 1.06, strokeWidth: 4, shadowDepth: 2, position: 'bottom', maxWordsPerCue: 4, maxCharactersPerLine: 24, animation: 'word-highlight' },
  documentary: { fontFamily: 'Arial', fontSize: 54, fontWeight: 650, lineSpacing: 1.18, strokeWidth: 3, shadowDepth: 1, position: 'bottom', maxWordsPerCue: 8, maxCharactersPerLine: 36, animation: 'fade' },
  podcast: { fontFamily: 'Inter', fontSize: 62, fontWeight: 750, lineSpacing: 1.12, strokeWidth: 4, shadowDepth: 2, position: 'bottom', maxWordsPerCue: 6, maxCharactersPerLine: 30, animation: 'karaoke' },
  cinematic: { fontFamily: 'Arial', fontSize: 52, fontWeight: 600, lineSpacing: 1.2, strokeWidth: 2, shadowDepth: 2, position: 'bottom', maxWordsPerCue: 8, maxCharactersPerLine: 38, animation: 'fade' },
  minimal: { fontFamily: 'Inter', fontSize: 56, fontWeight: 600, lineSpacing: 1.15, strokeWidth: 2, shadowDepth: 1, position: 'bottom', maxWordsPerCue: 7, maxCharactersPerLine: 34, animation: 'none' },
});
export function resolveCaptionProfile(profile: CaptionStyleProfile): CaptionProfileParameters { return CAPTION_STYLE_PROFILES[profile]; }
