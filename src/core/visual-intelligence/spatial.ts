import { isCanonicalSceneId } from '@/lib/sceneIdentity';
import {
  normalizeTrustedImageDisplayGeometry,
  type TrustedImageDisplayGeometryV1,
} from '@/core/media/imageDisplayGeometry';
import { normalizeVisualSpatialAnalysisResponse, type VisualSpatialAnalysisResponse } from './visualSpatialAnalysis';

export const VISUAL_SPATIAL_EVIDENCE_VERSION = 1 as const;
export type VisualSpatialEvidenceScope = 'applied-image' | 'discovery-candidate-image';

/** Session-only binding. It is correlation/staleness authority, never media authorization. */
export interface VisualSpatialEvidenceBinding {
  readonly projectId: string;
  readonly sceneId: string;
  readonly sceneIndex: number;
  readonly scope: VisualSpatialEvidenceScope;
  /** Durable owned object identity or provider/media identity; never a preview/delivery URL. */
  readonly mediaIdentity: string;
}

export interface VisualSpatialEvidenceRecord {
  readonly version: typeof VISUAL_SPATIAL_EVIDENCE_VERSION;
  readonly binding: VisualSpatialEvidenceBinding;
  /** Exact immutable pixels described by applied-image evidence; never execution authority. */
  readonly source?: VisualSpatialEvidenceSourceProvenance;
  readonly response: VisualSpatialAnalysisResponse;
}

export interface VisualSpatialEvidenceSourceProvenance {
  readonly mediaIdentity: string;
  readonly contentDigest: string;
  readonly encodedDimensions: Readonly<{ width: number; height: number }>;
}

export function visualSpatialEvidenceSourceFromTrustedGeometry(
  geometryValue: unknown,
  expectedMediaIdentity: string,
  now?: number,
): VisualSpatialEvidenceSourceProvenance {
  const geometry = normalizeTrustedImageDisplayGeometry(geometryValue, expectedMediaIdentity, now);
  return sourceFromGeometry(geometry);
}

export function visualSpatialEvidenceSourceEqual(
  left: VisualSpatialEvidenceSourceProvenance,
  right: VisualSpatialEvidenceSourceProvenance,
): boolean {
  try {
    const a = normalizeSource(left);
    const b = normalizeSource(right);
    return a.mediaIdentity === b.mediaIdentity
      && a.contentDigest === b.contentDigest
      && a.encodedDimensions.width === b.encodedDimensions.width
      && a.encodedDimensions.height === b.encodedDimensions.height;
  } catch { return false; }
}

export function createVisualSpatialEvidenceRecord(
  binding: VisualSpatialEvidenceBinding,
  response: unknown,
  appliedSource?: VisualSpatialEvidenceSourceProvenance,
): VisualSpatialEvidenceRecord {
  const normalizedBinding = normalizeBinding(binding);
  const normalizedResponse = normalizeVisualSpatialAnalysisResponse(response);
  if (normalizedBinding.scope === 'applied-image') {
    const source = normalizeSource(appliedSource, normalizedBinding.mediaIdentity);
    if (normalizedResponse.status === 'evaluated'
      && (normalizedResponse.sourceDimensions.width !== source.encodedDimensions.width
        || normalizedResponse.sourceDimensions.height !== source.encodedDimensions.height)) {
      throw new Error('Visual spatial evidence source dimensions are stale.');
    }
    return Object.freeze({ version: VISUAL_SPATIAL_EVIDENCE_VERSION, binding: normalizedBinding, source, response: normalizedResponse });
  }
  if (appliedSource !== undefined) throw new Error('Candidate spatial evidence cannot carry canonical image provenance.');
  return Object.freeze({ version: VISUAL_SPATIAL_EVIDENCE_VERSION, binding: normalizedBinding, response: normalizedResponse });
}

export function normalizeVisualSpatialEvidenceRecord(value: unknown): VisualSpatialEvidenceRecord {
  const source = strictObject(value, ['version', 'binding', 'source', 'response']);
  if (source.version !== VISUAL_SPATIAL_EVIDENCE_VERSION) throw new Error('Visual spatial evidence record is invalid.');
  const binding = normalizeBinding(source.binding as VisualSpatialEvidenceBinding);
  const response = normalizeVisualSpatialAnalysisResponse(source.response);
  if (binding.scope === 'applied-image') {
    return createVisualSpatialEvidenceRecord(binding, response, normalizeSource(source.source, binding.mediaIdentity));
  }
  if (Object.prototype.hasOwnProperty.call(source, 'source')) throw new Error('Candidate spatial evidence cannot carry canonical image provenance.');
  return createVisualSpatialEvidenceRecord(binding, response);
}

export function isVisualSpatialEvidenceRecordCurrent(
  recordValue: VisualSpatialEvidenceRecord,
  expected: VisualSpatialEvidenceBinding,
  currentAppliedSource?: VisualSpatialEvidenceSourceProvenance,
): boolean {
  try {
    const record = normalizeVisualSpatialEvidenceRecord(recordValue);
    const normalized = normalizeBinding(expected);
    const bindingCurrent = record.version === VISUAL_SPATIAL_EVIDENCE_VERSION
      && record.binding.projectId === normalized.projectId
      && record.binding.sceneId === normalized.sceneId
      && record.binding.sceneIndex === normalized.sceneIndex
      && record.binding.scope === normalized.scope
      && record.binding.mediaIdentity === normalized.mediaIdentity;
    if (!bindingCurrent) return false;
    if (normalized.scope === 'applied-image') {
      return record.source !== undefined && currentAppliedSource !== undefined
        && visualSpatialEvidenceSourceEqual(record.source, normalizeSource(currentAppliedSource, normalized.mediaIdentity));
    }
    return currentAppliedSource === undefined && record.source === undefined;
  } catch { return false; }
}

/** Binding-only lifecycle check used to retain temporarily unavailable session evidence across capability refresh. */
export function isVisualSpatialEvidenceRecordBoundTo(
  recordValue: VisualSpatialEvidenceRecord,
  expected: VisualSpatialEvidenceBinding,
): boolean {
  try {
    const record = normalizeVisualSpatialEvidenceRecord(recordValue);
    const normalized = normalizeBinding(expected);
    return record.binding.projectId === normalized.projectId
      && record.binding.sceneId === normalized.sceneId
      && record.binding.sceneIndex === normalized.sceneIndex
      && record.binding.scope === normalized.scope
      && record.binding.mediaIdentity === normalized.mediaIdentity;
  } catch { return false; }
}

function normalizeBinding(value: VisualSpatialEvidenceBinding): VisualSpatialEvidenceBinding {
  const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype
    || Object.keys(value).length !== 5 || Object.keys(value).some((key) => !['projectId', 'sceneId', 'sceneIndex', 'scope', 'mediaIdentity'].includes(key))
    || typeof value.projectId !== 'string' || !/^[A-Za-z0-9._:-]{1,160}$/u.test(value.projectId)
    || !isCanonicalSceneId(value.sceneId) || !Number.isSafeInteger(value.sceneIndex) || value.sceneIndex < 0
    || (value.scope !== 'applied-image' && value.scope !== 'discovery-candidate-image')
    || typeof value.mediaIdentity !== 'string' || value.mediaIdentity.length < 1 || value.mediaIdentity.length > 320) throw new Error('Visual spatial evidence binding is invalid.');
  const validAppliedIdentity = new RegExp(`^media:${uuid}/generated-images/${uuid}\\.(?:png|jpg)$`, 'u').test(value.mediaIdentity);
  const candidateMatch = /^pexels:image:([1-9]\d{0,9})$/u.exec(value.mediaIdentity);
  const validCandidateIdentity = Boolean(candidateMatch && Number(candidateMatch[1]) <= 2_147_483_647);
  if ((value.scope === 'applied-image' && !validAppliedIdentity)
    || (value.scope === 'discovery-candidate-image' && !validCandidateIdentity)) throw new Error('Visual spatial evidence binding is invalid.');
  return Object.freeze({ projectId: value.projectId, sceneId: value.sceneId, sceneIndex: value.sceneIndex, scope: value.scope, mediaIdentity: value.mediaIdentity });
}

function sourceFromGeometry(geometry: TrustedImageDisplayGeometryV1): VisualSpatialEvidenceSourceProvenance {
  return Object.freeze({
    mediaIdentity: geometry.mediaIdentity,
    contentDigest: geometry.contentDigest,
    encodedDimensions: Object.freeze({ ...geometry.encodedDimensions }),
  });
}

function normalizeSource(value: unknown, expectedMediaIdentity?: string): VisualSpatialEvidenceSourceProvenance {
  const source = strictObject(value, ['mediaIdentity', 'contentDigest', 'encodedDimensions']);
  const encoded = strictObject(source.encodedDimensions, ['width', 'height']);
  if (typeof source.mediaIdentity !== 'string' || source.mediaIdentity !== expectedMediaIdentity && expectedMediaIdentity !== undefined
    || typeof source.contentDigest !== 'string' || !/^[0-9a-f]{64}$/u.test(source.contentDigest)
    || !Number.isSafeInteger(encoded.width) || Number(encoded.width) <= 0
    || !Number.isSafeInteger(encoded.height) || Number(encoded.height) <= 0) {
    throw new Error('Visual spatial evidence source provenance is invalid.');
  }
  return Object.freeze({
    mediaIdentity: source.mediaIdentity,
    contentDigest: source.contentDigest,
    encodedDimensions: Object.freeze({ width: Number(encoded.width), height: Number(encoded.height) }),
  });
}

function strictObject(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error('Visual spatial evidence record is invalid.');
  }
  const source = value as Record<string, unknown>;
  if (Object.keys(source).some((key) => !allowed.includes(key))
    || allowed.filter((key) => key !== 'source').some((key) => !Object.prototype.hasOwnProperty.call(source, key))) {
    throw new Error('Visual spatial evidence record is invalid.');
  }
  return source;
}
