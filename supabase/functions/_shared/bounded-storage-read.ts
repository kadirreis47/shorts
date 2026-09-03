import { MAX_ANALYSIS_IMAGE_BYTES, type AnalysisImageContentType } from "./analysis-image-validation.ts";

export interface AnalysisStorageReadAuthority { readonly supabaseUrl: string; readonly serviceRoleKey: string; }
export interface AnalysisStorageReadEvidence { readonly size: number; readonly contentType: AnalysisImageContentType; }
export type BoundedStorageReadFailure = "media-not-found" | "media-too-large" | "unsupported-media-type" | "resolution-failed" | "temporarily-unavailable";
export class BoundedStorageReadError extends Error { constructor(readonly reason: BoundedStorageReadFailure) { super(reason); } }

/** Reads only from the configured Supabase project, with redirects disabled and an in-stream byte ceiling. */
export async function readBoundedAnalysisObject(authority: AnalysisStorageReadAuthority, ownerId: string, path: string, expected: AnalysisStorageReadEvidence): Promise<Uint8Array> {
  let response: Response;
  try {
    const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
    if (!new RegExp(`^${uuid}/generated-images/${uuid}\\.(?:png|jpg)$`).test(path) || !new RegExp(`^${uuid}$`).test(ownerId) || !path.startsWith(`${ownerId}/`)
      || !Number.isSafeInteger(expected.size) || expected.size < 1 || expected.size > MAX_ANALYSIS_IMAGE_BYTES
      || (expected.contentType !== "image/jpeg" && expected.contentType !== "image/png")) throw new BoundedStorageReadError("temporarily-unavailable");
    const base = new URL(authority.supabaseUrl);
    if (base.protocol !== "https:" || !/^[a-z0-9-]+\.supabase\.co$/u.test(base.hostname) || base.port || base.username || base.password || base.pathname !== "/" || base.search || base.hash
      || !authority.serviceRoleKey || authority.serviceRoleKey.length > 8_192) throw new BoundedStorageReadError("temporarily-unavailable");
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    const url = new URL(`/storage/v1/object/media/${encodedPath}`, base.origin);
    response = await fetch(url, { method: "GET", redirect: "error", signal: AbortSignal.timeout(15_000), headers: { apikey: authority.serviceRoleKey, Authorization: `Bearer ${authority.serviceRoleKey}`, Accept: expected.contentType, "Cache-Control": "no-store" } });
  } catch (error) { if (error instanceof BoundedStorageReadError) throw error; throw new BoundedStorageReadError("resolution-failed"); }
  if (!response.ok || !response.body) throw new BoundedStorageReadError(response.status === 404 ? "media-not-found" : "resolution-failed");
  const declaredLength = response.headers.get("content-length"); const responseType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (responseType !== expected.contentType) throw new BoundedStorageReadError("unsupported-media-type");
  if (declaredLength !== null && (!/^\d{1,12}$/u.test(declaredLength) || Number(declaredLength) !== expected.size)) throw new BoundedStorageReadError("media-too-large");
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  try {
    while (true) { const { value, done } = await reader.read(); if (done) break; total += value.byteLength; if (total > expected.size || total > MAX_ANALYSIS_IMAGE_BYTES) { await reader.cancel(); throw new BoundedStorageReadError("media-too-large"); } chunks.push(value); }
  } catch (error) { if (error instanceof BoundedStorageReadError) throw error; throw new BoundedStorageReadError("resolution-failed"); }
  finally { reader.releaseLock(); }
  if (total !== expected.size) throw new BoundedStorageReadError("resolution-failed");
  const bytes = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
