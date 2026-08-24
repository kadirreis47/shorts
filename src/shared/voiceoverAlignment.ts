/** Bounded, provider-neutral representation of original-text character timing. */
export interface NarrationCharacterAlignment {
  readonly characters: readonly string[];
  readonly characterStartTimesMs: readonly number[];
  readonly characterEndTimesMs: readonly number[];
}

export const MAX_NARRATION_ALIGNMENT_ENTRIES = 5_500;
export const MAX_NARRATION_ALIGNMENT_SOURCE_LENGTH = 5_000;
export const MAX_NARRATION_ALIGNMENT_DURATION_MS = 3_600_000;
const DURATION_TOLERANCE_MS = 1_500;

export function canonicalizeNarrationLineEndings(value: string): string {
  return value.replace(/\r\n?/gu, '\n');
}

/**
 * Validates the original ElevenLabs alignment only. Normalized alignment is
 * deliberately not accepted as an alternative transcript/timing authority.
 */
export function parseElevenLabsOriginalAlignment(
  value: unknown,
  expectedText: string,
  durationMs: number,
): NarrationCharacterAlignment | null {
  if (typeof expectedText !== 'string' || expectedText.length === 0 || expectedText.length > MAX_NARRATION_ALIGNMENT_SOURCE_LENGTH) return null;
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const characters = raw.characters;
  const starts = raw.character_start_times_seconds;
  const ends = raw.character_end_times_seconds;
  if (!Array.isArray(characters) || !Array.isArray(starts) || !Array.isArray(ends)) return null;
  const alignment = normalizeNarrationCharacterAlignment({
    characters,
    characterStartTimesMs: starts.map((time) => typeof time === 'number' ? Math.round(time * 1000) : time),
    characterEndTimesMs: ends.map((time) => typeof time === 'number' ? Math.round(time * 1000) : time),
  }, durationMs);
  if (!alignment || canonicalizeNarrationLineEndings(alignment.characters.join('')) !== canonicalizeNarrationLineEndings(expectedText)) return null;
  return alignment;
}

export function normalizeNarrationCharacterAlignment(
  value: unknown,
  durationMs: number,
): NarrationCharacterAlignment | null {
  if (!value || typeof value !== 'object' || !Number.isSafeInteger(durationMs) || durationMs <= 0 || durationMs > MAX_NARRATION_ALIGNMENT_DURATION_MS) return null;
  const raw = value as Record<string, unknown>;
  const characters = raw.characters;
  const starts = raw.characterStartTimesMs;
  const ends = raw.characterEndTimesMs;
  if (!Array.isArray(characters) || !Array.isArray(starts) || !Array.isArray(ends)
    || characters.length === 0 || characters.length > MAX_NARRATION_ALIGNMENT_ENTRIES
    || starts.length !== characters.length || ends.length !== characters.length) return null;
  const safeCharacters: string[] = [];
  const safeStarts: number[] = [];
  const safeEnds: number[] = [];
  let previousStart = -1;
  let previousEnd = -1;
  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index]; const start = starts[index]; const end = ends[index];
    if (typeof character !== 'string' || character.length === 0 || character.length > 32 || [...character].length > 16 || (/(?:\s)/u.test(character) && !/^\s+$/u.test(character)) || containsForbiddenControl(character)
      || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start
      || start < previousStart || end < previousEnd || end > durationMs + DURATION_TOLERANCE_MS) return null;
    safeCharacters.push(character); safeStarts.push(start); safeEnds.push(end);
    previousStart = start; previousEnd = end;
  }
  if (safeCharacters.join('').length > MAX_NARRATION_ALIGNMENT_SOURCE_LENGTH) return null;
  return { characters: safeCharacters, characterStartTimesMs: safeStarts, characterEndTimesMs: safeEnds };
}

function containsForbiddenControl(value: string): boolean {
  return [...value].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code === 0 || code === 127 || (code < 32 && code !== 9 && code !== 10 && code !== 13);
  });
}

export function decodeBase64Audio(value: unknown): Uint8Array | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 34_000_000 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) return null;
  try {
    const decoded = atob(value);
    const bytes = new Uint8Array(decoded.length);
    for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
    return bytes.length > 0 && bytes.length <= 25_000_000 ? bytes : null;
  } catch { return null; }
}
