import { isCanonicalSceneId } from '@/lib/sceneIdentity';
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
  readonly response: VisualSpatialAnalysisResponse;
}

export function createVisualSpatialEvidenceRecord(binding: VisualSpatialEvidenceBinding, response: unknown): VisualSpatialEvidenceRecord {
  const normalizedBinding = normalizeBinding(binding);
  return Object.freeze({ version: VISUAL_SPATIAL_EVIDENCE_VERSION, binding: normalizedBinding, response: normalizeVisualSpatialAnalysisResponse(response) });
}

export function isVisualSpatialEvidenceRecordCurrent(record: VisualSpatialEvidenceRecord, expected: VisualSpatialEvidenceBinding): boolean {
  try {
    const normalized = normalizeBinding(expected);
    return record.version === VISUAL_SPATIAL_EVIDENCE_VERSION
      && record.binding.projectId === normalized.projectId
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
