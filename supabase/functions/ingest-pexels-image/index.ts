import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { authorizeProtectedFunction, isBoundedString, jsonResponse, readBoundedJson, safeFailure } from "../_shared/protected-function.ts";
import { isApprovedPexelsUrl, resolvePexelsImageSource, type PexelsPhotoSource } from "./pexels-image-source.ts";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_DIMENSION = 4_096;
const MAX_PIXELS = 16_000_000;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

interface IngestRequest { mediaId?: unknown; query?: unknown }
interface PexelsPhoto extends PexelsPhotoSource {
  url?: unknown;
  photographer?: unknown;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey" } });
  if (req.method !== "POST") return safeFailure("Method not allowed.", 405);
  try {
    const authorization = await authorizeProtectedFunction(req, "ingest-pexels-image");
    if ("response" in authorization) return authorization.response;
    const parsed = await readBoundedJson<IngestRequest>(req, 2_048);
    if ("response" in parsed) return parsed.response;
    const mediaId = parsed.value.mediaId;
    const query = parsed.value.query;
    if (!Number.isSafeInteger(mediaId) || mediaId <= 0 || mediaId > 2_147_483_647 || !isBoundedString(query, 500, true)) return safeFailure("Invalid Pexels image ingest request.", 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: keyRow } = await supabase.from("api_keys").select("value").eq("key", "pexels").maybeSingle();
    if (!keyRow?.value) return jsonResponse({ error: "Pexels image ingestion is not configured. Contact an administrator." }, 503);

    const photoResponse = await timedFetch(`https://api.pexels.com/v1/photos/${mediaId}`, { headers: { Authorization: keyRow.value } });
    if (!photoResponse.ok) return safeFailure("Pexels image candidate is unavailable.", photoResponse.status === 404 ? 404 : 502);
    const photo = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await readBoundedBytes(photoResponse.body, 64 * 1024))) as PexelsPhoto;
    const source = resolvePexelsImageSource(photo, mediaId);
    if (!source) return safeFailure("Pexels image candidate is invalid.", 502);

    const downloaded = await downloadPexelsImage(source.downloadUrl);
    const image = validateImage(downloaded.contentType, downloaded.bytes);
    const objectPath = `${authorization.userId}/generated-images/${crypto.randomUUID()}.${image.extension}`;
    const { error: uploadError } = await supabase.storage.from("media").upload(objectPath, image.bytes, { contentType: image.mimeType, cacheControl: "31536000", upsert: false });
    if (uploadError) return safeFailure("Pexels image could not be stored.", 502);
    const { data: signed, error: signError } = await supabase.storage.from("media").createSignedUrl(objectPath, 60 * 60);
    if (signError || !signed?.signedUrl) return safeFailure("Pexels image storage URL could not be created.", 502);

    const provenance = {
      provider: "pexels",
      providerMediaId: mediaId,
      originalSourceUrl: source.originalSourceUrl,
      ...(boundedText(photo.photographer, 500) ? { creator: boundedText(photo.photographer, 500) } : {}),
      ...(isPexelsPageUrl(photo.url) ? { providerPageUrl: photo.url } : {}),
      previewUrl: source.previewUrl,
      query: query.trim(),
    };
    return jsonResponse({ media: { bucket: "media", objectPath }, previewUrl: signed.signedUrl, provenance });
  } catch (error) {
    if (error instanceof ImageIngestError) return safeFailure("Pexels image could not be validated.", 502);
    return safeFailure("Pexels image ingestion could not be completed.", 500);
  }
});

class ImageIngestError extends Error {}

function isPexelsImageUrl(value: unknown): value is string { return isApprovedPexelsUrl(value, "images.pexels.com"); }
function isPexelsPageUrl(value: unknown): value is string { return isApprovedPexelsUrl(value, "www.pexels.com"); }
function boundedText(value: unknown, max: number): string | null { return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max && ![...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) ? value.trim() : null; }
async function timedFetch(url: string, init: RequestInit): Promise<Response> {
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  return fetch(url, { ...init, signal, redirect: "manual" });
}
async function downloadPexelsImage(initialUrl: string): Promise<{ contentType: string; bytes: Uint8Array }> {
  let url = initialUrl;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    if (!isPexelsImageUrl(url)) throw new ImageIngestError("host");
    const response = await timedFetch(url, {});
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new ImageIngestError("redirect");
      url = new URL(location, url).toString();
      continue;
    }
    if (!response.ok || !response.body) throw new ImageIngestError("download");
    const length = response.headers.get("content-length");
    if (length && (!/^\d+$/.test(length) || Number(length) > MAX_IMAGE_BYTES)) throw new ImageIngestError("size");
    return { contentType: response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() ?? "", bytes: await readBoundedBytes(response.body, MAX_IMAGE_BYTES) };
  }
  throw new ImageIngestError("redirect");
}
async function readBoundedBytes(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<Uint8Array> {
  if (!body) throw new ImageIngestError("body");
  const reader = body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const { value, done } = await reader.read(); if (done) break; if (!value) continue; size += value.byteLength; if (size > maxBytes) { await reader.cancel(); throw new ImageIngestError("size"); } chunks.push(value); } }
  finally { reader.releaseLock(); }
  if (size === 0) throw new ImageIngestError("empty");
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; } return bytes;
}
function validateImage(contentType: string, bytes: Uint8Array): { mimeType: "image/png" | "image/jpeg"; extension: "png" | "jpg"; bytes: Uint8Array } {
  if (contentType === "image/png" && isPng(bytes)) { assertPngDimensions(bytes); return { mimeType: "image/png", extension: "png", bytes }; }
  if (contentType === "image/jpeg" && isJpeg(bytes)) { assertJpegDimensions(bytes); return { mimeType: "image/jpeg", extension: "jpg", bytes }; }
  throw new ImageIngestError("format");
}
function isPng(bytes: Uint8Array): boolean { return bytes.length >= 24 && PNG_SIGNATURE.every((byte, index) => bytes[index] === byte) && String.fromCharCode(...bytes.slice(12, 16)) === "IHDR"; }
function assertPngDimensions(bytes: Uint8Array): void { const width = uint32(bytes, 16); const height = uint32(bytes, 20); assertDimensions(width, height); }
function uint32(bytes: Uint8Array, offset: number): number { return bytes[offset] * 2 ** 24 + bytes[offset + 1] * 2 ** 16 + bytes[offset + 2] * 256 + bytes[offset + 3]; }
function isJpeg(bytes: Uint8Array): boolean { return bytes.length >= 6 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9; }
function assertJpegDimensions(bytes: Uint8Array): void {
  let offset = 2;
  while (offset + 9 < bytes.length - 2) { if (bytes[offset] !== 0xff) throw new ImageIngestError("jpeg"); while (bytes[offset] === 0xff) offset += 1; const marker = bytes[offset++]; if (marker === 0xd9 || marker === 0xda) break; if (marker >= 0xd0 && marker <= 0xd7) continue; if (offset + 2 > bytes.length) break; const length = bytes[offset] * 256 + bytes[offset + 1]; if (length < 2 || offset + length > bytes.length) break; if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) { const height = bytes[offset + 3] * 256 + bytes[offset + 4]; const width = bytes[offset + 5] * 256 + bytes[offset + 6]; return assertDimensions(width, height); } offset += length; }
  throw new ImageIngestError("jpeg");
}
function assertDimensions(width: number, height: number): void { if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_PIXELS) throw new ImageIngestError("dimensions"); }
