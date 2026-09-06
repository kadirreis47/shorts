import { normalizeTrustedImageDisplayGeometry } from '@/core/media/imageDisplayGeometry';
import {
  deriveImageCoverCropWindow,
  normalizeImageFraming,
  type ImageFramingCropWindow,
} from '@/core/media/imageFraming';
import { resolveEffectiveSceneComposition } from '@/core/media/sceneComposition';
import {
  createImageFramingApplicationProposal,
  isImageFramingApplicationProposalCurrent,
  type ImageFramingApplicationProposalV1,
} from './imageFramingApplication';
import {
  createSpatialContinuityEvidenceReport,
  type CreateSpatialContinuityEvidenceReportInput,
  type SpatialContinuityEvidenceReportV1,
} from './spatialContinuity';

export const SPATIAL_CONTINUITY_FRAMING_RECOMMENDATION_VERSION = 1 as const;

export interface SpatialContinuityFramingRecommendationV1 {
  readonly version: typeof SPATIAL_CONTINUITY_FRAMING_RECOMMENDATION_VERSION;
  readonly projectId: string;
  readonly boundary: Readonly<{
    fromSceneId: string;
    fromSceneIndex: number;
    toSceneId: string;
    toSceneIndex: number;
  }>;
  readonly target: Readonly<{ sceneId: string; sceneIndex: number }>;
  readonly trigger: 'exact-crop-repetition';
  readonly current: Readonly<{
    predecessorCrop: ImageFramingCropWindow;
    targetCrop: ImageFramingCropWindow;
  }>;
  readonly predicted: Readonly<{ targetCrop: ImageFramingCropWindow }>;
  /** Existing 13B advisory proposal; it contains no geometry execution capability. */
  readonly framingProposal: ImageFramingApplicationProposalV1;
  readonly reason: 'alternative-framing-may-reduce-exact-crop-repetition';
  /** Session-only semantic currentness identity. It is not mutation or execution authority. */
  readonly freshnessFingerprint: string;
}

export interface CreateSpatialContinuityFramingRecommendationsInput {
  readonly continuityReport: SpatialContinuityEvidenceReportV1;
  readonly continuityInput: CreateSpatialContinuityEvidenceReportInput;
  /** Current, presentation-ready Slice 13B proposals keyed by durable scene ID. */
  readonly framingProposals: Readonly<Record<string, ImageFramingApplicationProposalV1 | undefined>>;
}

/**
 * Pure session-only wrapper around current Slice 13B framing proposals.
 * It neither searches for a framing nor owns canonical mutation.
 */
export function createSpatialContinuityFramingRecommendations(
  input: CreateSpatialContinuityFramingRecommendationsInput,
): readonly SpatialContinuityFramingRecommendationV1[] {
  const report = createSpatialContinuityEvidenceReport(input.continuityInput);
  if (canonicalSerialize(report) !== canonicalSerialize(input.continuityReport)) return Object.freeze([]);

  const recommendations = report.boundaries.flatMap((boundary) => {
    if (boundary.availability !== 'compared' || !boundary.findings.includes('exact-crop-repetition')) return [];
    const targetScene = input.continuityInput.scenes[boundary.toSceneIndex];
    if (!targetScene || targetScene.sceneId !== boundary.toSceneId || !targetScene.imageStorage) return [];
    const predecessor = report.sceneSignatures.find((signature) => signature.sceneId === boundary.fromSceneId
      && signature.sceneIndex === boundary.fromSceneIndex);
    const target = report.sceneSignatures.find((signature) => signature.sceneId === boundary.toSceneId
      && signature.sceneIndex === boundary.toSceneIndex);
    if (!predecessor || !target || !sameCrop(predecessor.crop, target.crop)) return [];

    const framingProposal = input.framingProposals[targetScene.sceneId];
    const evidence = input.continuityInput.appliedSpatialEvidence[targetScene.sceneId];
    if (!framingProposal || framingProposal.status !== 'ready' || !evidence) return [];
    const effective = resolveEffectiveSceneComposition(
      input.continuityInput.compositionDefaults,
      targetScene.compositionOverride,
      boundary.toSceneIndex,
    );
    const framingInput = {
      projectId: input.continuityInput.projectId,
      scenes: input.continuityInput.scenes,
      sceneIndex: boundary.toSceneIndex,
      outputDimensions: input.continuityInput.outputDimensions,
      effectiveMotion: effective.motion,
      evidence,
      now: input.continuityInput.evaluationTimeMs,
    } as const;
    if (!isImageFramingApplicationProposalCurrent(framingProposal, framingInput)
      || !framingProposal.proposedFraming) return [];

    let predictedTargetCrop: ImageFramingCropWindow;
    try {
      const mediaIdentity = `media:${targetScene.imageStorage.objectPath}`;
      const geometry = normalizeTrustedImageDisplayGeometry(
        targetScene.imageDisplayGeometry,
        mediaIdentity,
        input.continuityInput.evaluationTimeMs,
      );
      const proposedFraming = normalizeImageFraming(framingProposal.proposedFraming);
      if (!proposedFraming) return [];
      predictedTargetCrop = deriveImageCoverCropWindow(
        geometry.displayDimensions,
        input.continuityInput.outputDimensions,
        proposedFraming,
      );
    } catch {
      return [];
    }
    if (sameCrop(predictedTargetCrop, predecessor.crop)) return [];

    const boundaryIdentity = Object.freeze({
      fromSceneId: boundary.fromSceneId,
      fromSceneIndex: boundary.fromSceneIndex,
      toSceneId: boundary.toSceneId,
      toSceneIndex: boundary.toSceneIndex,
    });
    const targetIdentity = Object.freeze({ sceneId: boundary.toSceneId, sceneIndex: boundary.toSceneIndex });
    const current = Object.freeze({
      predecessorCrop: frozenCrop(predecessor.crop),
      targetCrop: frozenCrop(target.crop),
    });
    const predicted = Object.freeze({ targetCrop: frozenCrop(predictedTargetCrop) });
    const semanticIdentity = {
      version: SPATIAL_CONTINUITY_FRAMING_RECOMMENDATION_VERSION,
      projectId: input.continuityInput.projectId,
      continuityFreshnessFingerprint: report.freshnessFingerprint,
      boundary: boundaryIdentity,
      trigger: 'exact-crop-repetition',
      target: targetIdentity,
      current,
      predicted,
      framingProposalAuthority: framingProposal.authority,
    };
    return [Object.freeze({
      version: SPATIAL_CONTINUITY_FRAMING_RECOMMENDATION_VERSION,
      projectId: input.continuityInput.projectId,
      boundary: boundaryIdentity,
      target: targetIdentity,
      trigger: 'exact-crop-repetition' as const,
      current,
      predicted,
      framingProposal,
      reason: 'alternative-framing-may-reduce-exact-crop-repetition' as const,
      freshnessFingerprint: `spatial-continuity-framing-v1:${canonicalSerialize(semanticIdentity)}`,
    })];
  });
  return Object.freeze(recommendations);
}

/** Rebuilds the recommendation against current report, evidence, geometry, and 13B proposal state. */
export function isSpatialContinuityFramingRecommendationCurrent(
  recommendation: SpatialContinuityFramingRecommendationV1,
  input: CreateSpatialContinuityFramingRecommendationsInput,
): boolean {
  try {
    const current = createSpatialContinuityFramingRecommendations(input).find((candidate) =>
      candidate.boundary.fromSceneId === recommendation.boundary.fromSceneId
      && candidate.boundary.toSceneId === recommendation.boundary.toSceneId);
    return Boolean(current
      && recommendation.version === SPATIAL_CONTINUITY_FRAMING_RECOMMENDATION_VERSION
      && recommendation.trigger === 'exact-crop-repetition'
      && current.freshnessFingerprint === recommendation.freshnessFingerprint
      && canonicalSerialize(recommendationCurrentnessIdentity(current))
        === canonicalSerialize(recommendationCurrentnessIdentity(recommendation)));
  } catch {
    return false;
  }
}

function recommendationCurrentnessIdentity(recommendation: SpatialContinuityFramingRecommendationV1): unknown {
  return {
    version: recommendation.version,
    projectId: recommendation.projectId,
    boundary: recommendation.boundary,
    target: recommendation.target,
    trigger: recommendation.trigger,
    current: recommendation.current,
    predicted: recommendation.predicted,
    reason: recommendation.reason,
    freshnessFingerprint: recommendation.freshnessFingerprint,
    framingProposalAuthority: recommendation.framingProposal.authority,
  };
}

function sameCrop(left: ImageFramingCropWindow, right: ImageFramingCropWindow): boolean {
  return left.x === right.x && left.y === right.y && left.width === right.width && left.height === right.height;
}

function frozenCrop(crop: ImageFramingCropWindow): ImageFramingCropWindow {
  return Object.freeze({ x: crop.x, y: crop.y, width: crop.width, height: crop.height });
}

function canonicalSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new Error('Spatial continuity framing semantic input is invalid.');
    return serialized;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalSerialize).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalSerialize(object[key])}`).join(',')}}`;
}
