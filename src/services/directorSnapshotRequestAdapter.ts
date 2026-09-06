import type { DirectorReport } from '@/core/director';
import { createManifestRevisionId, MANIFEST_FINGERPRINT_VERSION } from '@/core/editing';
import type { CreateMediaProjectInput, RenderManifest } from '@/core/media';
import {
  createValidatedVisualPlanningSnapshot,
  isValidatedVisualPlanningSnapshotCurrent,
  VALIDATED_VISUAL_PLANNING_SNAPSHOT_VERSION,
  type CreateSpatialContinuityEvidenceReportInput,
  type ValidatedVisualPlanningSnapshotSceneV1,
  type ValidatedVisualPlanningSnapshotV1,
} from '@/core/visual-intelligence';

export const DIRECTOR_VISUAL_ANALYSIS_REQUEST_VERSION = 1 as const;
export const DIRECTOR_MANIFEST_BINDING_VERSION = '1.0' as const;

export type DirectorAnalysisRejectionReason =
  | 'cancelled'
  | 'superseded'
  | 'project-changed'
  | 'source-unavailable'
  | 'manifest-stale'
  | 'visual-snapshot-stale'
  | 'unsupported-binding'
  | 'inconsistent-request';

export type DirectorAnalysisOutcome =
  | Readonly<{ status: 'accepted'; report: DirectorReport }>
  | Readonly<{ status: 'rejected'; reason: DirectorAnalysisRejectionReason }>;

export interface DirectorCurrentRequestSourceV1 {
  readonly projectId: string;
  readonly studioRecipeIdentity: string;
  readonly visualPlanningInput: CreateSpatialContinuityEvidenceReportInput;
}

export interface DirectorSnapshotRequestSourceV1 {
  readonly projectId: string;
  readonly buildInput: CreateMediaProjectInput;
  readonly studioRecipeIdentity: string;
  readonly snapshot: ValidatedVisualPlanningSnapshotV1;
  readonly readCurrentProjectId: () => string | null;
  readonly readCurrentSource: () => DirectorCurrentRequestSourceV1 | null;
}

/** Mount-local authority used only to make an obsolete Studio reader fail closed. */
export interface DirectorRequestSourceLifetimeV1 {
  readonly read: <T>(reader: () => T) => T | null;
  readonly activate: () => void;
  readonly invalidate: () => void;
}

export interface DirectorMediaStoreLeaseV1 {
  readonly startingMediaProjectId: string | null;
  readonly startingMediaManifestFingerprint: string | null;
}

export interface DirectorVisualAnalysisRequestV1 {
  readonly version: typeof DIRECTOR_VISUAL_ANALYSIS_REQUEST_VERSION;
  readonly requestId: number;
  readonly projectId: string;
  readonly manifestBinding: Readonly<{
    manifestBindingVersion: typeof DIRECTOR_MANIFEST_BINDING_VERSION;
    manifestFingerprintVersion: typeof MANIFEST_FINGERPRINT_VERSION;
    analyzedManifestFingerprint: string;
  }>;
  readonly visualPlanningBinding: Readonly<{
    snapshotVersion: typeof VALIDATED_VISUAL_PLANNING_SNAPSHOT_VERSION;
    semanticFingerprint: string;
  }>;
  readonly sourceBinding: Readonly<{
    studioRecipeIdentity: string;
    startingMediaProjectId: string | null;
    startingMediaManifestFingerprint: string | null;
  }>;
  readonly snapshot: ValidatedVisualPlanningSnapshotV1;
  readonly readCurrentProjectId: () => string | null;
  readonly readCurrentSource: () => DirectorCurrentRequestSourceV1 | null;
}

export type DirectorRequestValidation =
  | Readonly<{ accepted: true }>
  | Readonly<{ accepted: false; reason: DirectorAnalysisRejectionReason }>;

const ACCEPTED: DirectorRequestValidation = Object.freeze({ accepted: true });

export function createDirectorSnapshotRequestSourceV1(input: Readonly<{
  projectId: string;
  buildInput: CreateMediaProjectInput;
  studioRecipeIdentity: string;
  visualPlanningInput: CreateSpatialContinuityEvidenceReportInput;
  readCurrentProjectId: () => string | null;
  readCurrentSource: () => DirectorCurrentRequestSourceV1 | null;
}>): DirectorSnapshotRequestSourceV1 {
  const projectId = input.projectId.trim();
  if (!projectId || input.buildInput.projectId !== projectId) {
    throw new Error('Director request source project identity is invalid.');
  }
  if (!input.studioRecipeIdentity.trim()) throw new Error('Director request requires a canonical Studio Recipe identity.');
  if (!input.buildInput.productionRecipe
    || input.buildInput.productionRecipe.identity !== input.studioRecipeIdentity) {
    throw new Error('Director build input must be the compilation of the captured canonical Studio Recipe.');
  }
  const snapshot = createValidatedVisualPlanningSnapshot(input.visualPlanningInput);
  if (snapshot.projectId !== projectId) throw new Error('Director visual planning source project identity is invalid.');
  return Object.freeze({
    projectId,
    buildInput: input.buildInput,
    studioRecipeIdentity: input.studioRecipeIdentity,
    snapshot,
    readCurrentProjectId: input.readCurrentProjectId,
    readCurrentSource: input.readCurrentSource,
  });
}

export function createDirectorRequestSourceLifetimeV1(): DirectorRequestSourceLifetimeV1 {
  let active = true;
  return Object.freeze({
    read<T>(reader: () => T): T | null {
      return active ? reader() : null;
    },
    activate(): void { active = true; },
    invalidate(): void { active = false; },
  });
}

export function createDirectorVisualAnalysisRequestV1(
  requestId: number,
  source: DirectorSnapshotRequestSourceV1,
  manifest: RenderManifest,
  lease: DirectorMediaStoreLeaseV1,
): DirectorVisualAnalysisRequestV1 {
  if (!Number.isSafeInteger(requestId) || requestId < 1) throw new Error('Director request id is invalid.');
  if (manifest.metadata.productionRecipe?.identity !== source.studioRecipeIdentity) {
    throw new DirectorRequestConsistencyError('inconsistent-request');
  }
  assertDirectorManifestMatchesVisualSnapshotV1(manifest, source.snapshot);
  const request: DirectorVisualAnalysisRequestV1 = {
    version: DIRECTOR_VISUAL_ANALYSIS_REQUEST_VERSION,
    requestId,
    projectId: source.projectId,
    manifestBinding: Object.freeze({
      manifestBindingVersion: DIRECTOR_MANIFEST_BINDING_VERSION,
      manifestFingerprintVersion: MANIFEST_FINGERPRINT_VERSION,
      analyzedManifestFingerprint: createManifestRevisionId(manifest),
    }),
    visualPlanningBinding: Object.freeze({
      snapshotVersion: VALIDATED_VISUAL_PLANNING_SNAPSHOT_VERSION,
      semanticFingerprint: source.snapshot.semanticFingerprint,
    }),
    sourceBinding: Object.freeze({
      studioRecipeIdentity: source.studioRecipeIdentity,
      startingMediaProjectId: lease.startingMediaProjectId,
      startingMediaManifestFingerprint: lease.startingMediaManifestFingerprint,
    }),
    snapshot: source.snapshot,
    readCurrentProjectId: source.readCurrentProjectId,
    readCurrentSource: source.readCurrentSource,
  };
  return Object.freeze(request);
}

export function validateDirectorRequestSourceCurrentV1(
  source: Pick<DirectorSnapshotRequestSourceV1, 'projectId' | 'studioRecipeIdentity' | 'snapshot'>,
  current: DirectorCurrentRequestSourceV1,
): DirectorRequestValidation {
  if (current.projectId !== source.projectId) return rejected('project-changed');
  if (current.studioRecipeIdentity !== source.studioRecipeIdentity) return rejected('manifest-stale');
  if (source.snapshot.version !== VALIDATED_VISUAL_PLANNING_SNAPSHOT_VERSION) return rejected('unsupported-binding');
  return isValidatedVisualPlanningSnapshotCurrent(source.snapshot, current.visualPlanningInput)
    ? ACCEPTED
    : rejected('visual-snapshot-stale');
}

export function validateDirectorRequestCompletionV1(
  request: DirectorVisualAnalysisRequestV1,
  report: DirectorReport,
  currentManifest: RenderManifest | null,
): DirectorRequestValidation {
  if (!isSupportedRequest(request)) return rejected('unsupported-binding');
  let current: DirectorCurrentRequestSourceV1;
  try {
    const available = request.readCurrentSource();
    if (!available) return rejected('source-unavailable');
    current = available;
  } catch {
    return rejected('visual-snapshot-stale');
  }
  if (current.projectId !== request.projectId) return rejected('project-changed');
  if (current.studioRecipeIdentity !== request.sourceBinding.studioRecipeIdentity) return rejected('manifest-stale');
  if (!currentManifest || currentManifest.projectId !== request.projectId
    || createManifestRevisionId(currentManifest) !== request.manifestBinding.analyzedManifestFingerprint) {
    return rejected('manifest-stale');
  }
  if (report.projectId !== request.projectId
    || report.analyzedManifestFingerprint !== request.manifestBinding.analyzedManifestFingerprint
    || report.manifestBindingVersion !== request.manifestBinding.manifestBindingVersion
    || report.manifestFingerprintVersion !== request.manifestBinding.manifestFingerprintVersion) {
    return rejected('manifest-stale');
  }
  if (request.visualPlanningBinding.semanticFingerprint !== request.snapshot.semanticFingerprint
    || !isValidatedVisualPlanningSnapshotCurrent(request.snapshot, current.visualPlanningInput)) {
    return rejected('visual-snapshot-stale');
  }
  return ACCEPTED;
}

export function assertDirectorManifestMatchesVisualSnapshotV1(
  manifest: RenderManifest,
  snapshot: ValidatedVisualPlanningSnapshotV1,
): void {
  if (snapshot.version !== VALIDATED_VISUAL_PLANNING_SNAPSHOT_VERSION) {
    throw new DirectorRequestConsistencyError('unsupported-binding');
  }
  if (manifest.projectId !== snapshot.projectId) throw new DirectorRequestConsistencyError('inconsistent-request');
  const manifestScenes = manifest.timeline.scenes;
  const snapshotScenes = snapshot.canonical.orderedScenes;
  if (manifestScenes.length !== snapshotScenes.length) throw new DirectorRequestConsistencyError('inconsistent-request');
  for (let index = 0; index < snapshotScenes.length; index += 1) {
    const manifestScene = manifestScenes[index];
    const snapshotScene = snapshotScenes[index];
    const source = manifestScene.sourceScene;
    if (manifestScene.index !== snapshotScene.sceneIndex
      || source.sceneId !== snapshotScene.sceneId
      || Math.round(source.duration * 1_000) !== snapshotScene.durationMs
      || mediaKind(source) !== snapshotScene.mediaKind
      || durableMediaIdentity(source) !== snapshotScene.mediaIdentity
      || manifestScene.cameraMotion !== mappedMotion(snapshotScene)
      || manifestScene.transition.type !== mappedTransition(snapshotScene)) {
      throw new DirectorRequestConsistencyError('inconsistent-request');
    }
  }
}

export class DirectorRequestConsistencyError extends Error {
  constructor(readonly reason: Extract<DirectorAnalysisRejectionReason, 'inconsistent-request' | 'unsupported-binding'>) {
    super(reason === 'unsupported-binding'
      ? 'Director request contains an unsupported visual planning binding.'
      : 'Director manifest and visual planning snapshot describe different canonical source facts.');
    this.name = 'DirectorRequestConsistencyError';
  }
}

function isSupportedRequest(request: DirectorVisualAnalysisRequestV1): boolean {
  return request.version === DIRECTOR_VISUAL_ANALYSIS_REQUEST_VERSION
    && request.manifestBinding.manifestBindingVersion === DIRECTOR_MANIFEST_BINDING_VERSION
    && request.manifestBinding.manifestFingerprintVersion === MANIFEST_FINGERPRINT_VERSION
    && request.visualPlanningBinding.snapshotVersion === VALIDATED_VISUAL_PLANNING_SNAPSHOT_VERSION
    && request.snapshot.version === VALIDATED_VISUAL_PLANNING_SNAPSHOT_VERSION;
}

function mediaKind(scene: CreateMediaProjectInput['scenes'][number]): ValidatedVisualPlanningSnapshotSceneV1['mediaKind'] {
  if (scene.videoStorage || scene.videoUrl) return 'video';
  if (scene.imageStorage) return 'image';
  return 'none';
}

function durableMediaIdentity(scene: CreateMediaProjectInput['scenes'][number]): string | undefined {
  if (scene.videoStorage) return `media:${scene.videoStorage.objectPath}`;
  if (!scene.videoStorage && !scene.videoUrl && scene.imageStorage) return `media:${scene.imageStorage.objectPath}`;
  return undefined;
}

function mappedMotion(scene: ValidatedVisualPlanningSnapshotSceneV1): RenderManifest['timeline']['scenes'][number]['cameraMotion'] {
  switch (scene.effectiveMotion) {
    case 'static': return 'none';
    case 'kenburns': return 'ken_burns';
    case 'pan': return scene.sceneIndex % 2 === 0 ? 'pan_right' : 'pan_left';
    case 'zoom_in': return 'zoom_in';
    case 'zoom_out': return 'zoom_out';
  }
}

function mappedTransition(scene: ValidatedVisualPlanningSnapshotSceneV1): RenderManifest['timeline']['scenes'][number]['transition']['type'] {
  if (scene.sceneIndex === 0 || scene.incomingTransition === null || scene.incomingTransition === 'none') return 'cut';
  return 'crossfade';
}

function rejected(reason: DirectorAnalysisRejectionReason): DirectorRequestValidation {
  return Object.freeze({ accepted: false, reason });
}
