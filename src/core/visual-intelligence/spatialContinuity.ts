import {
  encodedPointToDisplay,
  encodedRegionToDisplay,
  normalizeTrustedImageDisplayGeometry,
  type ImageDisplayPoint,
  type ImageDisplayRegion,
  type TrustedImageDisplayGeometryV1,
} from '@/core/media/imageDisplayGeometry';
import {
  deriveImageCoverCropWindow,
  imageFramingBindingEqual,
  imageFramingBindingFromHistoricalGeometry,
  normalizeImageFraming,
  type ImageFramingBindingV1,
  type ImageFramingCropWindow,
  type ImageFramingDimensions,
} from '@/core/media/imageFraming';
import { resolveEffectiveSceneComposition, type SceneCompositionDefaults } from '@/core/media/sceneComposition';
import { isCanonicalSceneId } from '@/lib/sceneIdentity';
import type { Scene, SceneCompositionMotion, SceneCompositionTransition } from '@/lib/types';
import {
  isVisualSpatialEvidenceRecordCurrent,
  visualSpatialEvidenceSourceFromTrustedGeometry,
  type VisualSpatialEvidenceRecord,
} from './spatial';

export const SPATIAL_CONTINUITY_EVIDENCE_VERSION = 1 as const;
/** A crop-relative Euclidean distance. This is descriptive pressure, not an aesthetic judgment. */
export const SPATIAL_CONTINUITY_LARGE_FOCAL_SHIFT = 0.45;
/** Absolute crop-relative subject-occupancy change used only for a neutral boundary observation. */
export const SPATIAL_CONTINUITY_SUBJECT_OCCUPANCY_SHIFT = 0.25;

export type SpatialContinuityCoverageKind = 'analyzed' | 'unavailable' | 'unsupported';
export type SpatialContinuityFocalZone =
  | 'top-left' | 'top-center' | 'top-right'
  | 'middle-left' | 'middle-center' | 'middle-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';
export type SpatialContinuityFindingKind =
  | 'exact-crop-repetition'
  | 'repeated-focal-zone'
  | 'large-focal-position-shift'
  | 'subject-occupancy-shift'
  | 'subject-partially-outside-crop'
  | 'focal-outside-current-crop'
  | 'repeated-motion-context'
  | 'repeated-transition-context'
  | 'insufficient-spatial-evidence';

export interface SpatialContinuityCoverageV1 {
  readonly analyzedSceneIds: readonly string[];
  readonly unavailableSceneIds: readonly string[];
  readonly unsupportedSceneIds: readonly string[];
}

/** Derived display-space facts only; it deliberately carries no execution capability or future Apply authority. */
export interface SpatialContinuitySceneSignatureV1 {
  readonly sceneId: string;
  readonly sceneIndex: number;
  readonly mediaIdentity: string;
  readonly crop: ImageFramingCropWindow;
  readonly cropCenter: ImageDisplayPoint;
  readonly focalInsideCrop: boolean;
  readonly cropRelativeFocal?: ImageDisplayPoint;
  readonly focalZone?: SpatialContinuityFocalZone;
  readonly subjectVisibilityRatio?: number;
  readonly subjectOccupancyRatio?: number;
  readonly subjectPartiallyOutsideCrop?: boolean;
  readonly effectiveMotion: SceneCompositionMotion;
  readonly incomingTransition: SceneCompositionTransition;
  readonly durationMs: number;
}

export interface SpatialContinuityBoundaryV1 {
  readonly fromSceneId: string;
  readonly fromSceneIndex: number;
  readonly toSceneId: string;
  readonly toSceneIndex: number;
  readonly availability: 'compared' | 'insufficient-spatial-evidence';
  readonly findings: readonly SpatialContinuityFindingKind[];
}

export interface SpatialContinuityEvidenceReportV1 {
  readonly version: typeof SPATIAL_CONTINUITY_EVIDENCE_VERSION;
  readonly freshnessFingerprint: string;
  readonly coverage: SpatialContinuityCoverageV1;
  readonly sceneSignatures: readonly SpatialContinuitySceneSignatureV1[];
  readonly boundaries: readonly SpatialContinuityBoundaryV1[];
}

export interface CreateSpatialContinuityEvidenceReportInput {
  readonly projectId: string;
  readonly scenes: readonly Scene[];
  readonly appliedSpatialEvidence: Readonly<Record<string, VisualSpatialEvidenceRecord | undefined>>;
  /** Raw authority-bearing values are validated by the evaluator at evaluationTimeMs. */
  readonly trustedImageGeometry: Readonly<Record<string, unknown>>;
  readonly evaluationTimeMs: number;
  readonly outputDimensions: ImageFramingDimensions;
  readonly compositionDefaults: SceneCompositionDefaults;
}

/**
 * Pure session-only continuity evidence. It evaluates current final display crops,
 * never creates a proposal, and never owns canonical scene mutation.
 */
export function createSpatialContinuityEvidenceReport(
  input: CreateSpatialContinuityEvidenceReportInput,
): SpatialContinuityEvidenceReportV1 {
  const evaluationTimeMs = evaluationTime(input.evaluationTimeMs);
  const output = dimensions(input.outputDimensions);
  const scenes = input.scenes.map((scene, sceneIndex) => deriveScene(input, scene, sceneIndex, output, evaluationTimeMs));
  const coverage: SpatialContinuityCoverageV1 = Object.freeze({
    analyzedSceneIds: Object.freeze(scenes.filter((item) => item.kind === 'analyzed').map((item) => item.scene.sceneId)),
    unavailableSceneIds: Object.freeze(scenes.filter((item) => item.kind === 'unavailable').map((item) => item.scene.sceneId)),
    unsupportedSceneIds: Object.freeze(scenes.filter((item) => item.kind === 'unsupported').map((item) => item.scene.sceneId)),
  });
  const signatures = Object.freeze(scenes.flatMap((item) => item.signature ? [item.signature] : []));
  const boundaries = Object.freeze(scenes.slice(1).map((current, index) => boundaryFor(scenes[index], current)));
  const freshnessFingerprint = fingerprint({
    version: SPATIAL_CONTINUITY_EVIDENCE_VERSION,
    projectId: input.projectId,
    outputDimensions: output,
    scenes: scenes.map((item) => item.freshness),
  });
  return Object.freeze({ version: SPATIAL_CONTINUITY_EVIDENCE_VERSION, freshnessFingerprint, coverage, sceneSignatures: signatures, boundaries });
}

type DerivedScene = Readonly<{
  scene: Scene;
  sceneIndex: number;
  kind: SpatialContinuityCoverageKind;
  signature?: SpatialContinuitySceneSignatureV1;
  freshness: unknown;
}>;

function deriveScene(
  input: CreateSpatialContinuityEvidenceReportInput,
  scene: Scene,
  sceneIndex: number,
  output: ImageFramingDimensions,
  evaluationTimeMs: number,
): DerivedScene {
  const effective = resolveEffectiveSceneComposition(input.compositionDefaults, scene.compositionOverride, sceneIndex);
  const base = {
    sceneId: scene.sceneId,
    sceneIndex,
    media: scene.imageStorage && !scene.videoStorage && !scene.videoUrl ? `media:${scene.imageStorage.objectPath}` : null,
    durationMs: durationMs(scene.duration),
    effectiveMotion: effective.motion,
    incomingTransition: effective.transition,
  };
  if (!isCanonicalSceneId(scene.sceneId) || !scene.imageStorage || scene.videoStorage || scene.videoUrl) {
    return Object.freeze({ scene, sceneIndex, kind: 'unsupported', freshness: { ...base, state: 'unsupported' } });
  }
  const mediaIdentity = `media:${scene.imageStorage.objectPath}`;
  const geometryValue = input.trustedImageGeometry[scene.sceneId];
  const evidence = input.appliedSpatialEvidence[scene.sceneId];
  let geometry: TrustedImageDisplayGeometryV1;
  try {
    geometry = normalizeTrustedImageDisplayGeometry(geometryValue, mediaIdentity, evaluationTimeMs);
  } catch {
    return Object.freeze({ scene, sceneIndex, kind: 'unavailable', freshness: { ...base, state: 'unavailable', geometry: immutableGeometryValue(geometryValue, mediaIdentity), evidence: evidenceFreshness(evidence) } });
  }
  const currentSource = visualSpatialEvidenceSourceFromTrustedGeometry(geometry, mediaIdentity, evaluationTimeMs);
  if (!evidence
    || !isVisualSpatialEvidenceRecordCurrent(evidence, { projectId: input.projectId, sceneId: scene.sceneId, sceneIndex, scope: 'applied-image', mediaIdentity }, currentSource)
    || evidence.response.status !== 'evaluated'
    || evidence.response.sourceDimensions.width !== geometry.encodedDimensions.width
    || evidence.response.sourceDimensions.height !== geometry.encodedDimensions.height) {
    return Object.freeze({ scene, sceneIndex, kind: 'unavailable', freshness: { ...base, state: 'unavailable', geometry: immutableGeometry(geometry), evidence: evidenceFreshness(evidence) } });
  }
  let framing: ReturnType<typeof normalizeImageFraming>;
  let binding: ImageFramingBindingV1 | undefined;
  try {
    framing = scene.imageFraming === undefined ? undefined : normalizeImageFraming(scene.imageFraming);
    binding = scene.imageFramingBinding;
    const expectedBinding = imageFramingBindingFromHistoricalGeometry(geometry, mediaIdentity);
    if ((framing === undefined && binding !== undefined) || (framing !== undefined && !imageFramingBindingEqual(binding, expectedBinding))) {
      return Object.freeze({ scene, sceneIndex, kind: 'unavailable', freshness: { ...base, state: 'unavailable', geometry: immutableGeometry(geometry), evidence: evidenceFreshness(evidence), framing: framing ?? null, binding: 'mismatch' } });
    }
  } catch {
    return Object.freeze({ scene, sceneIndex, kind: 'unavailable', freshness: { ...base, state: 'unavailable', geometry: immutableGeometry(geometry), evidence: evidenceFreshness(evidence), framing: 'invalid' } });
  }
  const focal = encodedPointToDisplay(evidence.response.focalPoint, geometry.encodedToDisplay);
  const subject = evidence.response.primarySubjectRegion
    ? encodedRegionToDisplay(evidence.response.primarySubjectRegion, geometry.encodedToDisplay)
    : undefined;
  const crop = deriveImageCoverCropWindow(geometry.displayDimensions, output, framing);
  const focalInsideCrop = containsPoint(crop, focal);
  const cropRelativeFocal = focalInsideCrop ? Object.freeze({
    x: cropRelativeCoordinate(focal.x, crop.x, crop.width),
    y: cropRelativeCoordinate(focal.y, crop.y, crop.height),
  }) : undefined;
  const subjectFacts = subject ? subjectDerivations(subject, crop) : undefined;
  const signature: SpatialContinuitySceneSignatureV1 = Object.freeze({
    sceneId: scene.sceneId,
    sceneIndex,
    mediaIdentity,
    crop: Object.freeze({ ...crop }),
    cropCenter: Object.freeze({ x: crop.x + crop.width / 2, y: crop.y + crop.height / 2 }),
    focalInsideCrop,
    ...(cropRelativeFocal ? { cropRelativeFocal, focalZone: focalZone(cropRelativeFocal) } : {}),
    ...(subjectFacts ? subjectFacts : {}),
    effectiveMotion: effective.motion,
    incomingTransition: effective.transition,
    durationMs: durationMs(scene.duration),
  });
  return Object.freeze({
    scene, sceneIndex,
    kind: 'analyzed',
    signature,
    freshness: {
      ...base,
      state: 'analyzed',
      geometry: immutableGeometry(geometry),
      framing: framing ?? null,
      framingBinding: binding ? historicalBinding(geometry, mediaIdentity) : null,
      evidence: evidenceFreshness(evidence),
    },
  });
}

function boundaryFor(previous: DerivedScene, current: DerivedScene): SpatialContinuityBoundaryV1 {
  const base = {
    fromSceneId: previous.scene.sceneId,
    fromSceneIndex: previous.sceneIndex,
    toSceneId: current.scene.sceneId,
    toSceneIndex: current.sceneIndex,
  };
  if (!previous.signature || !current.signature) {
    return Object.freeze({ ...base, availability: 'insufficient-spatial-evidence' as const, findings: Object.freeze(['insufficient-spatial-evidence'] as const) });
  }
  const from = previous.signature;
  const to = current.signature;
  const findings = new Set<SpatialContinuityFindingKind>();
  if (sameCrop(from.crop, to.crop)) findings.add('exact-crop-repetition');
  if (from.focalZone && from.focalZone === to.focalZone) findings.add('repeated-focal-zone');
  if (from.cropRelativeFocal && to.cropRelativeFocal
    && distance(from.cropRelativeFocal, to.cropRelativeFocal) + 1e-12 >= SPATIAL_CONTINUITY_LARGE_FOCAL_SHIFT) findings.add('large-focal-position-shift');
  if (from.subjectOccupancyRatio !== undefined && to.subjectOccupancyRatio !== undefined
    && Math.abs(from.subjectOccupancyRatio - to.subjectOccupancyRatio) + 1e-12 >= SPATIAL_CONTINUITY_SUBJECT_OCCUPANCY_SHIFT) findings.add('subject-occupancy-shift');
  if (from.subjectPartiallyOutsideCrop || to.subjectPartiallyOutsideCrop) findings.add('subject-partially-outside-crop');
  if (!from.focalInsideCrop || !to.focalInsideCrop) findings.add('focal-outside-current-crop');
  if (from.effectiveMotion === to.effectiveMotion) findings.add('repeated-motion-context');
  if (from.sceneIndex > 0 && from.incomingTransition === to.incomingTransition) findings.add('repeated-transition-context');
  return Object.freeze({ ...base, availability: 'compared' as const, findings: Object.freeze([...findings].sort()) });
}

function subjectDerivations(subject: ImageDisplayRegion, crop: ImageFramingCropWindow): Pick<SpatialContinuitySceneSignatureV1, 'subjectVisibilityRatio' | 'subjectOccupancyRatio' | 'subjectPartiallyOutsideCrop'> {
  const area = subject.width * subject.height;
  const intersection = overlapArea(subject, crop);
  const visibility = boundedRatio(intersection, area);
  return Object.freeze({
    subjectVisibilityRatio: visibility,
    subjectOccupancyRatio: boundedRatio(intersection, crop.width * crop.height),
    subjectPartiallyOutsideCrop: visibility < 1,
  });
}

function focalZone(point: ImageDisplayPoint): SpatialContinuityFocalZone {
  const horizontal = point.x < 1 / 3 ? 'left' : point.x > 2 / 3 ? 'right' : 'center';
  const vertical = point.y < 1 / 3 ? 'top' : point.y > 2 / 3 ? 'bottom' : 'middle';
  return `${vertical}-${horizontal}` as SpatialContinuityFocalZone;
}

function containsPoint(crop: ImageFramingCropWindow, point: ImageDisplayPoint): boolean {
  return point.x >= crop.x && point.x <= crop.x + crop.width && point.y >= crop.y && point.y <= crop.y + crop.height;
}

function cropRelativeCoordinate(value: number, cropStart: number, cropSize: number): number {
  const relative = (value - cropStart) / cropSize;
  for (const boundary of [0, 1 / 3, 2 / 3, 1]) {
    if (Math.abs(relative - boundary) <= 1e-12) return boundary;
  }
  return relative;
}

function overlapArea(region: ImageDisplayRegion, crop: ImageFramingCropWindow): number {
  const width = Math.max(0, Math.min(region.x + region.width, crop.x + crop.width) - Math.max(region.x, crop.x));
  const height = Math.max(0, Math.min(region.y + region.height, crop.y + crop.height) - Math.max(region.y, crop.y));
  return width * height;
}

function boundedRatio(numerator: number, denominator: number): number {
  return Math.max(0, Math.min(1, numerator / denominator));
}

function sameCrop(left: ImageFramingCropWindow, right: ImageFramingCropWindow): boolean {
  return left.x === right.x && left.y === right.y && left.width === right.width && left.height === right.height;
}

function distance(left: ImageDisplayPoint, right: ImageDisplayPoint): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function dimensions(value: ImageFramingDimensions): ImageFramingDimensions {
  if (!value || !Number.isSafeInteger(value.width) || !Number.isSafeInteger(value.height) || value.width <= 0 || value.height <= 0) throw new Error('Spatial continuity output dimensions are invalid.');
  return Object.freeze({ width: value.width, height: value.height });
}

function evaluationTime(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Spatial continuity evaluation time is invalid.');
  return value;
}

function durationMs(duration: number): number {
  return Number.isFinite(duration) && duration >= 0 ? Math.round(duration * 1_000) : 0;
}

function immutableGeometry(geometry: TrustedImageDisplayGeometryV1 | undefined): unknown {
  return geometry ? {
    mediaIdentity: geometry.mediaIdentity,
    contentDigest: geometry.contentDigest,
    encodedDimensions: geometry.encodedDimensions,
    displayDimensions: geometry.displayDimensions,
    encodedToDisplay: geometry.encodedToDisplay,
  } : null;
}

function immutableGeometryValue(value: unknown, mediaIdentity: string): unknown {
  try {
    const binding = imageFramingBindingFromHistoricalGeometry(value, mediaIdentity);
    return {
      mediaIdentity: binding.mediaIdentity,
      contentDigest: binding.contentDigest,
      encodedDimensions: binding.encodedDimensions,
      displayDimensions: binding.displayDimensions,
      encodedToDisplay: binding.encodedToDisplay,
    };
  } catch { return null; }
}

function historicalBinding(geometry: TrustedImageDisplayGeometryV1, mediaIdentity: string): ImageFramingBindingV1 {
  return imageFramingBindingFromHistoricalGeometry(geometry, mediaIdentity);
}

function evidenceFreshness(evidence: VisualSpatialEvidenceRecord | undefined): unknown {
  if (!evidence) return null;
  if (evidence.response.status !== 'evaluated') return {
    binding: evidence.binding,
    source: evidence.source ?? null,
    status: evidence.response.status,
    contractVersion: evidence.response.contractVersion,
  };
  return {
    binding: evidence.binding,
    source: evidence.source ?? null,
    contractVersion: evidence.response.contractVersion,
    analyzerVersion: evidence.response.analyzerVersion,
    sourceDimensions: evidence.response.sourceDimensions,
    focalPoint: evidence.response.focalPoint,
    primarySubjectRegion: evidence.response.primarySubjectRegion ?? null,
    confidenceBand: evidence.response.confidenceBand,
  };
}

function fingerprint(value: unknown): string {
  return `spatial-continuity-v1:${canonicalSerialize(value)}`;
}

function canonicalSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new Error('Spatial continuity semantic input is invalid.');
    return serialized;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalSerialize).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalSerialize(object[key])}`).join(',')}}`;
}
