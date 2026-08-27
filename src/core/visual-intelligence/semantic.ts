import type { VisualMediaPreference } from './types';

/** Strict, provider-neutral semantic contract. Slice 6 has no media-capable provider adapter. */
export const VISUAL_SEMANTIC_VERSION = 1 as const;
export type VisualSemanticDimension = 'subject' | 'setting' | 'location' | 'era' | 'action' | 'mood' | 'lighting' | 'visual-role' | 'composition' | 'realism-style' | 'text-logo' | 'continuity';
export type VisualSemanticSignalState = 'evaluated' | 'unsupported' | 'unavailable';
export type VisualSemanticInterpretation = 'match' | 'mismatch' | 'uncertain';
export type VisualSemanticConfidenceBand = 'low' | 'medium' | 'high';
export type VisualSemanticObservation = 'provider-observed-match' | 'provider-observed-mismatch' | 'provider-observed-uncertain';
export type VisualSemanticUnavailableReason = 'no-media-reference' | 'provider-unavailable' | 'provider-failure' | 'invalid-provider-result';

export interface VisualSemanticCandidateBinding {
  readonly candidateId: string;
  readonly provider: string;
  readonly providerMediaIdentity: string;
  readonly mediaType: Exclude<VisualMediaPreference, 'either'>;
}
/** Opaque future server-issued reference; deliberately not a URL, file path, or canonical asset. */
export interface VisualSemanticMediaReference { readonly kind: 'provider-mediated-image' | 'provider-mediated-video-frame-set'; readonly opaqueReference: string; }
export interface VisualSemanticSignal {
  readonly dimension: VisualSemanticDimension;
  readonly state: VisualSemanticSignalState;
  readonly interpretation?: VisualSemanticInterpretation;
  readonly confidenceBand?: VisualSemanticConfidenceBand;
  /** Provider observation is distinct from ShortsFlow's bounded interpretation. */
  readonly observation?: VisualSemanticObservation;
}
export interface VisualSemanticAnalysisRequest {
  readonly version: typeof VISUAL_SEMANTIC_VERSION;
  readonly analyzerVersion: string;
  readonly briefFingerprint: string;
  readonly candidate: VisualSemanticCandidateBinding;
  readonly mediaReference?: VisualSemanticMediaReference;
}
export interface VisualSemanticAssessment {
  readonly version: typeof VISUAL_SEMANTIC_VERSION;
  readonly status: 'available' | 'unavailable';
  readonly analyzerVersion: string;
  readonly briefFingerprint: string;
  readonly candidate: VisualSemanticCandidateBinding;
  readonly signals: readonly VisualSemanticSignal[];
  readonly unavailableReason?: VisualSemanticUnavailableReason;
}
export interface VisualSemanticAnalysisProvider {
  readonly id: string;
  capability(): { readonly status: 'unavailable'; readonly reason: VisualSemanticUnavailableReason } | { readonly status: 'available' };
  /** Provider-shaped, untrusted data. Only analyzeVisualSemanticAssessment may admit it. */
  analyze(request: VisualSemanticAnalysisRequest, signal?: AbortSignal): Promise<unknown>;
}

const dimensions = new Set<VisualSemanticDimension>(['subject', 'setting', 'location', 'era', 'action', 'mood', 'lighting', 'visual-role', 'composition', 'realism-style', 'text-logo', 'continuity']);
const states = new Set<VisualSemanticSignalState>(['evaluated', 'unsupported', 'unavailable']);
const interpretations = new Set<VisualSemanticInterpretation>(['match', 'mismatch', 'uncertain']);
const confidenceBands = new Set<VisualSemanticConfidenceBand>(['low', 'medium', 'high']);
const observations = new Set<VisualSemanticObservation>(['provider-observed-match', 'provider-observed-mismatch', 'provider-observed-uncertain']);
const unavailableReasons = new Set<VisualSemanticUnavailableReason>(['no-media-reference', 'provider-unavailable', 'provider-failure', 'invalid-provider-result']);
const urlLike = /(?:https?:\/\/|www\.)/iu;

export function unavailableVisualSemanticAssessment(request: VisualSemanticAnalysisRequest, reason: VisualSemanticUnavailableReason = 'no-media-reference'): VisualSemanticAssessment {
  const normalized = normalizeVisualSemanticAnalysisRequest(request);
  if (!unavailableReasons.has(reason)) throw new Error('Semantic analysis availability is invalid.');
  return Object.freeze({ version: VISUAL_SEMANTIC_VERSION, status: 'unavailable', analyzerVersion: normalized.analyzerVersion, briefFingerprint: normalized.briefFingerprint, candidate: normalized.candidate, signals: Object.freeze([]), unavailableReason: reason });
}

export function normalizeVisualSemanticAnalysisRequest(value: unknown): VisualSemanticAnalysisRequest {
  const source = object(value, 'Semantic analysis request'); keys(source, ['version', 'analyzerVersion', 'briefFingerprint', 'candidate', 'mediaReference'], 'Semantic analysis request');
  const request = { version: version(source.version), analyzerVersion: identifier(source.analyzerVersion, 'Semantic analyzer version'), briefFingerprint: fingerprint(source.briefFingerprint), candidate: candidateBinding(source.candidate), ...(source.mediaReference === undefined ? {} : { mediaReference: mediaReference(source.mediaReference) }) };
  return Object.freeze(request);
}

/** Accepts only a bounded provider result bound to this exact candidate and brief. */
export function normalizeVisualSemanticProviderResult(value: unknown, request: VisualSemanticAnalysisRequest): VisualSemanticAssessment {
  const expected = normalizeVisualSemanticAnalysisRequest(request); const source = object(value, 'Semantic provider result'); keys(source, ['status', 'signals'], 'Semantic provider result');
  if (source.status !== 'available' || !Array.isArray(source.signals) || source.signals.length === 0 || source.signals.length > dimensions.size) throw new Error('Semantic provider result is invalid.');
  const signals = source.signals.map(normalizeSignal); const seen = new Set(signals.map((signal) => signal.dimension));
  if (seen.size !== signals.length || !signals.some((signal) => signal.state === 'evaluated')) throw new Error('Semantic provider result is incomplete.');
  return Object.freeze({ version: VISUAL_SEMANTIC_VERSION, status: 'available', analyzerVersion: expected.analyzerVersion, briefFingerprint: expected.briefFingerprint, candidate: expected.candidate, signals: Object.freeze(signals) });
}

/**
 * Admits a provider result only after strict validation. Failures remain advisory
 * unavailable state, so factual discovery and the user's current selection stay intact.
 */
export async function analyzeVisualSemanticAssessment(provider: VisualSemanticAnalysisProvider, request: VisualSemanticAnalysisRequest, signal?: AbortSignal): Promise<VisualSemanticAssessment> {
  const normalized = normalizeVisualSemanticAnalysisRequest(request);
  const capability = provider.capability();
  if (capability.status === 'unavailable') return unavailableVisualSemanticAssessment(normalized, capability.reason);
  let result: unknown;
  try {
    result = await provider.analyze(normalized, signal);
  } catch {
    return unavailableVisualSemanticAssessment(normalized, 'provider-failure');
  }
  try {
    return normalizeVisualSemanticProviderResult(result, normalized);
  } catch {
    return unavailableVisualSemanticAssessment(normalized, 'invalid-provider-result');
  }
}

/** Bounded advisory contribution only; unsupported/unavailable dimensions are neutral. */
export function semanticRankingAdjustment(assessment: VisualSemanticAssessment): number {
  if (assessment.status !== 'available') return 0;
  const value = assessment.signals.reduce((total, signal) => {
    if (signal.state !== 'evaluated' || !signal.interpretation || !signal.confidenceBand) return total;
    const weight = signal.confidenceBand === 'high' ? 4 : signal.confidenceBand === 'medium' ? 2 : 1;
    return total + (signal.interpretation === 'match' ? weight : signal.interpretation === 'mismatch' ? -weight : 0);
  }, 0);
  return Math.max(-10, Math.min(10, value));
}

export function createUnavailableVisualSemanticProvider(reason: VisualSemanticUnavailableReason = 'no-media-reference'): VisualSemanticAnalysisProvider {
  return Object.freeze({ id: 'unavailable-semantic-analysis', capability: () => ({ status: 'unavailable' as const, reason }), analyze: async (request: VisualSemanticAnalysisRequest) => unavailableVisualSemanticAssessment(request, reason) });
}

function normalizeSignal(value: unknown): VisualSemanticSignal {
  const source = object(value, 'Semantic signal'); keys(source, ['dimension', 'state', 'interpretation', 'confidenceBand', 'observation'], 'Semantic signal');
  const dimension = enumValue(source.dimension, dimensions, 'Semantic dimension'); const state = enumValue(source.state, states, 'Semantic signal state');
  if (state !== 'evaluated') { if (source.interpretation !== undefined || source.confidenceBand !== undefined || source.observation !== undefined) throw new Error('Unavailable semantic signal cannot imply a match.'); return Object.freeze({ dimension, state }); }
  if (source.interpretation === undefined || source.confidenceBand === undefined || source.observation === undefined) throw new Error('Evaluated semantic signal is incomplete.');
  return Object.freeze({ dimension, state, interpretation: enumValue(source.interpretation, interpretations, 'Semantic interpretation'), confidenceBand: enumValue(source.confidenceBand, confidenceBands, 'Semantic confidence'), observation: enumValue(source.observation, observations, 'Semantic observation') });
}
function candidateBinding(value: unknown): VisualSemanticCandidateBinding { const source = object(value, 'Semantic candidate binding'); keys(source, ['candidateId', 'provider', 'providerMediaIdentity', 'mediaType'], 'Semantic candidate binding'); const candidateId = identifier(source.candidateId, 'Semantic candidate identity'); const provider = identifier(source.provider, 'Semantic provider'); const providerMediaIdentity = identifier(source.providerMediaIdentity, 'Semantic provider media identity'); const mediaType = source.mediaType === 'image' || source.mediaType === 'video' ? source.mediaType : invalid('Semantic media type'); return Object.freeze({ candidateId, provider, providerMediaIdentity, mediaType }); }
function mediaReference(value: unknown): VisualSemanticMediaReference { const source = object(value, 'Semantic media reference'); keys(source, ['kind', 'opaqueReference'], 'Semantic media reference'); const kind = source.kind === 'provider-mediated-image' || source.kind === 'provider-mediated-video-frame-set' ? source.kind : invalid('Semantic media reference kind'); return Object.freeze({ kind, opaqueReference: identifier(source.opaqueReference, 'Semantic media reference') }); }
function object(value: unknown, label: string): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${label} is invalid.`); return value as Record<string, unknown>; }
function keys(value: Record<string, unknown>, allowed: readonly string[], label: string): void { if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error(`${label} contains unsupported fields.`); }
function enumValue<T extends string>(value: unknown, allowed: ReadonlySet<T>, label: string): T { if (typeof value !== 'string' || !allowed.has(value as T)) throw new Error(`${label} is invalid.`); return value as T; }
function identifier(value: unknown, label: string): string { if (typeof value !== 'string' || !/^[A-Za-z0-9._:-]{1,160}$/u.test(value) || urlLike.test(value)) throw new Error(`${label} is invalid.`); return value; }
function fingerprint(value: unknown): string { if (typeof value !== 'string' || !/^[a-z0-9-]{12,96}$/iu.test(value)) throw new Error('Semantic brief fingerprint is invalid.'); return value; }
function version(value: unknown): typeof VISUAL_SEMANTIC_VERSION { if (value !== VISUAL_SEMANTIC_VERSION) throw new Error('Semantic analysis version is invalid.'); return VISUAL_SEMANTIC_VERSION; }
function invalid(label: string): never { throw new Error(`${label} is invalid.`); }
