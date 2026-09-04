import {
  deriveImageCoverCropWindow,
  imageFramingBindingMatchesTrustedGeometry,
  imageFramingEqual,
  imageFramingFromAnchor,
  normalizeImageFraming,
  normalizeImageFramingBinding,
  type ImageFramingDimensions,
  type ImageFramingV1,
} from '@/core/media/imageFraming';
import {
  encodedPointToDisplay,
  encodedRegionToDisplay,
  normalizeTrustedImageDisplayGeometry,
  type ImageDisplayPoint,
  type ImageDisplayRegion,
} from '@/core/media/imageDisplayGeometry';
import { isCanonicalPrivateMediaIdentity } from '@/core/media/storageIdentity';
import type { Scene, SceneCompositionMotion } from '@/lib/types';
import {
  createVisualSpatialEvidenceRecord,
  isVisualSpatialEvidenceRecordCurrent,
  VISUAL_SPATIAL_EVIDENCE_VERSION,
  type VisualSpatialEvidenceRecord,
} from './spatial';

export const IMAGE_FRAMING_APPLICATION_VERSION = 1 as const;
export const IMAGE_FRAMING_SUBJECT_SAFE_INSET = 0.05 as const;

export type ImageFramingApplicationStatus = 'ready' | 'no-op' | 'invalid' | 'unavailable';
export type ImageFramingApplicationReason =
  | 'already-matches'
  | 'center-equivalent'
  | 'recommendation-available'
  | 'invalid-context'
  | 'invalid-evidence'
  | 'invalid-image'
  | 'source-dimensions-mismatch'
  | 'spatial-evidence-unavailable';

export interface ImageFramingApplicationProposalV1 {
  readonly version: typeof IMAGE_FRAMING_APPLICATION_VERSION;
  readonly status: ImageFramingApplicationStatus;
  readonly reason: ImageFramingApplicationReason;
  readonly projectId: string;
  readonly sceneId: string;
  readonly sceneIndex: number;
  readonly mediaIdentity?: string;
  readonly displayFocalPoint?: ImageDisplayPoint;
  readonly displaySubjectRegion?: ImageDisplayRegion;
  readonly confidenceBand?: 'low' | 'medium' | 'high';
  readonly currentFraming?: ImageFramingV1;
  readonly proposedFraming?: ImageFramingV1;
  /** Exact session-only staleness authority. It is not media or execution authority. */
  readonly authority: string;
}

export interface CreateImageFramingApplicationProposalInput {
  readonly projectId: string;
  readonly scenes: readonly Scene[];
  readonly sceneIndex: number;
  readonly outputDimensions: ImageFramingDimensions;
  readonly effectiveMotion: SceneCompositionMotion;
  readonly evidence?: VisualSpatialEvidenceRecord;
  readonly now?: number;
}

/** Pure advisory proposal generation. It cannot mutate Scene state or mint framing bindings. */
export function createImageFramingApplicationProposal(
  input: CreateImageFramingApplicationProposalInput,
): ImageFramingApplicationProposalV1 {
  const scene = validScene(input.scenes, input.sceneIndex);
  const sceneId = scene?.sceneId ?? '';
  const invalid = (reason: ImageFramingApplicationReason, status: ImageFramingApplicationStatus = 'invalid') =>
    proposal({ status, reason, projectId: input.projectId, sceneId, sceneIndex: input.sceneIndex });

  if (!validProjectId(input.projectId) || !scene || !validMotion(input.effectiveMotion)) return invalid('invalid-context');
  if (!scene.imageStorage || scene.videoStorage || scene.videoUrl || !isCanonicalPrivateMediaIdentity(scene.imageStorage)) {
    return invalid('invalid-image');
  }

  const mediaIdentity = `media:${scene.imageStorage.objectPath}`;
  let geometry: ReturnType<typeof normalizeTrustedImageDisplayGeometry>;
  let currentFraming: ImageFramingV1 | undefined;
  let currentBinding: ReturnType<typeof normalizeImageFramingBinding> | undefined;
  try {
    geometry = normalizeTrustedImageDisplayGeometry(scene.imageDisplayGeometry, mediaIdentity, input.now);
    currentFraming = scene.imageFraming === undefined ? undefined : normalizeImageFraming(scene.imageFraming);
    if (currentFraming) {
      currentBinding = normalizeImageFramingBinding(scene.imageFramingBinding, mediaIdentity);
      if (!imageFramingBindingMatchesTrustedGeometry(currentBinding, geometry, mediaIdentity, input.now)) return invalid('invalid-image');
    } else if (scene.imageFramingBinding !== undefined) {
      return invalid('invalid-image');
    }
  } catch {
    return invalid('invalid-image');
  }

  let evidence: VisualSpatialEvidenceRecord;
  try { evidence = normalizeEvidenceRecord(input.evidence); }
  catch { return invalid('invalid-evidence'); }

  if (!isVisualSpatialEvidenceRecordCurrent(evidence, {
    projectId: input.projectId,
    sceneId: scene.sceneId,
    sceneIndex: input.sceneIndex,
    scope: 'applied-image',
    mediaIdentity,
  })) return invalid('invalid-evidence');
  if (evidence.response.status !== 'evaluated') {
    return proposal({
      status: 'unavailable', reason: 'spatial-evidence-unavailable', projectId: input.projectId,
      sceneId, sceneIndex: input.sceneIndex, mediaIdentity,
    });
  }
  if (evidence.response.sourceDimensions.width !== geometry.encodedDimensions.width
    || evidence.response.sourceDimensions.height !== geometry.encodedDimensions.height) {
    return invalid('source-dimensions-mismatch');
  }

  let displayFocalPoint: ImageDisplayPoint;
  let displaySubjectRegion: ImageDisplayRegion | undefined;
  let proposedFraming: ImageFramingV1 | undefined;
  let outputDimensions: ImageFramingDimensions;
  try {
    displayFocalPoint = encodedPointToDisplay(evidence.response.focalPoint, geometry.encodedToDisplay);
    displaySubjectRegion = evidence.response.primarySubjectRegion
      ? encodedRegionToDisplay(evidence.response.primarySubjectRegion, geometry.encodedToDisplay)
      : undefined;
    proposedFraming = recommendedCanonicalFraming(
      geometry.displayDimensions,
      input.outputDimensions,
      displayFocalPoint,
      displaySubjectRegion,
    );
    outputDimensions = Object.freeze({ width: input.outputDimensions.width, height: input.outputDimensions.height });
  } catch {
    return invalid('invalid-evidence');
  }

  const context = {
    version: IMAGE_FRAMING_APPLICATION_VERSION,
    projectId: input.projectId,
    sceneId,
    sceneIndex: input.sceneIndex,
    mediaIdentity,
    contentDigest: geometry.contentDigest,
    encodedDimensions: geometry.encodedDimensions,
    displayDimensions: geometry.displayDimensions,
    encodedToDisplay: geometry.encodedToDisplay,
    currentFraming: currentFraming ?? null,
    currentFramingBinding: currentBinding ?? null,
    outputDimensions,
    effectiveMotion: input.effectiveMotion,
    spatialEvidence: {
      recordVersion: evidence.version,
      contractVersion: evidence.response.contractVersion,
      analyzerVersion: evidence.response.analyzerVersion,
      sourceDimensions: evidence.response.sourceDimensions,
      focalPoint: evidence.response.focalPoint,
      primarySubjectRegion: evidence.response.primarySubjectRegion ?? null,
      confidenceBand: evidence.response.confidenceBand,
    },
    proposedFraming: proposedFraming ?? null,
  };
  const matches = imageFramingEqual(currentFraming, proposedFraming);
  const status: ImageFramingApplicationStatus = !proposedFraming || matches ? 'no-op' : 'ready';
  return proposal({
    status,
    reason: !proposedFraming ? 'center-equivalent' : matches ? 'already-matches' : 'recommendation-available',
    projectId: input.projectId,
    sceneId,
    sceneIndex: input.sceneIndex,
    mediaIdentity,
    displayFocalPoint,
    displaySubjectRegion,
    confidenceBand: evidence.response.confidenceBand,
    currentFraming,
    proposedFraming,
    authority: canonicalSerialize(context),
  });
}

/** Rebuilds the exact proposal context; opaque capability rotation is intentionally ignored. */
export function isImageFramingApplicationProposalCurrent(
  proposalValue: ImageFramingApplicationProposalV1,
  input: CreateImageFramingApplicationProposalInput,
): boolean {
  try {
    if (!proposalValue || proposalValue.version !== IMAGE_FRAMING_APPLICATION_VERSION || proposalValue.status !== 'ready') return false;
    const current = createImageFramingApplicationProposal(input);
    return current.status === 'ready' && canonicalSerialize(current) === canonicalSerialize(proposalValue);
  } catch {
    return false;
  }
}

function normalizeEvidenceRecord(value: unknown): VisualSpatialEvidenceRecord {
  const source = strictObject(value, ['version', 'binding', 'response']);
  if (source.version !== VISUAL_SPATIAL_EVIDENCE_VERSION) throw new Error('Spatial evidence record is invalid.');
  return createVisualSpatialEvidenceRecord(
    source.binding as VisualSpatialEvidenceRecord['binding'],
    source.response,
  );
}

function recommendedCanonicalFraming(
  displayDimensions: ImageFramingDimensions,
  outputDimensions: ImageFramingDimensions,
  focal: ImageDisplayPoint,
  subject?: ImageDisplayRegion,
): ImageFramingV1 | undefined {
  const centered = deriveImageCoverCropWindow(displayDimensions, outputDimensions);
  const xs = canonicalAxisCandidates(
    centered.width,
    focal.x,
    subject?.x,
    subject?.width,
  );
  const ys = canonicalAxisCandidates(
    centered.height,
    focal.y,
    subject?.y,
    subject?.height,
  );
  let best: CanonicalCropCandidate | undefined;
  for (const anchorX of xs) for (const anchorY of ys) {
    const framing = imageFramingFromAnchor({ x: anchorX, y: anchorY });
    const crop = deriveImageCoverCropWindow(displayDimensions, outputDimensions, framing);
    if (!cropContainsPoint(crop, focal)) continue;
    const centerX = crop.x + crop.width / 2;
    const centerY = crop.y + crop.height / 2;
    const candidate: CanonicalCropCandidate = {
      framing,
      anchorX,
      anchorY,
      cropX: crop.x,
      cropY: crop.y,
      safeSubject: subject ? cropContainsSafeSubject(crop, subject) : false,
      overlap: subject
        ? overlapLength(crop.x, crop.x + crop.width, subject.x, subject.x + subject.width)
          * overlapLength(crop.y, crop.y + crop.height, subject.y, subject.y + subject.height)
        : 0,
      focalDistance: squaredDistance(centerX, centerY, focal.x, focal.y),
      imageDistance: squaredDistance(centerX, centerY, 0.5, 0.5),
      representationDistance: squaredDistance(anchorX, anchorY, centerX, centerY),
    };
    if (!best || betterCanonicalCandidate(candidate, best)) best = candidate;
  }
  if (!best) throw new Error('No canonical framing keeps the focal point visible.');
  return best.framing;
}

type CanonicalCropCandidate = Readonly<{
  framing?: ImageFramingV1;
  anchorX: number;
  anchorY: number;
  cropX: number;
  cropY: number;
  safeSubject: boolean;
  overlap: number;
  focalDistance: number;
  imageDistance: number;
  representationDistance: number;
}>;

function canonicalAxisCandidates(
  size: number,
  focal: number,
  subjectStart?: number,
  subjectSize?: number,
): number[] {
  if (size === 1) return [0.5];
  const legalMinimum = size / 2;
  const legalMaximum = 1 - size / 2;
  const meaningful = [
    legalMinimum,
    legalMaximum,
    0.5,
    focal,
    focal - size / 2,
    focal + size / 2,
  ];
  if (subjectStart !== undefined && subjectSize !== undefined) {
    const subjectEnd = subjectStart + subjectSize;
    const inset = size * IMAGE_FRAMING_SUBJECT_SAFE_INSET;
    meaningful.push(
      subjectStart - size / 2,
      subjectStart + size / 2,
      subjectEnd - size / 2,
      subjectEnd + size / 2,
      subjectStart + subjectSize / 2,
      subjectEnd + inset - size / 2,
      subjectStart - inset + size / 2,
    );
  }
  const candidates = new Set<number>();
  for (const value of meaningful) {
    const bounded = clamp(value, legalMinimum, legalMaximum);
    const nearest = Math.round(bounded * 10_000);
    for (const units of [nearest - 1, nearest, nearest + 1]) {
      candidates.add(clamp(units, 0, 10_000) / 10_000);
    }
  }
  return [...candidates].sort((left, right) => left - right);
}

function betterCanonicalCandidate(
  candidate: CanonicalCropCandidate,
  current: CanonicalCropCandidate,
): boolean {
  const epsilon = 1e-12;
  if (candidate.safeSubject !== current.safeSubject) return candidate.safeSubject;
  if (Math.abs(candidate.overlap - current.overlap) > epsilon) return candidate.overlap > current.overlap;
  if (Math.abs(candidate.focalDistance - current.focalDistance) > epsilon) return candidate.focalDistance < current.focalDistance;
  if (Math.abs(candidate.imageDistance - current.imageDistance) > epsilon) return candidate.imageDistance < current.imageDistance;
  if (Math.abs(candidate.cropX - current.cropX) > epsilon) return candidate.cropX < current.cropX;
  if (Math.abs(candidate.cropY - current.cropY) > epsilon) return candidate.cropY < current.cropY;
  if (Math.abs(candidate.representationDistance - current.representationDistance) > epsilon) {
    return candidate.representationDistance < current.representationDistance;
  }
  if (candidate.anchorX !== current.anchorX) return candidate.anchorX < current.anchorX;
  return candidate.anchorY < current.anchorY;
}

function cropContainsPoint(
  crop: ReturnType<typeof deriveImageCoverCropWindow>,
  point: ImageDisplayPoint,
): boolean {
  return point.x >= crop.x && point.x <= crop.x + crop.width
    && point.y >= crop.y && point.y <= crop.y + crop.height;
}

function cropContainsSafeSubject(
  crop: ReturnType<typeof deriveImageCoverCropWindow>,
  subject: ImageDisplayRegion,
): boolean {
  const insetX = crop.width * IMAGE_FRAMING_SUBJECT_SAFE_INSET;
  const insetY = crop.height * IMAGE_FRAMING_SUBJECT_SAFE_INSET;
  return subject.x - insetX >= crop.x
    && subject.y - insetY >= crop.y
    && subject.x + subject.width + insetX <= crop.x + crop.width
    && subject.y + subject.height + insetY <= crop.y + crop.height;
}

function overlapLength(leftStart: number, leftEnd: number, rightStart: number, rightEnd: number): number {
  return Math.max(0, Math.min(leftEnd, rightEnd) - Math.max(leftStart, rightStart));
}

function squaredDistance(x1: number, y1: number, x2: number, y2: number): number {
  return (x1 - x2) ** 2 + (y1 - y2) ** 2;
}

function proposal(value: Omit<ImageFramingApplicationProposalV1, 'version' | 'authority'> & { readonly authority?: string }): ImageFramingApplicationProposalV1 {
  return Object.freeze({ version: IMAGE_FRAMING_APPLICATION_VERSION, ...value, authority: value.authority ?? '' });
}

function validScene(scenes: readonly Scene[], sceneIndex: number): Scene | undefined {
  return Number.isSafeInteger(sceneIndex) && sceneIndex >= 0 && sceneIndex < scenes.length ? scenes[sceneIndex] : undefined;
}

function validProjectId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{1,160}$/u.test(value);
}

function validMotion(value: unknown): value is SceneCompositionMotion {
  return value === 'kenburns' || value === 'pan' || value === 'zoom_in' || value === 'zoom_out' || value === 'static';
}

function strictObject(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error('Spatial evidence record is invalid.');
  const source = value as Record<string, unknown>;
  if (Object.keys(source).length !== keys.length || keys.some((key) => !Object.prototype.hasOwnProperty.call(source, key))
    || Object.keys(source).some((key) => !keys.includes(key))) throw new Error('Spatial evidence record is invalid.');
  return source;
}

function canonicalSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalSerialize).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalSerialize(object[key])}`).join(',')}}`;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
