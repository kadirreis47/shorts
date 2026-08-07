import type { SubtitleCue, SubtitleWord } from '@/core/media';

export interface SplitEligibility {
  eligible: boolean;
  splitAt: number | null;
  diagnostic: string;
}

/** Select one deterministic, non-empty split point shared by planner and transform. */
export function evaluateSplitEligibility(
  cue: SubtitleCue,
  words: readonly SubtitleWord[],
  maxCharactersPerLine: number,
): SplitEligibility {
  if (cue.wordIds.length < 3) return { eligible: false, splitAt: null, diagnostic: 'At least three timed words are required for a safe split.' };
  const wordMap = new Map(words.map((word) => [word.id, word]));
  const cueWords = cue.wordIds.map((id) => wordMap.get(id)).filter((word): word is SubtitleWord => Boolean(word));
  if (cueWords.length !== cue.wordIds.length) return { eligible: false, splitAt: null, diagnostic: 'Every cue word must have a matching source word.' };
  const candidates = cueWords.slice(1).map((_, index) => index + 1)
    .filter((splitAt) => splitAt > 0 && splitAt < cueWords.length)
    .map((splitAt) => {
      const left = cueWords.slice(0, splitAt);
      const right = cueWords.slice(splitAt);
      const leftText = left.map((word) => word.text).join(' ');
      const rightText = right.map((word) => word.text).join(' ');
      const punctuation = /[,;:!?…—–]$/u.test(left.at(-1)!.text) ? 20 : 0;
      const timingGap = Math.max(0, right[0].startMs - left.at(-1)!.endMs);
      const balance = Math.abs(leftText.length - rightText.length);
      const durationBalance = Math.abs((left.at(-1)!.endMs - left[0].startMs) - (right.at(-1)!.endMs - right[0].startMs));
      const maxLineLength = Math.max(leftText.length, rightText.length);
      return { splitAt, score: punctuation - balance - durationBalance / 100 - timingGap / 100, maxLineLength, left, right };
    })
    .filter((candidate) => candidate.maxLineLength <= Math.max(maxCharactersPerLine, 1));
  const selected = candidates.sort((left, right) => right.score - left.score || left.splitAt - right.splitAt)[0];
  if (!selected) return { eligible: false, splitAt: null, diagnostic: 'No balanced, punctuation-aware split point satisfies the line-length contract.' };
  const minDuration = 250;
  if (selected.left.at(-1)!.endMs - selected.left[0].startMs < minDuration || selected.right.at(-1)!.endMs - selected.right[0].startMs < minDuration) {
    return { eligible: false, splitAt: null, diagnostic: 'Split children would not meet the minimum readable display duration.' };
  }
  return { eligible: true, splitAt: selected.splitAt, diagnostic: 'Cue can be split into two non-empty, timed subtitle children.' };
}

export function canSplitCue(cue: SubtitleCue, words: readonly SubtitleWord[], maxCharactersPerLine: number): boolean {
  return evaluateSplitEligibility(cue, words, maxCharactersPerLine).eligible;
}
