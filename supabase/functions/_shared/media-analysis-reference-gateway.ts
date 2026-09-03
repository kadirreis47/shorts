import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { normalizeOpaqueMediaReferenceRequest, OPAQUE_MEDIA_REFERENCE_TTL_SECONDS, type OpaqueMediaAnalysisScope, type OpaqueMediaReferenceRequest, type OpaqueMediaReferenceResponse } from "./opaque-media-reference.ts";
import { MAX_ANALYSIS_IMAGE_BYTES, validateAnalysisImage, type AnalysisImageContentType } from "./analysis-image-validation.ts";
import { decodeMediaAnalysisSecret, MEDIA_ANALYSIS_CLOCK_SKEW_SECONDS, openMediaAnalysisCapability, sealMediaAnalysisCapability } from "./media-analysis-reference-crypto.ts";
import { BoundedStorageReadError, readBoundedAnalysisObject, type AnalysisStorageReadAuthority } from "./bounded-storage-read.ts";

type Failure = "invalid-reference" | "expired-reference" | "scope-mismatch" | "media-not-found" | "media-not-eligible" | "unsupported-media-type" | "media-too-large" | "resolution-failed" | "temporarily-unavailable";
interface StoredEvidence { readonly id: string; readonly version: string; readonly etag: string; readonly updatedAt: string; readonly size: number; readonly contentType: AnalysisImageContentType; }

export class MediaAnalysisReferenceError extends Error { constructor(readonly reason: Failure) { super(reason); } }
export interface ResolvedMediaAnalysisReference { readonly mediaType: "image"; readonly contentType: "image/jpeg" | "image/png"; readonly bytes: Uint8Array; }

export async function issueMediaAnalysisReference(service: SupabaseClient, userId: string, request: OpaqueMediaReferenceRequest, secret: string, now = Date.now()): Promise<OpaqueMediaReferenceResponse> {
  decodeMediaAnalysisSecret(secret);
  const normalized = normalizeOpaqueMediaReferenceRequest(request);
  assertOwnerImagePath(normalized.media.objectPath, userId);
  const evidence = await storedEvidence(service, normalized.media.objectPath);
  const issuedAt = Math.floor(now / 1_000); const expiresAt = issuedAt + OPAQUE_MEDIA_REFERENCE_TTL_SECONDS;
  const reference = await sealMediaAnalysisCapability({ v: 1, s: "semantic-image-analysis", m: "image", b: "media", p: normalized.media.objectPath, o: userId, oid: evidence.id, ov: evidence.version, oe: evidence.etag, ou: evidence.updatedAt, oz: evidence.size, oct: evidence.contentType, iat: issuedAt, exp: expiresAt }, secret);
  return Object.freeze({ reference, issuedAt: new Date(issuedAt * 1_000).toISOString(), expiresAt: new Date(expiresAt * 1_000).toISOString(), scope: "semantic-image-analysis", mediaType: "image" });
}

/** Server-only resolver for a future provider adapter. It never returns an object path or URL. */
export async function resolveMediaAnalysisReference(service: SupabaseClient, storageAuthority: AnalysisStorageReadAuthority, userId: string, reference: string, requiredScope: OpaqueMediaAnalysisScope, secret: string, now = Date.now()): Promise<ResolvedMediaAnalysisReference> {
  let capability;
  try { capability = await openMediaAnalysisCapability(reference, secret); } catch { throw new MediaAnalysisReferenceError("invalid-reference"); }
  if (capability.o !== userId) throw new MediaAnalysisReferenceError("invalid-reference");
  if (capability.s !== requiredScope) throw new MediaAnalysisReferenceError("scope-mismatch");
  const nowSeconds = Math.floor(now / 1_000);
  if (capability.iat > nowSeconds + MEDIA_ANALYSIS_CLOCK_SKEW_SECONDS) throw new MediaAnalysisReferenceError("invalid-reference");
  if (capability.exp <= nowSeconds) throw new MediaAnalysisReferenceError("expired-reference");
  assertOwnerImagePath(capability.p, userId);
  const expected = Object.freeze({ id: capability.oid, version: capability.ov, etag: capability.oe, updatedAt: capability.ou, size: capability.oz, contentType: capability.oct });
  assertSameObject(expected, await storedEvidence(service, capability.p));
  let bytes: Uint8Array;
  try { bytes = await readBoundedAnalysisObject(storageAuthority, userId, capability.p, expected); }
  catch (error) { throw new MediaAnalysisReferenceError(error instanceof BoundedStorageReadError ? error.reason : "resolution-failed"); }
  let validatedType: AnalysisImageContentType;
  try { validatedType = validateAnalysisImage(capability.p, expected.contentType, bytes); } catch { throw new MediaAnalysisReferenceError("unsupported-media-type"); }
  // Detect overwrite/delete-recreate races between the first metadata read and download.
  assertSameObject(expected, await storedEvidence(service, capability.p));
  return Object.freeze({ mediaType: "image", contentType: validatedType, bytes });
}

function assertOwnerImagePath(path: string, userId: string): void { const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"; if (!new RegExp(`^${uuid}/generated-images/${uuid}\\.(?:png|jpg)$`).test(path) || !path.startsWith(`${userId}/`)) throw new MediaAnalysisReferenceError("media-not-eligible"); }
async function storedEvidence(service: SupabaseClient, path: string): Promise<StoredEvidence> { try { const { data, error } = await service.storage.from("media").info(path); if (error || !data) throw new MediaAnalysisReferenceError("media-not-found"); const contentType = data.contentType?.split(";", 1)[0].trim().toLowerCase(); if (typeof data.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(data.id)
      || typeof data.version !== "string" || data.version.length < 1 || data.version.length > 160 || typeof data.etag !== "string" || data.etag.length < 1 || data.etag.length > 160
      || typeof data.updatedAt !== "string" || data.updatedAt.length < 1 || data.updatedAt.length > 64 || typeof data.size !== "number" || !Number.isSafeInteger(data.size) || data.size < 1
      || (contentType !== "image/jpeg" && contentType !== "image/png")) throw new MediaAnalysisReferenceError("media-not-eligible");
    if (data.size > MAX_ANALYSIS_IMAGE_BYTES) throw new MediaAnalysisReferenceError("media-too-large");
    return Object.freeze({ id: data.id, version: data.version, etag: data.etag, updatedAt: data.updatedAt, size: data.size, contentType });
  } catch (error) { if (error instanceof MediaAnalysisReferenceError) throw error; throw new MediaAnalysisReferenceError("temporarily-unavailable"); } }
function assertSameObject(expected: StoredEvidence, actual: StoredEvidence): void { if (expected.id !== actual.id || expected.version !== actual.version || expected.etag !== actual.etag || expected.updatedAt !== actual.updatedAt || expected.size !== actual.size || expected.contentType !== actual.contentType) throw new MediaAnalysisReferenceError("invalid-reference"); }
