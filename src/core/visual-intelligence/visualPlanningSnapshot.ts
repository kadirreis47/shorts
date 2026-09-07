import type { ImageFramingDimensions } from '@/core/media/imageFraming';
import type { SceneCompositionMotion, SceneCompositionTransition } from '@/lib/types';
import {
  createSpatialContinuityEvidenceBundleV1,
  type CreateSpatialContinuityEvidenceReportInput,
  type SpatialContinuityCoverageV1,
  type SpatialContinuityFindingKind,
  type SpatialContinuityFocalZone,
  type SpatialContinuityVerificationSceneV1,
} from './spatialContinuity';
import {
  createVisualRhythmEvidenceReport,
  type VisualRhythmMediaKind,
  type VisualRhythmRunKind,
} from './visualRhythm';
import type { ImageFramingCropWindow } from '@/core/media/imageFraming';

export const VALIDATED_VISUAL_PLANNING_SNAPSHOT_VERSION = 1 as const;
const VISUAL_PLANNING_VERIFICATION_PROJECTION_VERSION = 1 as const;

export interface ValidatedVisualPlanningSnapshotSceneV1 {
  readonly sceneId: string;
  readonly sceneIndex: number;
  readonly durationMs: number;
  readonly mediaKind: VisualRhythmMediaKind;
  readonly mediaIdentity?: string;
  /** Canonical render intent, not measured source-camera motion. */
  readonly effectiveMotion: SceneCompositionMotion;
  readonly incomingTransition: SceneCompositionTransition | null;
  readonly spatial?: Readonly<{
    crop: ImageFramingCropWindow;
    focalZone?: SpatialContinuityFocalZone;
    subjectOccupancyRatio?: number;
  }>;
}

export interface ValidatedVisualPlanningSnapshotBoundaryV1 {
  readonly fromSceneId: string;
  readonly fromSceneIndex: number;
  readonly toSceneId: string;
  readonly toSceneIndex: number;
  readonly availability: 'compared' | 'insufficient-spatial-evidence';
  readonly findings: readonly SpatialContinuityFindingKind[];
}

export interface ValidatedVisualPlanningSnapshotRunV1 {
  readonly kind: VisualRhythmRunKind;
  readonly sceneIds: readonly string[];
  readonly boundaryKeys: readonly string[];
}

/** A session-only, non-authorizing factual boundary for future planning consumers. */
export interface ValidatedVisualPlanningSnapshotV1 {
  readonly version: typeof VALIDATED_VISUAL_PLANNING_SNAPSHOT_VERSION;
  readonly projectId: string;
  readonly canonical: Readonly<{
    orderedScenes: readonly ValidatedVisualPlanningSnapshotSceneV1[];
  }>;
  readonly spatialContinuity: Readonly<{
    freshnessFingerprint: string;
    outputDimensions: ImageFramingDimensions;
    coverage: SpatialContinuityCoverageV1;
    boundaries: readonly ValidatedVisualPlanningSnapshotBoundaryV1[];
  }>;
  readonly visualRhythm: Readonly<{
    freshnessFingerprint: string;
    coverage: Readonly<{
      structuralSceneCount: number;
      spatialAnalyzedSceneCount: number;
      spatialUnavailableSceneCount: number;
      spatialUnsupportedSceneCount: number;
    }>;
    runs: readonly ValidatedVisualPlanningSnapshotRunV1[];
  }>;
  /** Semantic currentness identity only; it grants no mutation or execution authority. */
  readonly semanticFingerprint: string;
}

/** Module-private source material for durable digest derivation; never persist this object. */
interface VisualPlanningVerificationProjectionV1 {
  readonly version: typeof VISUAL_PLANNING_VERIFICATION_PROJECTION_VERSION;
  readonly projectId: string;
  readonly snapshotVersion: typeof VALIDATED_VISUAL_PLANNING_SNAPSHOT_VERSION;
  readonly spatialScenes: readonly SpatialContinuityVerificationSceneV1[];
}

export interface ValidatedVisualPlanningSnapshotBundleV1 {
  readonly snapshot: ValidatedVisualPlanningSnapshotV1;
}

export type VisualPlanningVerificationDigestSceneV1 =
  | Readonly<{
      sceneId: string;
      sceneIndex: number;
      coverage: 'analyzed';
      factualDigest: string;
    }>
  | Readonly<{
      sceneId: string;
      sceneIndex: number;
      coverage: 'unavailable' | 'unsupported';
    }>;

export interface VisualPlanningVerificationDigestMaterialV1 {
  readonly semanticDigest: string;
  readonly spatialScenes: readonly VisualPlanningVerificationDigestSceneV1[];
}

interface TrustedVisualPlanningBundleStateV1 {
  readonly snapshot: ValidatedVisualPlanningSnapshotV1;
  readonly verificationProjection: VisualPlanningVerificationProjectionV1;
}

/** Process-local construction provenance. Structural copies deliberately lose this authority. */
const trustedVisualPlanningBundles = new WeakMap<object, TrustedVisualPlanningBundleStateV1>();

/**
 * Derives both factual source reports from one explicit input boundary. Spatial
 * Continuity is evaluated once, and that exact report feeds Visual Rhythm.
 */
export function createValidatedVisualPlanningSnapshot(
  input: CreateSpatialContinuityEvidenceReportInput,
): ValidatedVisualPlanningSnapshotV1 {
  return createValidatedVisualPlanningSnapshotBundleV1(input).snapshot;
}

/** Creates one certified snapshot bundle and privately associates its same-evaluation verification projection. */
export function createValidatedVisualPlanningSnapshotBundleV1(
  input: CreateSpatialContinuityEvidenceReportInput,
): ValidatedVisualPlanningSnapshotBundleV1 {
  const spatialBundle = createSpatialContinuityEvidenceBundleV1(input);
  const spatialContinuityReport = spatialBundle.report;
  const visualRhythmReport = createVisualRhythmEvidenceReport({
    projectId: input.projectId,
    scenes: input.scenes,
    compositionDefaults: input.compositionDefaults,
    spatialContinuityReport,
  });
  const payload = Object.freeze({
    version: VALIDATED_VISUAL_PLANNING_SNAPSHOT_VERSION,
    projectId: input.projectId,
    canonical: Object.freeze({
      orderedScenes: Object.freeze(visualRhythmReport.sceneSignatures.map((scene) => Object.freeze({
        sceneId: scene.sceneId,
        sceneIndex: scene.sceneIndex,
        durationMs: scene.durationMs,
        mediaKind: scene.mediaKind,
        ...(scene.mediaIdentity === undefined ? {} : { mediaIdentity: scene.mediaIdentity }),
        effectiveMotion: scene.effectiveMotion,
        incomingTransition: scene.incomingTransition,
        ...(scene.spatial ? { spatial: Object.freeze({
          crop: Object.freeze({ ...scene.spatial.crop }),
          ...(scene.spatial.focalZone === undefined ? {} : { focalZone: scene.spatial.focalZone }),
          ...(scene.spatial.subjectOccupancyRatio === undefined
            ? {} : { subjectOccupancyRatio: scene.spatial.subjectOccupancyRatio }),
        }) } : {}),
      }))),
    }),
    spatialContinuity: Object.freeze({
      freshnessFingerprint: spatialContinuityReport.freshnessFingerprint,
      outputDimensions: Object.freeze({ ...input.outputDimensions }),
      coverage: frozenCoverage(spatialContinuityReport.coverage),
      boundaries: Object.freeze(spatialContinuityReport.boundaries.map((boundary) => Object.freeze({
        fromSceneId: boundary.fromSceneId,
        fromSceneIndex: boundary.fromSceneIndex,
        toSceneId: boundary.toSceneId,
        toSceneIndex: boundary.toSceneIndex,
        availability: boundary.availability,
        findings: Object.freeze([...boundary.findings]),
      }))),
    }),
    visualRhythm: Object.freeze({
      freshnessFingerprint: visualRhythmReport.freshnessFingerprint,
      coverage: Object.freeze({
        structuralSceneCount: visualRhythmReport.coverage.structuralSceneIds.length,
        spatialAnalyzedSceneCount: visualRhythmReport.coverage.spatialAnalyzedSceneIds.length,
        spatialUnavailableSceneCount: visualRhythmReport.coverage.spatialUnavailableSceneIds.length,
        spatialUnsupportedSceneCount: visualRhythmReport.coverage.spatialUnsupportedSceneIds.length,
      }),
      runs: Object.freeze(visualRhythmReport.runs.map((run) => Object.freeze({
        kind: run.kind,
        sceneIds: Object.freeze([...run.sceneIds]),
        boundaryKeys: Object.freeze([...run.boundaryKeys]),
      }))),
    }),
  });
  const snapshot = Object.freeze({
    ...payload,
    semanticFingerprint: fingerprint(payload),
  });
  const verificationProjection: VisualPlanningVerificationProjectionV1 = Object.freeze({
    version: VISUAL_PLANNING_VERIFICATION_PROJECTION_VERSION,
    projectId: input.projectId,
    snapshotVersion: VALIDATED_VISUAL_PLANNING_SNAPSHOT_VERSION,
    spatialScenes: spatialBundle.verificationScenes,
  });
  const bundle: ValidatedVisualPlanningSnapshotBundleV1 = Object.freeze({ snapshot });
  trustedVisualPlanningBundles.set(bundle, Object.freeze({ snapshot, verificationProjection }));
  return bundle;
}

/** Runtime authority check: only the exact object returned by the bundle builder is trusted. */
export function isTrustedValidatedVisualPlanningSnapshotBundleV1(
  value: unknown,
): value is ValidatedVisualPlanningSnapshotBundleV1 {
  if (!isRecord(value)) return false;
  const trusted = trustedVisualPlanningBundles.get(value);
  return trusted !== undefined
    && Object.isFrozen(value)
    && value.snapshot === trusted.snapshot;
}

/** Hashes only verification material privately associated with a certified bundle. */
export async function createTrustedVisualPlanningVerificationDigestMaterialV1(
  bundle: unknown,
): Promise<VisualPlanningVerificationDigestMaterialV1> {
  if (!isTrustedValidatedVisualPlanningSnapshotBundleV1(bundle)) {
    throw new Error('Visual Planning snapshot bundle is not runtime-certified.');
  }
  const trusted = trustedVisualPlanningBundles.get(bundle);
  if (!trusted) throw new Error('Visual Planning snapshot bundle authority is unavailable.');
  const spatialScenes = await Promise.all(trusted.verificationProjection.spatialScenes.map(async (scene): Promise<VisualPlanningVerificationDigestSceneV1> => {
    if (scene.coverage === 'analyzed') {
      return Object.freeze({
        sceneId: scene.sceneId,
        sceneIndex: scene.sceneIndex,
        coverage: 'analyzed',
        factualDigest: await sha256Hex(scene.analyzedFreshnessCanonical),
      });
    }
    return Object.freeze({ sceneId: scene.sceneId, sceneIndex: scene.sceneIndex, coverage: scene.coverage });
  }));
  return Object.freeze({
    semanticDigest: await sha256Hex(trusted.snapshot.semanticFingerprint),
    spatialScenes: Object.freeze(spatialScenes),
  });
}

/** Regenerates the complete snapshot from current facts and fails closed. */
export function isValidatedVisualPlanningSnapshotCurrent(
  snapshot: ValidatedVisualPlanningSnapshotV1,
  currentInput: CreateSpatialContinuityEvidenceReportInput,
): boolean {
  try {
    if (!snapshot || snapshot.version !== VALIDATED_VISUAL_PLANNING_SNAPSHOT_VERSION) return false;
    const current = createValidatedVisualPlanningSnapshot(currentInput);
    if (snapshot.projectId !== current.projectId
      || snapshot.semanticFingerprint !== current.semanticFingerprint) return false;
    const snapshotPayload = withoutFingerprint(snapshot);
    const currentPayload = withoutFingerprint(current);
    return snapshot.semanticFingerprint === fingerprint(snapshotPayload)
      && canonicalSerialize(snapshotPayload) === canonicalSerialize(currentPayload);
  } catch {
    return false;
  }
}

function frozenCoverage(coverage: SpatialContinuityCoverageV1): SpatialContinuityCoverageV1 {
  return Object.freeze({
    analyzedSceneIds: Object.freeze([...coverage.analyzedSceneIds]),
    unavailableSceneIds: Object.freeze([...coverage.unavailableSceneIds]),
    unsupportedSceneIds: Object.freeze([...coverage.unsupportedSceneIds]),
  });
}

function withoutFingerprint(snapshot: ValidatedVisualPlanningSnapshotV1): unknown {
  const { semanticFingerprint: _ignored, ...payload } = snapshot;
  return payload;
}

function fingerprint(payload: unknown): string {
  return `validated-visual-planning-v1:${canonicalSerialize(payload)}`;
}

function canonicalSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new Error('Visual planning snapshot semantic input is invalid.');
    return serialized;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalSerialize).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalSerialize(object[key])}`).join(',')}}`;
}

async function sha256Hex(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('SHA-256 is unavailable in this runtime.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
