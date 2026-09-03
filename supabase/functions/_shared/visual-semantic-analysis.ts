import { normalizeSceneVisualBrief, visualBriefFingerprint, type SceneVisualBrief } from "./visual-intelligence.ts";

export const VISUAL_SEMANTIC_ANALYSIS_CONTRACT_VERSION = "visual-semantic-v1" as const;
export const VISUAL_SEMANTIC_ANALYSIS_DIMENSIONS = ["subject", "setting", "location", "era", "action", "mood", "lighting", "composition", "realism-style", "text-logo"] as const;
export type VisualSemanticAnalysisDimension = typeof VISUAL_SEMANTIC_ANALYSIS_DIMENSIONS[number];
export type VisualSemanticAnalysisReason = "provider-not-configured" | "provider-credit-exhausted" | "provider-rate-limited" | "provider-timeout" | "provider-malformed-response" | "provider-unavailable" | "unsupported-media" | "invalid-reference" | "expired-reference";
export type VisualSemanticEvidence = "supports-intent" | "contradicts-intent" | "uncertain";
export type VisualSemanticConfidence = "low" | "medium" | "high";

export interface VisualSemanticAnalysisIntent { readonly brief: SceneVisualBrief; readonly briefFingerprint: string; readonly dimensions: readonly VisualSemanticAnalysisDimension[]; }
export interface VisualSemanticAnalysisRequest { readonly reference: string; readonly intent: VisualSemanticAnalysisIntent; readonly requestId: string; }
export interface VisualSemanticObservation { readonly dimension: VisualSemanticAnalysisDimension; readonly evidence: VisualSemanticEvidence; readonly confidenceBand: VisualSemanticConfidence; readonly facts: readonly string[]; }
export type VisualSemanticAnalysisResponse = { readonly status: "evaluated"; readonly contractVersion: typeof VISUAL_SEMANTIC_ANALYSIS_CONTRACT_VERSION; readonly observations: readonly VisualSemanticObservation[]; }
  | { readonly status: "unavailable" | "unsupported"; readonly reason: VisualSemanticAnalysisReason; readonly contractVersion: typeof VISUAL_SEMANTIC_ANALYSIS_CONTRACT_VERSION; };

const dimensions = new Set<string>(VISUAL_SEMANTIC_ANALYSIS_DIMENSIONS);
const evidence = new Set<string>(["supports-intent", "contradicts-intent", "uncertain"]);
const confidence = new Set<string>(["low", "medium", "high"]);
const reasons = new Set<string>(["provider-not-configured", "provider-credit-exhausted", "provider-rate-limited", "provider-timeout", "provider-malformed-response", "provider-unavailable", "unsupported-media", "invalid-reference", "expired-reference"]);
const referencePattern = /^omr1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{32,4096}$/u;
const requestIdPattern = /^[A-Za-z0-9._:-]{8,96}$/u;
const factPattern = /^[\p{L}\p{N}][\p{L}\p{N} ,.'’()&/+:-]{0,119}$/u;

export function normalizeVisualSemanticAnalysisRequest(value: unknown): VisualSemanticAnalysisRequest {
  const source = object(value, "Visual semantic analysis request"); keys(source, ["reference", "intent", "requestId"], "Visual semantic analysis request");
  if (typeof source.reference !== "string" || !referencePattern.test(source.reference) || typeof source.requestId !== "string" || !requestIdPattern.test(source.requestId)) throw new Error("Visual semantic analysis request is invalid.");
  const intentSource = object(source.intent, "Visual semantic analysis intent"); keys(intentSource, ["brief", "briefFingerprint", "dimensions"], "Visual semantic analysis intent");
  const brief = normalizeSceneVisualBrief(intentSource.brief);
  if (typeof intentSource.briefFingerprint !== "string" || intentSource.briefFingerprint !== visualBriefFingerprint(brief) || !Array.isArray(intentSource.dimensions) || intentSource.dimensions.length < 1 || intentSource.dimensions.length > VISUAL_SEMANTIC_ANALYSIS_DIMENSIONS.length) throw new Error("Visual semantic analysis intent is invalid.");
  const requested = intentSource.dimensions.map((item) => typeof item === "string" && dimensions.has(item) ? item as VisualSemanticAnalysisDimension : invalid());
  if (new Set(requested).size !== requested.length) throw new Error("Visual semantic analysis intent is invalid.");
  return Object.freeze({ reference: source.reference, requestId: source.requestId, intent: Object.freeze({ brief, briefFingerprint: intentSource.briefFingerprint, dimensions: Object.freeze(requested) }) });
}

/** Strictly admits compact pixel-observation evidence; raw model prose never escapes this boundary. */
export function normalizeVisualSemanticObservations(value: unknown, requestedDimensions: readonly VisualSemanticAnalysisDimension[]): readonly VisualSemanticObservation[] {
  const source = object(value, "Visual semantic provider result"); keys(source, ["observations"], "Visual semantic provider result");
  if (!Array.isArray(source.observations) || source.observations.length < 1 || source.observations.length !== requestedDimensions.length) throw new Error("Visual semantic provider result is invalid.");
  const requested = new Set(requestedDimensions);
  const normalized = source.observations.map((item) => {
    const observation = object(item, "Visual semantic observation"); keys(observation, ["dimension", "evidence", "confidenceBand", "facts"], "Visual semantic observation");
    if (typeof observation.dimension !== "string" || !requested.has(observation.dimension as VisualSemanticAnalysisDimension) || typeof observation.evidence !== "string" || !evidence.has(observation.evidence) || typeof observation.confidenceBand !== "string" || !confidence.has(observation.confidenceBand) || !Array.isArray(observation.facts) || observation.facts.length > 3) throw new Error("Visual semantic observation is invalid.");
    const facts = observation.facts.map((fact) => typeof fact === "string" && factPattern.test(fact.trim()) ? fact.trim() : invalid());
    if (new Set(facts.map((fact) => fact.toLowerCase())).size !== facts.length) throw new Error("Visual semantic observation is invalid.");
    return Object.freeze({ dimension: observation.dimension as VisualSemanticAnalysisDimension, evidence: observation.evidence as VisualSemanticEvidence, confidenceBand: observation.confidenceBand as VisualSemanticConfidence, facts: Object.freeze(facts) });
  });
  if (new Set(normalized.map((item) => item.dimension)).size !== normalized.length) throw new Error("Visual semantic provider result is invalid.");
  if (new Set(normalized.map((item) => item.dimension)).size !== requested.size) throw new Error("Visual semantic provider result is incomplete.");
  return Object.freeze(normalized);
}

export function unavailableVisualSemanticAnalysis(reason: VisualSemanticAnalysisReason): VisualSemanticAnalysisResponse {
  if (!reasons.has(reason)) throw new Error("Visual semantic analysis reason is invalid.");
  return Object.freeze({ status: reason === "unsupported-media" ? "unsupported" : "unavailable", reason, contractVersion: VISUAL_SEMANTIC_ANALYSIS_CONTRACT_VERSION });
}

export function normalizeVisualSemanticAnalysisResponse(value: unknown): VisualSemanticAnalysisResponse {
  const source = object(value, "Visual semantic analysis response");
  if (source.status === "evaluated") {
    keys(source, ["status", "contractVersion", "observations"], "Visual semantic analysis response");
    if (source.contractVersion !== VISUAL_SEMANTIC_ANALYSIS_CONTRACT_VERSION || !Array.isArray(source.observations)) throw new Error("Visual semantic analysis response is invalid.");
    const returnedDimensions = source.observations.map((item) => {
      const observation = object(item, "Visual semantic observation");
      return typeof observation.dimension === "string" && dimensions.has(observation.dimension) ? observation.dimension as VisualSemanticAnalysisDimension : invalid();
    });
    return Object.freeze({ status: "evaluated", contractVersion: VISUAL_SEMANTIC_ANALYSIS_CONTRACT_VERSION, observations: normalizeVisualSemanticObservations({ observations: source.observations }, returnedDimensions) });
  }
  keys(source, ["status", "reason", "contractVersion"], "Visual semantic analysis response");
  if ((source.status !== "unavailable" && source.status !== "unsupported") || typeof source.reason !== "string" || !reasons.has(source.reason) || source.contractVersion !== VISUAL_SEMANTIC_ANALYSIS_CONTRACT_VERSION) throw new Error("Visual semantic analysis response is invalid.");
  return unavailableVisualSemanticAnalysis(source.reason as VisualSemanticAnalysisReason);
}
function object(value: unknown, label: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${label} is invalid.`); return value as Record<string, unknown>; }
function keys(value: Record<string, unknown>, allowed: readonly string[], label: string): void { if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error(`${label} contains unsupported fields.`); }
function invalid(): never { throw new Error("Visual semantic analysis value is invalid."); }
