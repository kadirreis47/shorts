import { resolveEffectiveSceneComposition, type SceneCompositionDefaults } from '@/core/media/sceneComposition';
import type { ImageFramingCropWindow } from '@/core/media/imageFraming';
import type { Scene, SceneCompositionMotion, SceneCompositionTransition } from '@/lib/types';
import type {
  SpatialContinuityEvidenceReportV1,
  SpatialContinuityFindingKind,
  SpatialContinuityFocalZone,
} from './spatialContinuity';

export const VISUAL_RHYTHM_EVIDENCE_VERSION = 1 as const;
/** A neutral structural cadence observation, shared with the existing Director pace heuristic. */
export const DURATION_CADENCE_MAX_DELTA_MS = 250;

export type VisualRhythmMediaKind = 'image' | 'video' | 'none';
export type VisualRhythmRunKind =
  | 'effective-motion'
  | 'incoming-transition'
  | 'media-kind'
  | 'media-identity'
  | 'focal-zone'
  | 'exact-crop'
  | 'duration-cadence';
export type VisualRhythmFindingKind =
  | 'repeated-effective-motion-run'
  | 'repeated-incoming-transition-run'
  | 'repeated-media-kind-run'
  | 'repeated-media-identity-run'
  | 'repeated-focal-zone-run'
  | 'exact-crop-run'
  | 'duration-cadence-run';

export interface VisualRhythmEvidenceReportV1 {
  readonly version: typeof VISUAL_RHYTHM_EVIDENCE_VERSION;
  readonly projectId: string;
  readonly freshnessFingerprint: string;
  readonly coverage: Readonly<{
    structuralSceneIds: readonly string[];
    spatialAnalyzedSceneIds: readonly string[];
    spatialUnavailableSceneIds: readonly string[];
    spatialUnsupportedSceneIds: readonly string[];
  }>;
  readonly sceneSignatures: readonly VisualRhythmSceneSignatureV1[];
  readonly boundaries: readonly VisualRhythmBoundaryV1[];
  readonly runs: readonly VisualRhythmRunV1[];
  readonly findings: readonly VisualRhythmFindingV1[];
}

export interface VisualRhythmSceneSignatureV1 {
  readonly sceneId: string;
  readonly sceneIndex: number;
  readonly durationMs: number;
  readonly mediaKind: VisualRhythmMediaKind;
  readonly mediaIdentity?: string;
  /** Canonical render intent, never measured source-camera motion. */
  readonly effectiveMotion: SceneCompositionMotion;
  /** Scene zero has no incoming project boundary. */
  readonly incomingTransition: SceneCompositionTransition | null;
  readonly spatial?: Readonly<{
    crop: ImageFramingCropWindow;
    focalZone?: SpatialContinuityFocalZone;
    subjectOccupancyRatio?: number;
  }>;
}

export interface VisualRhythmBoundaryV1 {
  readonly fromSceneId: string;
  readonly fromSceneIndex: number;
  readonly toSceneId: string;
  readonly toSceneIndex: number;
  readonly durationDeltaMs: number;
  readonly sameKnownMediaIdentity: boolean;
  readonly repeatedEffectiveMotion: boolean;
  /** True only when this and the preceding actual incoming boundary share a transition. */
  readonly repeatedIncomingTransition: boolean;
  readonly spatialAvailability: 'compared' | 'insufficient-spatial-evidence';
  readonly spatialFindings: readonly SpatialContinuityFindingKind[];
}

export interface VisualRhythmRunV1 {
  readonly key: string;
  readonly kind: VisualRhythmRunKind;
  readonly sceneIds: readonly string[];
  /** Empty only for scene-based runs with no actual incoming boundary. */
  readonly boundaryKeys: readonly string[];
}

export interface VisualRhythmFindingV1 {
  readonly kind: VisualRhythmFindingKind;
  readonly runKey: string;
  readonly sceneIds: readonly string[];
  readonly boundaryKeys: readonly string[];
}

export interface CreateVisualRhythmEvidenceReportInput {
  readonly projectId: string;
  readonly scenes: readonly Scene[];
  readonly compositionDefaults: SceneCompositionDefaults;
  /** Current factual continuity report; this evaluator never re-evaluates spatial inputs. */
  readonly spatialContinuityReport: SpatialContinuityEvidenceReportV1;
}

const RUN_KIND_ORDER: readonly VisualRhythmRunKind[] = Object.freeze([
  'effective-motion', 'incoming-transition', 'media-kind', 'media-identity',
  'focal-zone', 'exact-crop', 'duration-cadence',
]);

/**
 * Pure, session-only project rhythm evidence. It aggregates canonical structural
 * state and existing Spatial Continuity facts without making any judgment or
 * owning mutation authority.
 */
export function createVisualRhythmEvidenceReport(
  input: CreateVisualRhythmEvidenceReportInput,
): VisualRhythmEvidenceReportV1 {
  const signatures = Object.freeze(input.scenes.map((scene, sceneIndex) => sceneSignature(input, scene, sceneIndex)));
  const boundaries = Object.freeze(signatures.slice(1).map((current, index) => boundaryFor(
    signatures[index], current, input.spatialContinuityReport,
  )));
  const runs = Object.freeze(orderedRuns(signatures, boundaries));
  const findings = Object.freeze(runs.map(findingFor));
  const coverage = Object.freeze({
    structuralSceneIds: Object.freeze(signatures.map((signature) => signature.sceneId)),
    spatialAnalyzedSceneIds: Object.freeze([...input.spatialContinuityReport.coverage.analyzedSceneIds]),
    spatialUnavailableSceneIds: Object.freeze([...input.spatialContinuityReport.coverage.unavailableSceneIds]),
    spatialUnsupportedSceneIds: Object.freeze([...input.spatialContinuityReport.coverage.unsupportedSceneIds]),
  });
  const freshnessFingerprint = `visual-rhythm-v1:${canonicalSerialize({
    version: VISUAL_RHYTHM_EVIDENCE_VERSION,
    projectId: input.projectId,
    scenes: signatures.map((signature) => ({
      sceneId: signature.sceneId, sceneIndex: signature.sceneIndex, durationMs: signature.durationMs,
      mediaKind: signature.mediaKind, mediaIdentity: signature.mediaIdentity ?? null,
      effectiveMotion: signature.effectiveMotion, incomingTransition: signature.incomingTransition,
    })),
    spatialContinuityFingerprint: input.spatialContinuityReport.freshnessFingerprint,
  })}`;
  return Object.freeze({ version: VISUAL_RHYTHM_EVIDENCE_VERSION, projectId: input.projectId, freshnessFingerprint, coverage, sceneSignatures: signatures, boundaries, runs, findings });
}

function sceneSignature(
  input: CreateVisualRhythmEvidenceReportInput,
  scene: Scene,
  sceneIndex: number,
): VisualRhythmSceneSignatureV1 {
  const effective = resolveEffectiveSceneComposition(input.compositionDefaults, scene.compositionOverride, sceneIndex);
  const media = mediaFor(scene);
  const spatial = input.spatialContinuityReport.sceneSignatures.find((candidate) =>
    candidate.sceneId === scene.sceneId && candidate.sceneIndex === sceneIndex);
  return Object.freeze({
    sceneId: scene.sceneId,
    sceneIndex,
    durationMs: durationMs(scene.duration),
    mediaKind: media.kind,
    ...(media.identity ? { mediaIdentity: media.identity } : {}),
    effectiveMotion: effective.motion,
    incomingTransition: sceneIndex === 0 ? null : effective.transition,
    ...(spatial ? { spatial: Object.freeze({
      crop: Object.freeze({ ...spatial.crop }),
      ...(spatial.focalZone ? { focalZone: spatial.focalZone } : {}),
      ...(spatial.subjectOccupancyRatio !== undefined ? { subjectOccupancyRatio: spatial.subjectOccupancyRatio } : {}),
    }) } : {}),
  });
}

function mediaFor(scene: Scene): Readonly<{ kind: VisualRhythmMediaKind; identity?: string }> {
  if (scene.videoStorage || scene.videoUrl) return Object.freeze({ kind: 'video', ...(scene.videoStorage ? { identity: `media:${scene.videoStorage.objectPath}` } : {}) });
  if (scene.imageStorage) return Object.freeze({ kind: 'image', identity: `media:${scene.imageStorage.objectPath}` });
  return Object.freeze({ kind: 'none' });
}

function boundaryFor(
  previous: VisualRhythmSceneSignatureV1,
  current: VisualRhythmSceneSignatureV1,
  report: SpatialContinuityEvidenceReportV1,
): VisualRhythmBoundaryV1 {
  const spatial = report.boundaries.find((boundary) => boundary.fromSceneId === previous.sceneId
    && boundary.fromSceneIndex === previous.sceneIndex
    && boundary.toSceneId === current.sceneId
    && boundary.toSceneIndex === current.sceneIndex);
  return Object.freeze({
    fromSceneId: previous.sceneId,
    fromSceneIndex: previous.sceneIndex,
    toSceneId: current.sceneId,
    toSceneIndex: current.sceneIndex,
    durationDeltaMs: Math.abs(current.durationMs - previous.durationMs),
    sameKnownMediaIdentity: previous.mediaIdentity !== undefined && previous.mediaIdentity === current.mediaIdentity,
    repeatedEffectiveMotion: previous.effectiveMotion === current.effectiveMotion,
    repeatedIncomingTransition: current.sceneIndex > 1 && previous.incomingTransition !== null
      && current.incomingTransition !== null && previous.incomingTransition === current.incomingTransition,
    spatialAvailability: spatial?.availability ?? 'insufficient-spatial-evidence',
    spatialFindings: Object.freeze([...(spatial?.findings ?? ['insufficient-spatial-evidence'])]),
  });
}

function orderedRuns(
  signatures: readonly VisualRhythmSceneSignatureV1[],
  boundaries: readonly VisualRhythmBoundaryV1[],
): VisualRhythmRunV1[] {
  const runs = [
    ...sceneValueRuns('effective-motion', signatures, (signature) => signature.effectiveMotion),
    ...transitionRuns(signatures, boundaries),
    ...sceneValueRuns('media-kind', signatures, (signature) => signature.mediaKind),
    ...sceneValueRuns('media-identity', signatures, (signature) => signature.mediaIdentity),
    ...sceneValueRuns('focal-zone', signatures, (signature) => signature.spatial?.focalZone),
    ...sceneValueRuns('exact-crop', signatures, (signature) => signature.spatial ? canonicalSerialize(signature.spatial.crop) : undefined),
    ...durationCadenceRuns(signatures, boundaries),
  ];
  return runs.sort((left, right) => startIndex(left, signatures) - startIndex(right, signatures)
    || RUN_KIND_ORDER.indexOf(left.kind) - RUN_KIND_ORDER.indexOf(right.kind)
    || left.key.localeCompare(right.key));
}

function sceneValueRuns(
  kind: Exclude<VisualRhythmRunKind, 'incoming-transition' | 'duration-cadence'>,
  signatures: readonly VisualRhythmSceneSignatureV1[],
  valueFor: (signature: VisualRhythmSceneSignatureV1) => string | undefined,
): VisualRhythmRunV1[] {
  const runs: VisualRhythmRunV1[] = [];
  let index = 0;
  while (index < signatures.length) {
    const value = valueFor(signatures[index]);
    if (value === undefined) { index += 1; continue; }
    let end = index + 1;
    while (end < signatures.length && valueFor(signatures[end]) === value) end += 1;
    if (end - index >= 2) runs.push(run(kind, signatures.slice(index, end).map((signature) => signature.sceneId), boundaryKeysFor(signatures.slice(index, end))));
    index = end;
  }
  return runs;
}

function transitionRuns(
  signatures: readonly VisualRhythmSceneSignatureV1[],
  boundaries: readonly VisualRhythmBoundaryV1[],
): VisualRhythmRunV1[] {
  const runs: VisualRhythmRunV1[] = [];
  let index = 0;
  while (index < boundaries.length) {
    const value = signatures[index + 1]?.incomingTransition;
    if (value === null || value === undefined) { index += 1; continue; }
    let end = index + 1;
    while (end < boundaries.length && signatures[end + 1]?.incomingTransition === value) end += 1;
    if (end - index >= 2) runs.push(run('incoming-transition', signatures.slice(index, end + 1).map((signature) => signature.sceneId), boundaries.slice(index, end).map(boundaryKey)));
    index = end;
  }
  return runs;
}

function durationCadenceRuns(
  signatures: readonly VisualRhythmSceneSignatureV1[],
  boundaries: readonly VisualRhythmBoundaryV1[],
): VisualRhythmRunV1[] {
  const runs: VisualRhythmRunV1[] = [];
  let start = 0;
  for (let index = 0; index < boundaries.length; index += 1) {
    if (boundaries[index].durationDeltaMs <= DURATION_CADENCE_MAX_DELTA_MS) continue;
    if (index - start + 1 >= 3) runs.push(run('duration-cadence', signatures.slice(start, index + 1).map((signature) => signature.sceneId), boundaries.slice(start, index).map(boundaryKey)));
    start = index + 1;
  }
  if (signatures.length - start >= 3) runs.push(run('duration-cadence', signatures.slice(start).map((signature) => signature.sceneId), boundaries.slice(start).map(boundaryKey)));
  return runs;
}

function run(kind: VisualRhythmRunKind, sceneIds: readonly string[], boundaryKeys: readonly string[]): VisualRhythmRunV1 {
  const frozenSceneIds = Object.freeze([...sceneIds]);
  const frozenBoundaryKeys = Object.freeze([...boundaryKeys]);
  return Object.freeze({
    key: `visual-rhythm-run-v1:${canonicalSerialize({ kind, sceneIds: frozenSceneIds, boundaryKeys: frozenBoundaryKeys })}`,
    kind,
    sceneIds: frozenSceneIds,
    boundaryKeys: frozenBoundaryKeys,
  });
}

function findingFor(value: VisualRhythmRunV1): VisualRhythmFindingV1 {
  const findingKinds: Readonly<Record<VisualRhythmRunKind, VisualRhythmFindingKind>> = {
    'effective-motion': 'repeated-effective-motion-run',
    'incoming-transition': 'repeated-incoming-transition-run',
    'media-kind': 'repeated-media-kind-run',
    'media-identity': 'repeated-media-identity-run',
    'focal-zone': 'repeated-focal-zone-run',
    'exact-crop': 'exact-crop-run',
    'duration-cadence': 'duration-cadence-run',
  };
  const kind = findingKinds[value.kind];
  return Object.freeze({ kind, runKey: value.key, sceneIds: value.sceneIds, boundaryKeys: value.boundaryKeys });
}

function boundaryKeysFor(signatures: readonly VisualRhythmSceneSignatureV1[]): readonly string[] {
  return Object.freeze(signatures.slice(1).map((signature, index) => `${signatures[index].sceneId}:${signature.sceneId}`));
}

function boundaryKey(boundary: VisualRhythmBoundaryV1): string {
  return `${boundary.fromSceneId}:${boundary.toSceneId}`;
}

function startIndex(runValue: VisualRhythmRunV1, signatures: readonly VisualRhythmSceneSignatureV1[]): number {
  return signatures.findIndex((signature) => signature.sceneId === runValue.sceneIds[0]);
}

function durationMs(value: number): number {
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 1_000) : 0;
}

/** Full canonical serialization is collision-safe; no truncated/hash identity is used. */
function canonicalSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new Error('Visual rhythm semantic input is invalid.');
    return serialized;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalSerialize).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalSerialize(object[key])}`).join(',')}}`;
}
