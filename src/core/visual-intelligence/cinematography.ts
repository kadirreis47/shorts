import { cropBurdenForPortrait, type VisualQualityAssessment } from './quality';
import type { VisualSemanticAssessment } from './semantic';

/** Advisory mapping only: these are the currently executable still-image and canonical transition capabilities. */
export const CINEMATOGRAPHY_VERSION = 1 as const;
export type CinematographyShotStrategy = 'hold' | 'gentle-push' | 'restrained-pan' | 'transition-led';
export type CinematographyMotion = 'none' | 'low' | 'medium';
export type CinematographyCrop = 'preserve' | 'restrained' | 'avoid-extra-crop';
export type CinematographyTransition = 'none' | 'crossfade';
export type CinematographyStrength = 'weak' | 'moderate' | 'strong';
export type CinematographyReason = 'short-scene' | 'long-scene' | 'high-crop-burden' | 'weak-resolution-headroom' | 'strong-semantic-fit' | 'semantic-mismatch' | 'semantic-uncertain' | 'video-evidence-limited' | 'continuity-group-boundary' | 'repeated-media' | 'motion-run' | 'static-run' | 'repeated-strategy' | 'repeated-transition';

export interface CinematographyAssessment {
  readonly version: typeof CINEMATOGRAPHY_VERSION;
  readonly sceneId: string;
  readonly strategy: CinematographyShotStrategy;
  readonly motion: CinematographyMotion;
  readonly crop: CinematographyCrop;
  readonly transition: CinematographyTransition;
  /** Deterministic evidence coverage, not probability or aesthetic quality. */
  readonly strength: CinematographyStrength;
  readonly supported: true;
  readonly reasons: readonly CinematographyReason[];
}
export interface SequenceCinematographyAssessment {
  readonly version: typeof CINEMATOGRAPHY_VERSION;
  readonly rhythm: 'insufficient-evidence' | 'balanced' | 'repetitive' | 'motion-heavy' | 'static-heavy' | 'varied';
  readonly reasons: readonly CinematographyReason[];
}
export interface CinematographyEvidence {
  readonly sceneId: string;
  readonly mediaType: 'image' | 'video';
  readonly durationMs: number;
  readonly width?: number;
  readonly height?: number;
  readonly quality?: VisualQualityAssessment;
  readonly semantic?: VisualSemanticAssessment;
  readonly continuityBoundary?: boolean;
  readonly repeatedMedia?: boolean;
  readonly priorMotion?: CinematographyMotion;
  readonly priorTransition?: CinematographyTransition;
}

export function assessCinematography(input: CinematographyEvidence): CinematographyAssessment {
  const reasons = new Set<CinematographyReason>();
  const short = input.durationMs > 0 && input.durationMs < 3_000;
  const long = input.durationMs >= 7_000;
  if (short) reasons.add('short-scene'); if (long) reasons.add('long-scene');
  const cropBurden = input.width && input.height ? cropBurdenForPortrait(input.width, input.height) : undefined;
  if (cropBurden !== undefined && cropBurden > 0.45) reasons.add('high-crop-burden');
  if (input.quality?.reasons.includes('low-resolution')) reasons.add('weak-resolution-headroom');
  const semanticScore = input.semantic?.status === 'available' ? semanticAdjustment(input.semantic) : 0;
  if (semanticScore >= 3) reasons.add('strong-semantic-fit');
  if (semanticScore <= -3) reasons.add('semantic-mismatch');
  if (!input.semantic || input.semantic.status !== 'available') reasons.add('semantic-uncertain');
  if (input.mediaType === 'video') reasons.add('video-evidence-limited');
  if (input.continuityBoundary) reasons.add('continuity-group-boundary');
  if (input.repeatedMedia) reasons.add('repeated-media');
  if (input.priorMotion === 'medium') reasons.add('motion-run');
  if (input.priorMotion === 'none') reasons.add('static-run');
  if (input.priorTransition === 'crossfade') reasons.add('repeated-transition');

  const constrained = input.mediaType === 'video' || short || cropBurden !== undefined && cropBurden > 0.45 || input.quality?.reasons.includes('low-resolution') || input.priorMotion === 'medium';
  const motion: CinematographyMotion = constrained ? 'none' : long && semanticScore >= 3 ? 'medium' : semanticScore >= 3 || input.repeatedMedia ? 'low' : 'none';
  const crop: CinematographyCrop = cropBurden !== undefined && cropBurden > 0.45 ? 'avoid-extra-crop' : cropBurden !== undefined && cropBurden > 0.15 ? 'restrained' : 'preserve';
  const transition: CinematographyTransition = input.continuityBoundary && !short && input.priorTransition !== 'crossfade' ? 'crossfade' : 'none';
  const strategy: CinematographyShotStrategy = transition === 'crossfade' ? 'transition-led' : motion === 'medium' ? 'gentle-push' : motion === 'low' && !input.repeatedMedia ? 'gentle-push' : motion === 'low' ? 'restrained-pan' : 'hold';
  const strength: CinematographyStrength = reasons.size >= 4 ? 'strong' : reasons.size >= 2 ? 'moderate' : 'weak';
  return Object.freeze({ version: CINEMATOGRAPHY_VERSION, sceneId: input.sceneId, strategy, motion, crop, transition, strength, supported: true, reasons: Object.freeze([...reasons].sort()) });
}

export function assessSequenceCinematography(assessments: readonly CinematographyAssessment[]): SequenceCinematographyAssessment {
  const ordered = assessments.slice(); const reasons = new Set<CinematographyReason>();
  let medium = 0; let none = 0;
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index].strategy === ordered[index - 1].strategy) reasons.add('repeated-strategy');
    if (ordered[index].transition === 'crossfade' && ordered[index - 1].transition === 'crossfade') reasons.add('repeated-transition');
  }
  for (const assessment of ordered) { if (assessment.motion === 'medium') medium += 1; if (assessment.motion === 'none') none += 1; for (const reason of assessment.reasons) if (reason === 'repeated-media' || reason === 'motion-run' || reason === 'static-run') reasons.add(reason); }
  const rhythm = ordered.length < 3 ? 'insufficient-evidence' : medium >= 3 ? 'motion-heavy' : none >= 3 ? 'static-heavy' : reasons.has('repeated-strategy') || reasons.has('repeated-media') ? 'repetitive' : 'varied';
  return Object.freeze({ version: CINEMATOGRAPHY_VERSION, rhythm, reasons: Object.freeze([...reasons].sort()) });
}

function semanticAdjustment(assessment: VisualSemanticAssessment): number { return assessment.signals.reduce((total, signal) => total + (signal.state === 'evaluated' && signal.interpretation === 'match' ? signal.confidenceBand === 'high' ? 4 : signal.confidenceBand === 'medium' ? 2 : 1 : signal.state === 'evaluated' && signal.interpretation === 'mismatch' ? -2 : 0), 0); }
