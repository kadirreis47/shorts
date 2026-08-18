import { normalizeCanonicalBrandingConfiguration } from '@/core/media/brandingTypes';
import type { CanonicalBrandingConfiguration } from '@/core/media/types';

export const CANONICAL_BRANDING_EXECUTION_VERSION = 1;
const WATERMARK_OPACITY = 0.72;

export interface CanonicalBrandingRenderPlan {
  readonly filter: string | null;
  readonly outputLabel: string;
}

/**
 * Builds the one global branding overlay. The fixed Windows Arial fontfile
 * and placement expressions are product policy, never renderer-provided
 * strings. Explicitly selecting the OS-bundled font avoids fontconfig fallback
 * variability in the packaged Windows runtime.
 */
export function buildCanonicalBrandingRenderPlan(input: {
  branding: CanonicalBrandingConfiguration | undefined;
  width: number;
  height: number;
  inputLabel: string;
}): CanonicalBrandingRenderPlan {
  const watermark = normalizeCanonicalBrandingConfiguration(input.branding).watermark;
  if (!watermark) return { filter: null, outputLabel: input.inputLabel };

  const margin = Math.max(24, Math.round(Math.min(input.width, input.height) * 0.04));
  const fontSize = Math.max(28, Math.round(input.height * 0.024));
  const { x, y } = positionExpressions(watermark.position, margin);
  const outputLabel = 'brandedvideo';
  return {
    filter: `[${input.inputLabel}]drawtext=fontfile='C\\:/Windows/Fonts/arial.ttf':text='${escapeDrawtextText(watermark.text)}':fontcolor=white@${WATERMARK_OPACITY}:fontsize=${fontSize}:x=${x}:y=${y}:expansion=none[${outputLabel}]`,
    outputLabel,
  };
}

export function escapeDrawtextText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\r\n|\r|\n/g, '\\n');
}

function positionExpressions(
  position: NonNullable<CanonicalBrandingConfiguration['watermark']>['position'],
  margin: number,
): { x: string; y: string } {
  switch (position) {
    case 'top-left': return { x: String(margin), y: String(margin) };
    case 'top-right': return { x: `w-text_w-${margin}`, y: String(margin) };
    case 'bottom-left': return { x: String(margin), y: `h-text_h-${margin}` };
    case 'bottom-right': return { x: `w-text_w-${margin}`, y: `h-text_h-${margin}` };
  }
}
