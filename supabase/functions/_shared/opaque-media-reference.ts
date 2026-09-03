/** Serializable contract shared by the renderer, Edge gateway, and future analysis adapters. */
export const OPAQUE_MEDIA_REFERENCE_VERSION = 1 as const;
export const OPAQUE_MEDIA_REFERENCE_TTL_SECONDS = 300 as const;
export type OpaqueMediaAnalysisScope = "semantic-image-analysis";
export type OpaqueMediaReferenceMediaType = "image";

export interface OpaqueMediaReferenceRequest {
  readonly media: { readonly bucket: "media"; readonly objectPath: string };
}
export interface OpaqueMediaReferenceResponse {
  readonly reference: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly scope: OpaqueMediaAnalysisScope;
  readonly mediaType: OpaqueMediaReferenceMediaType;
}

const token = /^omr1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{32,4096}$/u;
const date = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

export function normalizeOpaqueMediaReferenceRequest(value: unknown): OpaqueMediaReferenceRequest {
  const source = object(value, "Opaque media reference request"); keys(source, ["media"], "Opaque media reference request");
  const media = object(source.media, "Opaque media identity"); keys(media, ["bucket", "objectPath"], "Opaque media identity");
  const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
  if (media.bucket !== "media" || typeof media.objectPath !== "string" || media.objectPath.length > 240 || !new RegExp(`^${uuid}/generated-images/${uuid}\\.(?:png|jpg)$`).test(media.objectPath)) throw new Error("Opaque media identity is invalid.");
  return Object.freeze({ media: Object.freeze({ bucket: "media", objectPath: media.objectPath }) });
}

export function normalizeOpaqueMediaReferenceResponse(value: unknown, now = Date.now()): OpaqueMediaReferenceResponse {
  const source = object(value, "Opaque media reference response"); keys(source, ["reference", "issuedAt", "expiresAt", "scope", "mediaType"], "Opaque media reference response");
  if (typeof source.reference !== "string" || !token.test(source.reference) || source.scope !== "semantic-image-analysis" || source.mediaType !== "image" || typeof source.issuedAt !== "string" || typeof source.expiresAt !== "string" || !date.test(source.issuedAt) || !date.test(source.expiresAt)) throw new Error("Opaque media reference response is invalid.");
  const issuedAt = Date.parse(source.issuedAt); const expiresAt = Date.parse(source.expiresAt);
  if (!Number.isSafeInteger(issuedAt) || !Number.isSafeInteger(expiresAt) || issuedAt > now + 30_000 || expiresAt <= issuedAt || expiresAt - issuedAt > OPAQUE_MEDIA_REFERENCE_TTL_SECONDS * 1_000 || expiresAt <= now) throw new Error("Opaque media reference response is invalid.");
  return Object.freeze({ reference: source.reference, issuedAt: source.issuedAt, expiresAt: source.expiresAt, scope: "semantic-image-analysis", mediaType: "image" });
}

function object(value: unknown, label: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${label} is invalid.`); return value as Record<string, unknown>; }
function keys(value: Record<string, unknown>, allowed: readonly string[], label: string): void { if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error(`${label} contains unsupported fields.`); }
