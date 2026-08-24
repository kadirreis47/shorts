export const MAX_TRANSLATION_CUES = 250;
export const MAX_SOURCE_CUE_TEXT_LENGTH = 2_000;
export const MAX_TRANSLATED_CUE_TEXT_LENGTH = 4_000;
export const MAX_TRANSLATED_SRT_LENGTH = 200_000;

export type TranslationUnavailableReason =
  | "provider-not-configured"
  | "provider-timeout"
  | "provider-error"
  | "malformed-provider-response"
  | "incomplete-translation"
  | "unchanged-result";

export interface SubtitleTranslationCue {
  index: number;
  timeLine: string;
  startMs: number;
  endMs: number;
  text: string;
}

export class InvalidSourceSrtError extends Error {
  constructor() {
    super("Invalid canonical subtitle SRT.");
  }
}

function normalizedLineEndings(value: string): string {
  return value.replace(/\r\n?/gu, "\n");
}

function parseTimestamp(value: string): number | null {
  const match = /^(\d{2,}):([0-5]\d):([0-5]\d),(\d{3})$/u.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const milliseconds = Number(match[4]);
  const result = (((hours * 60) + minutes) * 60 + seconds) * 1_000 + milliseconds;
  return Number.isSafeInteger(result) ? result : null;
}

function normalizeCueText(value: string): string | null {
  const normalized = normalizedLineEndings(value).trim();
  if (!normalized || normalized.length > MAX_TRANSLATED_CUE_TEXT_LENGTH) return null;
  // An empty line terminates an SRT cue. One internal line break is valid; a
  // blank line would let provider text create a new cue during download.
  if (/\n\s*\n/u.test(normalized)) return null;
  return normalized;
}

/** Parses only the deterministic canonical SRT shape emitted by ShortsFlow. */
export function parseCanonicalSrtForTranslation(source: string): SubtitleTranslationCue[] {
  const normalized = normalizedLineEndings(source).replace(/\n+$/u, "");
  if (!normalized) throw new InvalidSourceSrtError();

  const blocks = normalized.split("\n\n");
  if (blocks.length > MAX_TRANSLATION_CUES) throw new InvalidSourceSrtError();

  let previousStartMs = -1;
  return blocks.map((block, position) => {
    const lines = block.split("\n");
    if (lines.length < 3 || !/^\d+$/u.test(lines[0])) throw new InvalidSourceSrtError();

    const index = Number(lines[0]);
    if (!Number.isSafeInteger(index) || index !== position + 1) throw new InvalidSourceSrtError();

    const timeMatch = /^(\d{2,}:[0-5]\d:[0-5]\d,\d{3}) --> (\d{2,}:[0-5]\d:[0-5]\d,\d{3})$/u.exec(lines[1]);
    if (!timeMatch) throw new InvalidSourceSrtError();
    const startMs = parseTimestamp(timeMatch[1]);
    const endMs = parseTimestamp(timeMatch[2]);
    if (startMs === null || endMs === null || endMs <= startMs || startMs < previousStartMs) {
      throw new InvalidSourceSrtError();
    }
    previousStartMs = startMs;

    const text = lines.slice(2).join("\n");
    if (!text.trim() || text.length > MAX_SOURCE_CUE_TEXT_LENGTH || /\n\s*\n/u.test(text)) {
      throw new InvalidSourceSrtError();
    }

    return { index, timeLine: lines[1], startMs, endMs, text };
  });
}

export function validateTranslatedCueTexts(
  value: unknown,
  sourceCues: readonly SubtitleTranslationCue[],
): { ok: true; translations: string[] } | { ok: false; reason: TranslationUnavailableReason } {
  if (!Array.isArray(value)) return { ok: false, reason: "malformed-provider-response" };
  if (value.length !== sourceCues.length) return { ok: false, reason: "incomplete-translation" };

  const translations: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return { ok: false, reason: "incomplete-translation" };
    const normalized = normalizeCueText(item);
    if (!normalized) return { ok: false, reason: "incomplete-translation" };
    translations.push(normalized);
  }

  const unchanged = translations.every((translation, index) =>
    normalizeCueText(sourceCues[index].text) === translation,
  );
  if (unchanged) return { ok: false, reason: "unchanged-result" };

  return { ok: true, translations };
}

/** Reuses canonical source order and timings; provider text never has SRT authority. */
export function reconstructTranslatedSrt(
  sourceCues: readonly SubtitleTranslationCue[],
  translations: readonly string[],
): string {
  if (sourceCues.length !== translations.length) throw new InvalidSourceSrtError();
  const srt = sourceCues.map((cue, index) =>
    `${cue.index}\n${cue.timeLine}\n${translations[index]}`,
  ).join("\n\n") + "\n";
  if (srt.length > MAX_TRANSLATED_SRT_LENGTH) throw new InvalidSourceSrtError();
  return srt;
}
