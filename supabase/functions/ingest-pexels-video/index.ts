import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { authorizeProtectedFunction, isBoundedString, jsonResponse, readBoundedJson, safeFailure } from "../_shared/protected-function.ts";
import { isTrustedVideoDownloadUrl, selectPexelsVideoCandidate } from "./candidate-selector.ts";

const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 20_000;
const QUARANTINE_PREFIX = "pexels-video-quarantine";
const MIN_VIDEO_WIDTH = 720;
const MIN_VIDEO_HEIGHT = 1280;
const MAX_VIDEO_WIDTH = 1080;
const MAX_VIDEO_HEIGHT = 1920;

interface IngestRequest { mediaId?: unknown; query?: unknown }
interface DiscardRequest { quarantineId?: unknown }
interface VideoFile { id?: unknown; link?: unknown; file_type?: unknown; width?: unknown; height?: unknown; fps?: unknown; quality?: unknown }
interface PexelsVideo { id?: unknown; url?: unknown; user?: { name?: unknown }; video_files?: unknown }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey" } });
  if (req.method !== "POST") return safeFailure("Method not allowed.", 405);
  // This bounded syntax classification is deliberately the only work before
  // authentication. It chooses a server-owned quota class; all provider and
  // Storage work remains after authenticated owner derivation.
  const parsed = await readBoundedJson<IngestRequest | DiscardRequest>(req, 2_048);
  if ("response" in parsed) return parsed.response;
  if ("quarantineId" in parsed.value) {
    const authorization = await authorizeProtectedFunction(req, "ingest-pexels-video-cleanup");
    if ("response" in authorization) return authorization.response;
    return discardQuarantine(parsed.value, authorization.userId);
  }
  const authorization = await authorizeProtectedFunction(req, "ingest-pexels-video");
  if ("response" in authorization) return authorization.response;
  return ingest(parsed.value, authorization.userId);
});

async function ingest(body: IngestRequest, ownerId: string): Promise<Response> {
  try {
    const mediaId = body.mediaId;
    const query = body.query;
    if (!Number.isSafeInteger(mediaId) || mediaId <= 0 || mediaId > 2_147_483_647 || !isBoundedString(query, 500, true)) return safeFailure("Invalid Pexels video ingest request.", 400);
    const supabase = serviceClient();
    const { data: keyRow, error: keyError } = await supabase.from("api_keys").select("value").eq("key", "pexels").maybeSingle();
    if (keyError || !keyRow?.value) return safeFailure("Pexels video ingestion is not configured.", 503);
    const response = await timedFetch(`https://api.pexels.com/v1/videos/videos/${mediaId}`, { headers: { Authorization: keyRow.value } });
    if (!response.ok) return safeFailure("Pexels video candidate is unavailable.", response.status === 404 ? 404 : 502);
    const video = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await readBoundedBytes(response.body, 128 * 1024))) as PexelsVideo;
    const candidate = selectPexelsVideoCandidate(video, mediaId);
    if (!candidate) return candidateSelectionFailure(video, mediaId);
    if (!isPexelsPageUrl(video.url)) return diagnosticFailure("Pexels video candidate is invalid.", "provider-provenance");
    const download = await downloadPexelsVideo(candidate.link);
    if (download.contentType !== "video/mp4" || !looksLikeMp4(download.bytes)) return diagnosticFailure("Pexels video candidate is incompatible.", "download-content");
    const quarantineId = crypto.randomUUID();
    const objectPath = `${ownerId}/${QUARANTINE_PREFIX}/${quarantineId}.mp4`;
    const storage = supabase.storage.from("media");
    const { error: uploadError } = await storage.upload(objectPath, download.bytes, { contentType: "video/mp4", cacheControl: "0", upsert: false });
    if (uploadError) return diagnosticFailure("Pexels video could not be prepared.", "quarantine-upload");
    const { data: signed, error: signError } = await storage.createSignedUrl(objectPath, 10 * 60);
    if (signError || !signed?.signedUrl) {
      await storage.remove([objectPath]).catch(() => undefined);
      return diagnosticFailure("Pexels video could not be prepared.", "quarantine-signing");
    }
    const provenance = {
      // The provider delivery link is transient acquisition authority.
      // Persist only Pexels' credential-free page URL as information.
      provider: "pexels", providerMediaId: mediaId, originalSourceUrl: video.url,
      providerPageUrl: video.url,
      ...(boundedText(video.user?.name, 500) ? { creator: boundedText(video.user?.name, 500) } : {}),
      query: query.trim(),
    };
    return jsonResponse({ quarantineId, quarantineUrl: signed.signedUrl, provenance });
  } catch (error) {
    return diagnosticFailure(error instanceof VideoIngestError ? "Pexels video could not be prepared." : "Pexels video ingestion could not be completed.", error instanceof VideoIngestError ? `download-${error.message}` : "unexpected");
  }
}

async function discardQuarantine(body: DiscardRequest, ownerId: string): Promise<Response> {
  if (typeof body.quarantineId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.quarantineId)) return safeFailure("Invalid Pexels video quarantine request.", 400);
  try {
    const { error } = await serviceClient().storage.from("media").remove([`${ownerId}/${QUARANTINE_PREFIX}/${body.quarantineId}.mp4`]);
    if (error) return safeFailure("Pexels video quarantine could not be cleared.", 502);
    return jsonResponse({ cleared: true });
  } catch { return safeFailure("Pexels video quarantine could not be cleared.", 502); }
}

class VideoIngestError extends Error {}
function diagnosticFailure(message: string, boundary: string, status = 502): Response {
  console.error(JSON.stringify({ event: "edge-function.pexels-video-ingest-failure", boundary }));
  return safeFailure(message, status);
}
function candidateSelectionFailure(video: PexelsVideo, mediaId: number): Response {
  const rawFiles = Array.isArray(video.video_files) ? video.video_files : [];
  // This is deliberately a bounded, URL-free production diagnostic. It is
  // emitted only after server-side provider resolution and cannot reveal the
  // provider's signed acquisition URL, an owner, or private storage identity.
  console.error(JSON.stringify({
    event: "edge-function.pexels-video-ingest-failure",
    boundary: "candidate-selection",
    candidateCount: Math.min(rawFiles.length, 100),
    rejectionReasons: video.id === mediaId && Array.isArray(video.video_files) ? [] : ["provider-shape-or-id"],
    candidates: rawFiles.slice(0, 10).map(describeCandidate),
  }));
  return safeFailure("Pexels video candidate is incompatible.", 502);
}
function serviceClient() { return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!); }
function isApprovedUrl(value: unknown, host: string): value is string { if (typeof value !== "string" || value.length > 2_000) return false; try { const url = new URL(value); return url.protocol === "https:" && url.hostname === host && !url.username && !url.password && !url.hash; } catch { return false; } }
function isPexelsPageUrl(value: unknown): value is string { return isApprovedUrl(value, "www.pexels.com"); }
function boundedText(value: unknown, max: number): string | null { return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max && ![...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) ? value.trim() : null; }
function diagnosticEnum(value: unknown, expected: string): "expected" | "other" | "missing" {
  return value === expected ? "expected" : typeof value === "string" && value.length > 0 ? "other" : "missing";
}
function diagnosticNumber(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function describeCandidate(value: unknown) {
  const file = value && typeof value === "object" && !Array.isArray(value) ? value as VideoFile : {};
  const url = typeof file.link === "string" && file.link.length <= 2_000 ? safeDiagnosticUrl(file.link) : null;
  const reasons: string[] = [];
  if (diagnosticEnum(file.file_type, "video/mp4") !== "expected") reasons.push("file-type");
  if (!Number.isSafeInteger(file.id)) reasons.push("file-id");
  if (!Number.isSafeInteger(file.width)) reasons.push("width-metadata");
  else if (file.width < MIN_VIDEO_WIDTH) reasons.push("width-min");
  else if (file.width > MAX_VIDEO_WIDTH) reasons.push("width-max");
  if (!Number.isSafeInteger(file.height)) reasons.push("height-metadata");
  else if (file.height < MIN_VIDEO_HEIGHT) reasons.push("height-min");
  else if (file.height > MAX_VIDEO_HEIGHT) reasons.push("height-max");
  if (Number.isSafeInteger(file.width) && Number.isSafeInteger(file.height) && file.height <= file.width) reasons.push("orientation");
  if (!Number.isFinite(file.fps)) reasons.push("fps-metadata");
  else if (file.fps <= 0 || file.fps > 60) reasons.push("fps-range");
  if (!url) reasons.push("url-metadata");
  else {
    if (url.protocol !== "https") reasons.push("url-protocol");
    if (url.hostname !== "videos.pexels.com") reasons.push("url-host");
    if (!url.noCredentials) reasons.push("url-credentials");
    if (!url.noFragment) reasons.push("url-fragment");
  }
  return {
    width: diagnosticNumber(file.width), height: diagnosticNumber(file.height),
    quality: diagnosticEnum(file.quality, "hd"), fileType: diagnosticEnum(file.file_type, "video/mp4"),
    fps: diagnosticNumber(file.fps), hostname: url?.hostname ?? null, protocol: url?.protocol ?? null,
    hasQuery: url?.hasQuery ?? null, rejectionReasons: reasons,
  };
}
function safeDiagnosticUrl(value: string): { hostname: string; protocol: "https" | "http" | "other"; hasQuery: boolean; noCredentials: boolean; noFragment: boolean } | null {
  try {
    const url = new URL(value);
    return {
      hostname: url.hostname.length <= 253 ? url.hostname : "too-long",
      protocol: url.protocol === "https:" ? "https" : url.protocol === "http:" ? "http" : "other",
      hasQuery: Boolean(url.search), noCredentials: !url.username && !url.password, noFragment: !url.hash,
    };
  } catch { return null; }
}
async function timedFetch(url: string, init: RequestInit): Promise<Response> { return fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "manual" }); }
async function downloadPexelsVideo(initialUrl: string): Promise<{ contentType: string; bytes: Uint8Array }> {
  let url = initialUrl;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    if (!isTrustedVideoDownloadUrl(url)) throw new VideoIngestError("host");
    const response = await timedFetch(url, {});
    if ([301, 302, 303, 307, 308].includes(response.status)) { const location = response.headers.get("location"); if (!location) throw new VideoIngestError("redirect"); url = new URL(location, url).toString(); continue; }
    if (!response.ok || !response.body) throw new VideoIngestError("download");
    const length = response.headers.get("content-length");
    if (length && (!/^\d+$/.test(length) || Number(length) > MAX_VIDEO_BYTES)) throw new VideoIngestError("size");
    return { contentType: response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() ?? "", bytes: await readBoundedBytes(response.body, MAX_VIDEO_BYTES) };
  }
  throw new VideoIngestError("redirect");
}
async function readBoundedBytes(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<Uint8Array> { if (!body) throw new VideoIngestError("body"); const reader = body.getReader(); const chunks: Uint8Array[] = []; let size = 0; try { while (true) { const { value, done } = await reader.read(); if (done) break; if (!value) continue; size += value.byteLength; if (size > maxBytes) { await reader.cancel(); throw new VideoIngestError("size"); } chunks.push(value); } } finally { reader.releaseLock(); } if (!size) throw new VideoIngestError("empty"); const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; } return bytes; }
function looksLikeMp4(bytes: Uint8Array): boolean { if (bytes.length < 16 || String.fromCharCode(...bytes.slice(4, 8)) !== "ftyp") return false; return ["isom", "iso2", "avc1", "mp41", "mp42", "dash"].some((brand) => { for (let offset = 8; offset + 4 <= Math.min(bytes.length, 32); offset += 4) if (String.fromCharCode(...bytes.slice(offset, offset + 4)) === brand) return true; return false; }); }
