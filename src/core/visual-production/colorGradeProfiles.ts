import type { ColorGradeStyle } from './types';

export interface ResolvedColorGrade {
  readonly style: ColorGradeStyle;
  readonly intensity: number;
  readonly brightness: number;
  readonly contrast: number;
  readonly saturation: number;
  readonly gamma: number;
}

const profiles: Readonly<Record<ColorGradeStyle, Omit<ResolvedColorGrade, 'style' | 'intensity'>>> = Object.freeze({
  cinematic: { brightness: 0, contrast: 1.08, saturation: .94, gamma: .99 },
  vibrant: { brightness: .01, contrast: 1.10, saturation: 1.16, gamma: 1 },
  documentary: { brightness: 0, contrast: 1.03, saturation: .96, gamma: 1.01 },
  social: { brightness: .01, contrast: 1.06, saturation: 1.08, gamma: 1 },
  dramatic: { brightness: -.02, contrast: 1.16, saturation: .90, gamma: .96 },
});

export function resolveColorGrade(style: unknown, intensity: unknown): ResolvedColorGrade | null {
  if (typeof style !== 'string' || !isColorGradeStyle(style)) return null;
  const amount = bounded(intensity, 0, 1, .25);
  const profile = profiles[style];
  return {
    style,
    intensity: amount,
    brightness: round(profile.brightness * amount),
    contrast: round(1 + (profile.contrast - 1) * amount),
    saturation: round(1 + (profile.saturation - 1) * amount),
    gamma: round(1 + (profile.gamma - 1) * amount),
  };
}

export function colorGradeFilter(grade: ResolvedColorGrade): string {
  return `eq=brightness=${grade.brightness.toFixed(3)}:contrast=${grade.contrast.toFixed(3)}:saturation=${grade.saturation.toFixed(3)}:gamma=${grade.gamma.toFixed(3)}`;
}

function isColorGradeStyle(value: string): value is ColorGradeStyle { return Object.prototype.hasOwnProperty.call(profiles, value); }
function bounded(value: unknown, minimum: number, maximum: number, fallback: number): number { return typeof value === 'number' && Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback; }
function round(value: number): number { return Math.round(value * 1000) / 1000; }
