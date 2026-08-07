import { stableId } from '@/core/editing/utils';
import type { SubtitleCue, SubtitleWord } from '@/core/media';
import type { LineBreakOptions, LineBreakResult } from './types';

export function breakSubtitleLines(words: readonly SubtitleWord[], options: LineBreakOptions): LineBreakResult {
  const cues: SubtitleCue[] = []; const diagnostics: string[] = []; let group: SubtitleWord[] = [];
  const flush = () => { if (!group.length) return; const splitAt = orphanSafeSplit(group, options.maxCharactersPerLine); const text = splitAt > 0 ? `${join(group.slice(0, splitAt))}\n${join(group.slice(splitAt))}` : join(group); cues.push({ id: stableId('subtitle-cue', group.map((word) => word.id).join('|')), sceneId: group[0].sceneId, text, startMs: group[0].startMs, endMs: group.at(-1)!.endMs, durationMs: group.at(-1)!.endMs - group[0].startMs, wordIds: group.map((word) => word.id), lineCount: splitAt > 0 ? 2 : 1, emphasisWordIds: group.filter((word) => word.emphasis).map((word) => word.id) }); group = []; };
  for (const word of words) { const candidate = [...group, word]; const sceneChanged = group.length > 0 && group[0].sceneId !== word.sceneId; const exceedsWords = candidate.length > options.maxWordsPerCue; const exceedsCharacters = join(candidate).replace(/\n/g, '').length > options.maxCharactersPerLine * 2; const exceedsDuration = candidate.at(-1)!.endMs - candidate[0].startMs > options.maxDurationMs; if (sceneChanged || exceedsWords || exceedsCharacters || exceedsDuration) flush(); group.push(word); if (/[.!?…]$/u.test(word.text) && group.length > 1) flush(); }
  flush();
  if (cues.some((cue) => cue.text.split('\n').some((line) => line.trim().split(/\s+/u).length === 1))) diagnostics.push('One-word line retained only where no balanced punctuation-aware split exists.');
  return { cues, diagnostics };
}
function orphanSafeSplit(words: readonly SubtitleWord[], max: number): number { if (join(words).length <= max || words.length < 4) return 0; const candidates = words.slice(1, -1).map((word, index) => ({ at: index + 1, punctuation: /[,;:!?…—–]$/u.test(word.text) ? 8 : 0, balance: Math.abs(join(words.slice(0, index + 1)).length - join(words.slice(index + 1)).length) })).filter(({ at }) => at >= 2 && words.length - at >= 2); return candidates.sort((a, b) => (a.balance - a.punctuation) - (b.balance - b.punctuation) || a.at - b.at)[0]?.at ?? 0; }
function join(words: readonly SubtitleWord[]): string { return words.map((word) => word.text).join(' '); }
