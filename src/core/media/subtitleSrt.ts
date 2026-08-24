import type { SubtitleTimeline } from './subtitleTypes';

/**
 * Serializes the already-canonical subtitle cue timeline for download. This
 * deliberately has no scene or narration timing logic of its own.
 */
export function serializeCanonicalSubtitleSrt(timeline: SubtitleTimeline): string {
  let previousStartMs = -1;
  return timeline.cues.map((cue, index) => {
    if (!Number.isFinite(cue.startMs) || !Number.isFinite(cue.endMs) || cue.startMs < 0 || cue.endMs <= cue.startMs || cue.startMs < previousStartMs) {
      throw new Error('Canonical subtitle timeline contains an invalid SRT cue.');
    }
    previousStartMs = cue.startMs;
    const text = canonicalSrtText(cue.text);
    if (!text) throw new Error('Canonical subtitle timeline contains an empty SRT cue.');
    return `${index + 1}\n${formatCanonicalSrtTime(cue.startMs)} --> ${formatCanonicalSrtTime(cue.endMs)}\n${text}`;
  }).join('\n\n') + (timeline.cues.length > 0 ? '\n' : '');
}

export function formatCanonicalSrtTime(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) throw new Error('Canonical subtitle timestamp is invalid.');
  const value = Math.floor(milliseconds);
  const hours = Math.floor(value / 3_600_000);
  const minutes = Math.floor((value % 3_600_000) / 60_000);
  const seconds = Math.floor((value % 60_000) / 1_000);
  const remainder = value % 1_000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(remainder).padStart(3, '0')}`;
}

function canonicalSrtText(text: string): string {
  if (typeof text !== 'string') throw new Error('Canonical subtitle text is invalid.');
  const normalized = text.replace(/\r\n?/gu, '\n');
  return normalized.trim() ? normalized : '';
}
