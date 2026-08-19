import type { CanonicalBrandingConfiguration, CanonicalWatermarkPosition } from './types';

const WATERMARK_POSITIONS = new Set<CanonicalWatermarkPosition>(['top-left', 'top-right', 'bottom-left', 'bottom-right']);
export const MAX_CANONICAL_WATERMARK_CHARACTERS = 20;

function hasUnsafeControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 0x1F || codePoint === 0x7F);
  });
}

/** The existing UI is a single-line watermark field, not a caption editor. */
export function normalizeCanonicalWatermarkText(value: unknown): string | null {
  if (typeof value !== 'string') throw new Error('Canonical watermark text is invalid.');
  const text = value.replace(/\r\n|\r/g, '\n').trim();
  if (!text) return null;
  if (hasUnsafeControlCharacter(text)) throw new Error('Canonical watermark text contains unsupported control characters.');
  if (Array.from(text).length > MAX_CANONICAL_WATERMARK_CHARACTERS) {
    throw new Error(`Canonical watermark text must be ${MAX_CANONICAL_WATERMARK_CHARACTERS} characters or fewer.`);
  }
  return text;
}

/**
 * Canonical branding accepts only the existing Studio text watermark contract.
 * It deliberately excludes arbitrary styles, paths, media, and filter syntax.
 */
export function normalizeCanonicalBrandingConfiguration(
  value: CanonicalBrandingConfiguration | undefined,
): CanonicalBrandingConfiguration {
  const watermark = value?.watermark;
  if (watermark === null || watermark === undefined) return { watermark: null };
  const text = normalizeCanonicalWatermarkText(watermark.text);
  if (!text) return { watermark: null };
  if (!WATERMARK_POSITIONS.has(watermark.position)) throw new Error('Canonical watermark position is invalid.');
  return { watermark: { text, position: watermark.position } };
}
