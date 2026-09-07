import { createManifestRevisionId, MANIFEST_FINGERPRINT_VERSION } from '@/core/editing';
import type { RenderManifest } from '@/core/media';
import {
  createTrustedVisualPlanningVerificationDigestMaterialV1,
  isTrustedValidatedVisualPlanningSnapshotBundleV1,
  type ValidatedVisualPlanningSnapshotBundleV1,
} from '@/core/visual-intelligence';
import type {
  DirectorReport,
  DirectorSpatialSceneBindingV1,
  DirectorVisualPlanningBindingV1,
  LegacyDirectorReportV2,
  VisualBoundDirectorReportV2_1,
} from './types';

export const DIRECTOR_VISUAL_PLANNING_BINDING_VERSION = 1 as const;
export const DIRECTOR_VISUAL_PLANNING_DIGEST_ALGORITHM = 'SHA-256' as const;
export const DIRECTOR_REPORT_MANIFEST_BINDING_VERSION = '1.0' as const;

export type DirectorReportManifestCurrentnessV1 = 'current' | 'stale' | 'unverified' | 'unsupported';
export type DirectorReportVisualCurrentnessV1 = 'current' | 'stale' | 'unverified' | 'legacy-unbound' | 'unsupported';

export interface DirectorReportCurrentnessV1 {
  readonly manifest: DirectorReportManifestCurrentnessV1;
  readonly visual: DirectorReportVisualCurrentnessV1;
  readonly fullyCurrent: boolean;
}

export interface ClassifyDirectorReportCurrentnessV1Input {
  readonly report: unknown;
  readonly currentManifest?: RenderManifest | null;
  readonly currentVisualPlanning?: ValidatedVisualPlanningSnapshotBundleV1 | null;
}

/** Derives compact durable provenance from the exact same-boundary session bundle. */
export async function createDirectorVisualPlanningBindingV1(
  bundle: ValidatedVisualPlanningSnapshotBundleV1,
): Promise<DirectorVisualPlanningBindingV1> {
  if (!isTrustedValidatedVisualPlanningSnapshotBundleV1(bundle)) {
    throw new Error('Director Visual Planning verification bundle is malformed or unsupported.');
  }
  const digestMaterial = await createTrustedVisualPlanningVerificationDigestMaterialV1(bundle);
  const spatialScenes = digestMaterial.spatialScenes.map((scene): DirectorSpatialSceneBindingV1 => {
    if (scene.coverage === 'analyzed') {
      return Object.freeze({
        sceneId: scene.sceneId,
        sceneIndex: scene.sceneIndex,
        coverage: 'analyzed',
        factualDigest: scene.factualDigest,
      });
    }
    return Object.freeze({ sceneId: scene.sceneId, sceneIndex: scene.sceneIndex, coverage: scene.coverage });
  });
  return Object.freeze({
    version: DIRECTOR_VISUAL_PLANNING_BINDING_VERSION,
    snapshotVersion: 1,
    digestAlgorithm: DIRECTOR_VISUAL_PLANNING_DIGEST_ALGORITHM,
    semanticDigest: digestMaterial.semanticDigest,
    spatialScenes: Object.freeze(spatialScenes),
  });
}

/** Creates a new report object; the deterministic engine's legacy result is never mutated. */
export function bindDirectorReportV2_1(
  report: LegacyDirectorReportV2,
  visualPlanningBinding: DirectorVisualPlanningBindingV1,
): VisualBoundDirectorReportV2_1 {
  if (!isLegacyDirectorReportV2(report) || !isDirectorVisualPlanningBindingV1(visualPlanningBinding, report.sceneScores)) {
    throw new Error('Director report cannot be bound to malformed Visual Planning provenance.');
  }
  const { reportVersion: _legacyVersion, ...payload } = report;
  return Object.freeze({
    ...payload,
    reportVersion: '2.1' as const,
    visualPlanningBinding,
  });
}

export async function classifyDirectorReportCurrentnessV1(
  input: ClassifyDirectorReportCurrentnessV1Input,
): Promise<DirectorReportCurrentnessV1> {
  const manifest = classifyManifest(input.report, input.currentManifest);
  const visual = await classifyVisual(input.report, input.currentVisualPlanning);
  return Object.freeze({ manifest, visual, fullyCurrent: manifest === 'current' && visual === 'current' });
}

export function isSupportedDirectorReport(value: unknown): value is DirectorReport {
  return isLegacyDirectorReportV2(value) || isVisualBoundDirectorReportV2_1(value);
}

export function isLegacyDirectorReportV2(value: unknown): value is LegacyDirectorReportV2 {
  return isDirectorReportPayload(value)
    && value.reportVersion === '2.0'
    && !Object.prototype.hasOwnProperty.call(value, 'visualPlanningBinding');
}

export function isVisualBoundDirectorReportV2_1(value: unknown): value is VisualBoundDirectorReportV2_1 {
  return isDirectorReportPayload(value)
    && value.reportVersion === '2.1'
    && isDirectorVisualPlanningBindingV1(value.visualPlanningBinding, value.sceneScores);
}

export function isDirectorVisualPlanningBindingV1(
  value: unknown,
  reportScenes?: readonly unknown[],
): value is DirectorVisualPlanningBindingV1 {
  if (!isRecord(value)
    || !hasExactKeys(value, ['version', 'snapshotVersion', 'digestAlgorithm', 'semanticDigest', 'spatialScenes'])
    || value.version !== DIRECTOR_VISUAL_PLANNING_BINDING_VERSION
    || value.snapshotVersion !== 1
    || value.digestAlgorithm !== DIRECTOR_VISUAL_PLANNING_DIGEST_ALGORITHM
    || !isHex64(value.semanticDigest)
    || !Array.isArray(value.spatialScenes)
    || (reportScenes !== undefined && value.spatialScenes.length !== reportScenes.length)) return false;
  const seen = new Set<string>();
  for (let index = 0; index < value.spatialScenes.length; index += 1) {
    const scene = value.spatialScenes[index];
    if (!isRecord(scene) || typeof scene.sceneId !== 'string' || !scene.sceneId.trim()
      || scene.sceneIndex !== index || seen.has(scene.sceneId)) return false;
    seen.add(scene.sceneId);
    if (reportScenes) {
      const reportScene = reportScenes[index];
      if (!isRecord(reportScene) || reportScene.sceneId !== scene.sceneId || reportScene.sceneIndex !== index) return false;
    }
    if (scene.coverage === 'analyzed') {
      if (!hasExactKeys(scene, ['sceneId', 'sceneIndex', 'coverage', 'factualDigest']) || !isHex64(scene.factualDigest)) return false;
    } else if (scene.coverage === 'unavailable' || scene.coverage === 'unsupported') {
      if (!hasExactKeys(scene, ['sceneId', 'sceneIndex', 'coverage'])) return false;
    } else return false;
  }
  return true;
}

async function classifyVisual(
  report: unknown,
  current: ValidatedVisualPlanningSnapshotBundleV1 | null | undefined,
): Promise<DirectorReportVisualCurrentnessV1> {
  if (isLegacyDirectorReportV2(report)) return 'legacy-unbound';
  if (!isVisualBoundDirectorReportV2_1(report)) return 'unsupported';
  if (current === undefined || current === null) return 'unverified';
  if (!isTrustedValidatedVisualPlanningSnapshotBundleV1(current)) return 'unsupported';
  if (current.snapshot.projectId !== report.projectId) return 'stale';
  let currentBinding: DirectorVisualPlanningBindingV1;
  try {
    currentBinding = await createDirectorVisualPlanningBindingV1(current);
  } catch {
    return 'unsupported';
  }
  const boundScenes = report.visualPlanningBinding.spatialScenes;
  const currentScenes = currentBinding.spatialScenes;
  if (boundScenes.length !== currentScenes.length) return 'stale';
  for (let index = 0; index < boundScenes.length; index += 1) {
    if (boundScenes[index].sceneId !== currentScenes[index].sceneId
      || boundScenes[index].sceneIndex !== currentScenes[index].sceneIndex) return 'stale';
  }
  if (currentBinding.semanticDigest === report.visualPlanningBinding.semanticDigest) return 'current';

  let staleFound = false;
  let missingFound = false;
  for (let index = 0; index < boundScenes.length; index += 1) {
    const requested = boundScenes[index];
    const available = currentScenes[index];
    if (requested.coverage === 'analyzed') {
      if (available.coverage === 'analyzed') staleFound ||= requested.factualDigest !== available.factualDigest;
      else if (available.coverage === 'unavailable') missingFound = true;
      else staleFound = true;
    } else if (requested.coverage !== available.coverage) {
      staleFound = true;
    }
  }
  if (staleFound) return 'stale';
  if (missingFound) return 'unverified';
  return 'current';
}

function classifyManifest(report: unknown, current: RenderManifest | null | undefined): DirectorReportManifestCurrentnessV1 {
  if (!isSupportedDirectorReport(report)) return 'unsupported';
  if (current === undefined || current === null) return 'unverified';
  if (report.manifestBindingVersion !== DIRECTOR_REPORT_MANIFEST_BINDING_VERSION
    || report.manifestFingerprintVersion !== MANIFEST_FINGERPRINT_VERSION
    || typeof report.analyzedManifestFingerprint !== 'string' || !report.analyzedManifestFingerprint) return 'unsupported';
  return report.projectId === current.projectId
    && report.analyzedManifestFingerprint === createManifestRevisionId(current)
    ? 'current'
    : 'stale';
}

function isDirectorReportPayload(value: unknown): value is Record<string, unknown> & {
  projectId: string;
  generatedAt: string;
  overallScore: number;
  sceneScores: readonly unknown[];
} {
  return isRecord(value)
    && typeof value.projectId === 'string' && !!value.projectId.trim()
    && typeof value.generatedAt === 'string'
    && typeof value.overallScore === 'number' && Number.isFinite(value.overallScore)
    && Array.isArray(value.sceneScores)
    && value.sceneScores.every((scene, index) => isRecord(scene)
      && typeof scene.sceneId === 'string' && !!scene.sceneId.trim()
      && scene.sceneIndex === index);
}

function isHex64(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const keys = [...expected].sort();
  return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
}
