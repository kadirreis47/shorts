import type { SceneVisualBrief, VisualMediaPreference } from './types';

/**
 * Provider-neutral, metadata-only quality assessment. It deliberately makes
 * no claim about what a visual depicts; semantic assessment is a future,
 * separately validated extension and never media authority.
 */
export const VISUAL_QUALITY_VERSION = 1 as const;
export type VisualQualityGrade = 'excellent' | 'good' | 'acceptable' | 'weak' | 'reject';
export type VisualQualityReason =
  | 'high-resolution' | 'low-resolution' | 'metadata-incomplete'
  | 'vertical-native' | 'crop-light' | 'heavy-crop-required'
  | 'duration-fit' | 'duration-mismatch' | 'media-preference-match' | 'media-preference-mismatch'
  | 'strong-query-evidence' | 'cross-query-confirmed' | 'repeated-visual'
  | 'invalid-technical-metadata';
export type VisualQualitySignal =
  | 'resolution' | 'aspect-ratio' | 'crop-burden' | 'duration' | 'media-preference'
  | 'query-evidence' | 'cross-query-evidence' | 'reuse-pressure' | 'metadata-completeness';

export interface VisualQualityAssessment {
  readonly version: typeof VISUAL_QUALITY_VERSION;
  readonly grade: VisualQualityGrade;
  /** Bounded deterministic technical suitability, not a probability or semantic score. */
  readonly score: number;
  /** Only malformed technical metadata is excluded; imperfect candidates remain reviewable. */
  readonly hardRejected: boolean;
  readonly reasons: readonly VisualQualityReason[];
  readonly factualSignals: readonly VisualQualitySignal[];
  /** Bounded contribution used by deterministic discovery ranking. */
  readonly rankingAdjustment: number;
}

export interface QualityCandidateFacts {
  readonly candidateId: string;
  readonly mediaType: Exclude<VisualMediaPreference, 'either'>;
  readonly orientation: 'portrait' | 'landscape' | 'square' | 'unknown';
  readonly width?: number;
  readonly height?: number;
  readonly durationMs?: number;
  readonly descriptor?: string;
  readonly conceptPriorities: readonly number[];
  readonly providerRanks: readonly number[];
}

const TARGET_ASPECT_RATIO = 9 / 16;

export function assessVisualQuality(input: {
  readonly candidate: QualityCandidateFacts;
  readonly brief: Pick<SceneVisualBrief, 'preferredMedia'>;
  readonly repeatedAcrossScenes?: boolean;
}): VisualQualityAssessment {
  const { candidate, brief } = input;
  const reasons = new Set<VisualQualityReason>();
  const signals = new Set<VisualQualitySignal>();
  let score = 60;
  let rankingAdjustment = 0;
  let hardRejected = false;
  const hasWidth = candidate.width !== undefined;
  const hasHeight = candidate.height !== undefined;

  if (hasWidth !== hasHeight || (hasWidth && (!validDimension(candidate.width) || !validDimension(candidate.height)))) {
    hardRejected = true;
    reasons.add('invalid-technical-metadata');
    signals.add('resolution');
  } else if (hasWidth && hasHeight) {
    signals.add('resolution');
    const width = candidate.width!;
    const height = candidate.height!;
    if (width >= 720 && height >= 1_280) {
      reasons.add('high-resolution'); score += 14; rankingAdjustment += 10;
    } else if (Math.max(width, height) < 1_080) {
      reasons.add('low-resolution'); score -= 18; rankingAdjustment -= 12;
    }
    signals.add('aspect-ratio'); signals.add('crop-burden');
    const cropBurden = cropBurdenForPortrait(width, height);
    if (candidate.orientation === 'portrait' && cropBurden <= 0.14) {
      reasons.add('vertical-native'); score += 12; rankingAdjustment += 8;
    }
    if (cropBurden <= 0.15) {
      reasons.add('crop-light'); score += 4; rankingAdjustment += 3;
    } else if (cropBurden > 0.45) {
      reasons.add('heavy-crop-required'); score -= 16; rankingAdjustment -= 10;
    }
  } else {
    reasons.add('metadata-incomplete'); signals.add('metadata-completeness'); score -= 3; rankingAdjustment -= 2;
  }

  if (!candidate.descriptor?.trim()) { reasons.add('metadata-incomplete'); signals.add('metadata-completeness'); }

  if (candidate.mediaType === 'video') {
    signals.add('duration');
    if (candidate.durationMs === undefined) { reasons.add('metadata-incomplete'); score -= 3; rankingAdjustment -= 2; }
    else if (!Number.isSafeInteger(candidate.durationMs) || candidate.durationMs <= 0) { hardRejected = true; reasons.add('invalid-technical-metadata'); }
    else if (candidate.durationMs < 500) { hardRejected = true; reasons.add('duration-mismatch'); }
    else if (candidate.durationMs >= 2_000 && candidate.durationMs <= 20_000) { reasons.add('duration-fit'); score += 8; rankingAdjustment += 6; }
    else { reasons.add('duration-mismatch'); score -= 8; rankingAdjustment -= 5; }
  }

  signals.add('media-preference');
  if (brief.preferredMedia !== 'either') {
    // Ranking also keeps explicit preference as a deterministic primary tier.
    if (candidate.mediaType === brief.preferredMedia) { reasons.add('media-preference-match'); score += 10; rankingAdjustment += 28; }
    else { reasons.add('media-preference-mismatch'); score -= 12; rankingAdjustment -= 28; }
  }
  signals.add('query-evidence');
  if (best(candidate.conceptPriorities) === 1 && best(candidate.providerRanks) <= 2) { reasons.add('strong-query-evidence'); score += 5; rankingAdjustment += 4; }
  if (candidate.conceptPriorities.length > 1) { reasons.add('cross-query-confirmed'); signals.add('cross-query-evidence'); score += 8; rankingAdjustment += 6; }
  if (input.repeatedAcrossScenes) { reasons.add('repeated-visual'); signals.add('reuse-pressure'); score -= 15; }

  const boundedScore = hardRejected ? 0 : clamp(score, 0, 100);
  return Object.freeze({
    version: VISUAL_QUALITY_VERSION,
    grade: hardRejected ? 'reject' : gradeFor(boundedScore),
    score: boundedScore,
    hardRejected,
    reasons: Object.freeze([...reasons].sort()),
    factualSignals: Object.freeze([...signals].sort()),
    rankingAdjustment: hardRejected ? -40 : clamp(rankingAdjustment, -40, 40),
  });
}

export function cropBurdenForPortrait(width: number, height: number): number {
  if (!validDimension(width) || !validDimension(height)) return 1;
  const sourceAspect = width / height;
  const retained = sourceAspect > TARGET_ASPECT_RATIO ? TARGET_ASPECT_RATIO / sourceAspect : sourceAspect / TARGET_ASPECT_RATIO;
  return clamp(1 - retained, 0, 1);
}

function validDimension(value: number | undefined): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 20_000; }
function best(values: readonly number[]): number { return values.length ? Math.min(...values) : Number.MAX_SAFE_INTEGER; }
function clamp(value: number, minimum: number, maximum: number): number { return Math.max(minimum, Math.min(maximum, value)); }
function gradeFor(score: number): VisualQualityGrade { return score >= 85 ? 'excellent' : score >= 70 ? 'good' : score >= 50 ? 'acceptable' : score >= 30 ? 'weak' : 'reject'; }
