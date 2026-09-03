export const VISUAL_SPATIAL_ANALYSIS_CONTRACT_VERSION = "visual-spatial-v1" as const;
export const VISUAL_SPATIAL_COORDINATE_PRECISION = 4 as const;

export type VisualSpatialConfidence = "low" | "medium" | "high";
export type VisualSpatialAnalysisReason =
  | "provider-not-configured" | "provider-credit-exhausted" | "provider-rate-limited"
  | "provider-timeout" | "provider-malformed-response" | "provider-unavailable"
  | "unsupported-media" | "invalid-reference" | "expired-reference"
  | "candidate-invalid" | "candidate-not-found" | "candidate-provider-not-configured"
  | "candidate-provider-unavailable" | "candidate-media-unavailable" | "candidate-media-too-large";

export interface VisualSpatialPoint { readonly x: number; readonly y: number; }
export interface VisualSpatialRegion { readonly x: number; readonly y: number; readonly width: number; readonly height: number; }
export interface VisualSpatialSourceDimensions { readonly width: number; readonly height: number; }
export interface VisualSpatialProviderEvidence {
  readonly focalPoint: VisualSpatialPoint;
  readonly primarySubjectRegion?: VisualSpatialRegion;
  /** Evidence-strength band, not a probability or crop-safety guarantee. */
  readonly confidenceBand: VisualSpatialConfidence;
}

export interface VisualSpatialAnalysisRequest { readonly reference: string; readonly requestId: string; }
export interface DiscoveryCandidateSpatialAnalysisRequest {
  readonly candidate: { readonly provider: "pexels"; readonly providerAssetId: number; readonly mediaType: "image" };
  readonly requestId: string;
}
export type VisualSpatialAnalysisResponse = {
  readonly status: "evaluated";
  readonly contractVersion: typeof VISUAL_SPATIAL_ANALYSIS_CONTRACT_VERSION;
  readonly analyzerVersion: string;
  /** Dimensions of the validated encoded raster; EXIF/display orientation is not applied in V1. */
  readonly sourceDimensions: VisualSpatialSourceDimensions;
  readonly focalPoint: VisualSpatialPoint;
  readonly primarySubjectRegion?: VisualSpatialRegion;
  readonly confidenceBand: VisualSpatialConfidence;
} | {
  readonly status: "unavailable" | "unsupported";
  readonly reason: VisualSpatialAnalysisReason;
  readonly contractVersion: typeof VISUAL_SPATIAL_ANALYSIS_CONTRACT_VERSION;
};

const confidence = new Set<string>(["low", "medium", "high"]);
const reasons = new Set<string>([
  "provider-not-configured", "provider-credit-exhausted", "provider-rate-limited", "provider-timeout",
  "provider-malformed-response", "provider-unavailable", "unsupported-media", "invalid-reference",
  "expired-reference", "candidate-invalid", "candidate-not-found", "candidate-provider-not-configured",
  "candidate-provider-unavailable", "candidate-media-unavailable", "candidate-media-too-large",
]);
const referencePattern = /^omr1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{32,4096}$/u;
const requestIdPattern = /^[A-Za-z0-9._:-]{8,96}$/u;
const analyzerPattern = /^[A-Za-z0-9._:-]{1,160}$/u;

export function normalizeVisualSpatialAnalysisRequest(value: unknown): VisualSpatialAnalysisRequest {
  const source = object(value, "Visual spatial analysis request");
  exactKeys(source, ["reference", "requestId"], "Visual spatial analysis request");
  if (typeof source.reference !== "string" || !referencePattern.test(source.reference)
    || typeof source.requestId !== "string" || !requestIdPattern.test(source.requestId)) throw new Error("Visual spatial analysis request is invalid.");
  return Object.freeze({ reference: source.reference, requestId: source.requestId });
}

/** Candidate transport contains no URL, storage path, dimensions, owner, or media authority. */
export function normalizeDiscoveryCandidateSpatialAnalysisRequest(value: unknown): DiscoveryCandidateSpatialAnalysisRequest {
  const source = object(value, "Discovery candidate spatial analysis request");
  exactKeys(source, ["candidate", "requestId"], "Discovery candidate spatial analysis request");
  const candidate = object(source.candidate, "Discovery candidate spatial identity");
  exactKeys(candidate, ["provider", "providerAssetId", "mediaType"], "Discovery candidate spatial identity");
  const providerAssetId = candidate.providerAssetId;
  if (candidate.provider !== "pexels" || candidate.mediaType !== "image" || typeof providerAssetId !== "number"
    || !Number.isSafeInteger(providerAssetId) || providerAssetId < 1 || providerAssetId > 2_147_483_647
    || typeof source.requestId !== "string" || !requestIdPattern.test(source.requestId)) throw new Error("Discovery candidate spatial identity is invalid.");
  return Object.freeze({ candidate: Object.freeze({ provider: "pexels", providerAssetId, mediaType: "image" }), requestId: source.requestId });
}

/** Strict admission boundary for untrusted provider geometry. Dimensions are deliberately absent. */
export function normalizeVisualSpatialProviderEvidence(value: unknown): VisualSpatialProviderEvidence {
  const source = object(value, "Visual spatial provider evidence");
  exactKeys(source, ["focalPoint", "primarySubjectRegion", "confidenceBand"], "Visual spatial provider evidence");
  if (!Object.prototype.hasOwnProperty.call(source, "focalPoint")
    || !Object.prototype.hasOwnProperty.call(source, "primarySubjectRegion")
    || !Object.prototype.hasOwnProperty.call(source, "confidenceBand")
    || typeof source.confidenceBand !== "string" || !confidence.has(source.confidenceBand)) throw new Error("Visual spatial provider evidence is invalid.");
  const focalPoint = point(source.focalPoint);
  const primarySubjectRegion = source.primarySubjectRegion === null ? undefined : region(source.primarySubjectRegion);
  return Object.freeze({ focalPoint, ...(primarySubjectRegion ? { primarySubjectRegion } : {}), confidenceBand: source.confidenceBand as VisualSpatialConfidence });
}

export function evaluatedVisualSpatialAnalysis(input: {
  readonly analyzerVersion: string;
  readonly sourceDimensions: VisualSpatialSourceDimensions;
  readonly evidence: VisualSpatialProviderEvidence;
}): VisualSpatialAnalysisResponse {
  const analyzerVersion = normalizeAnalyzerVersion(input.analyzerVersion);
  const sourceDimensions = dimensions(input.sourceDimensions);
  const evidence = normalizeVisualSpatialProviderEvidence({
    focalPoint: input.evidence.focalPoint,
    primarySubjectRegion: input.evidence.primarySubjectRegion ?? null,
    confidenceBand: input.evidence.confidenceBand,
  });
  return Object.freeze({
    status: "evaluated", contractVersion: VISUAL_SPATIAL_ANALYSIS_CONTRACT_VERSION, analyzerVersion,
    sourceDimensions, focalPoint: evidence.focalPoint,
    ...(evidence.primarySubjectRegion ? { primarySubjectRegion: evidence.primarySubjectRegion } : {}),
    confidenceBand: evidence.confidenceBand,
  });
}

export function unavailableVisualSpatialAnalysis(reason: VisualSpatialAnalysisReason): VisualSpatialAnalysisResponse {
  if (!reasons.has(reason)) throw new Error("Visual spatial analysis reason is invalid.");
  return Object.freeze({ status: reason === "unsupported-media" ? "unsupported" : "unavailable", reason, contractVersion: VISUAL_SPATIAL_ANALYSIS_CONTRACT_VERSION });
}

export function normalizeVisualSpatialAnalysisResponse(value: unknown): VisualSpatialAnalysisResponse {
  const source = object(value, "Visual spatial analysis response");
  if (source.status === "evaluated") {
    exactKeys(source, ["status", "contractVersion", "analyzerVersion", "sourceDimensions", "focalPoint", "primarySubjectRegion", "confidenceBand"], "Visual spatial analysis response");
    if (source.contractVersion !== VISUAL_SPATIAL_ANALYSIS_CONTRACT_VERSION) throw new Error("Visual spatial analysis response is invalid.");
    return evaluatedVisualSpatialAnalysis({
      analyzerVersion: source.analyzerVersion as string,
      sourceDimensions: source.sourceDimensions as VisualSpatialSourceDimensions,
      evidence: normalizeVisualSpatialProviderEvidence({ focalPoint: source.focalPoint, primarySubjectRegion: source.primarySubjectRegion ?? null, confidenceBand: source.confidenceBand }),
    });
  }
  exactKeys(source, ["status", "reason", "contractVersion"], "Visual spatial analysis response");
  if ((source.status !== "unavailable" && source.status !== "unsupported") || typeof source.reason !== "string"
    || !reasons.has(source.reason) || source.contractVersion !== VISUAL_SPATIAL_ANALYSIS_CONTRACT_VERSION) throw new Error("Visual spatial analysis response is invalid.");
  const expectedStatus = source.reason === "unsupported-media" ? "unsupported" : "unavailable";
  if (source.status !== expectedStatus) throw new Error("Visual spatial analysis response is invalid.");
  return unavailableVisualSpatialAnalysis(source.reason as VisualSpatialAnalysisReason);
}

export function normalizeAnalyzerVersion(value: unknown): string {
  if (typeof value !== "string" || !analyzerPattern.test(value)) throw new Error("Visual spatial analyzer version is invalid.");
  return value;
}

function point(value: unknown): VisualSpatialPoint {
  const source = object(value, "Visual spatial focal point");
  exactKeys(source, ["x", "y"], "Visual spatial focal point");
  return Object.freeze({ x: coordinate(source.x), y: coordinate(source.y) });
}
function region(value: unknown): VisualSpatialRegion {
  const source = object(value, "Visual spatial primary subject region");
  exactKeys(source, ["x", "y", "width", "height"], "Visual spatial primary subject region");
  const x = coordinate(source.x); const y = coordinate(source.y); const width = positiveCoordinate(source.width); const height = positiveCoordinate(source.height);
  if (x + width > 1 || y + height > 1) throw new Error("Visual spatial primary subject region exceeds image bounds.");
  return Object.freeze({ x, y, width, height });
}
function dimensions(value: unknown): VisualSpatialSourceDimensions {
  const source = object(value, "Visual spatial source dimensions");
  exactKeys(source, ["width", "height"], "Visual spatial source dimensions");
  if (!Number.isSafeInteger(source.width) || Number(source.width) < 1 || Number(source.width) > 4_096
    || !Number.isSafeInteger(source.height) || Number(source.height) < 1 || Number(source.height) > 4_096
    || Number(source.width) * Number(source.height) > 16_000_000) throw new Error("Visual spatial source dimensions are invalid.");
  return Object.freeze({ width: Number(source.width), height: Number(source.height) });
}
function coordinate(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1 || !boundedPrecision(value)) throw new Error("Visual spatial coordinate is invalid.");
  return value;
}
function positiveCoordinate(value: unknown): number { const normalized = coordinate(value); if (normalized <= 0) throw new Error("Visual spatial region size is invalid."); return normalized; }
function boundedPrecision(value: number): boolean { const scale = 10 ** VISUAL_SPATIAL_COORDINATE_PRECISION; return Math.abs(value * scale - Math.round(value * scale)) < 1e-8; }
function object(value: unknown, label: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${label} is invalid.`); return value as Record<string, unknown>; }
function exactKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void { if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error(`${label} contains unsupported fields.`); }
