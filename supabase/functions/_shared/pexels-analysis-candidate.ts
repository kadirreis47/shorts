import { validateAnalysisImage, type AnalysisImageContentType } from "./analysis-image-validation.ts";
import { MAX_SEMANTIC_PROVIDER_IMAGE_BYTES } from "./openai-visual-semantic-provider.ts";
import { isApprovedPexelsUrl, resolvePexelsImageSource, type PexelsPhotoSource } from "../ingest-pexels-image/pexels-image-source.ts";

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 15_000;

export class PexelsAnalysisCandidateError extends Error {
  constructor(readonly reason: "candidate-not-found" | "candidate-provider-unavailable" | "candidate-media-unavailable" | "candidate-media-too-large" | "unsupported-media") { super(reason); }
}

/** Server-resolved transient bytes only. No URL or storage identity escapes this boundary. */
export async function resolvePexelsAnalysisCandidate(assetId: number, apiKey: string, fetchImpl: typeof fetch = fetch, timeoutMs = TIMEOUT_MS): Promise<{ readonly bytes: Uint8Array; readonly contentType: AnalysisImageContentType }> {
  let response: Response;
  try { response = await fetchImpl(`https://api.pexels.com/v1/photos/${assetId}`, { headers: { Authorization: apiKey }, redirect: "error", signal: AbortSignal.timeout(timeoutMs) }); }
  catch { throw new PexelsAnalysisCandidateError("candidate-provider-unavailable"); }
  if (response.status === 404) throw new PexelsAnalysisCandidateError("candidate-not-found");
  if (!response.ok || !response.body) throw new PexelsAnalysisCandidateError("candidate-provider-unavailable");
  if (!validDeclaredLength(response.headers.get("content-length"), 64 * 1024)) throw new PexelsAnalysisCandidateError("candidate-provider-unavailable");
  let photo: PexelsPhotoSource;
  try { photo = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await boundedBytes(response.body, 64 * 1024))) as PexelsPhotoSource; }
  catch { throw new PexelsAnalysisCandidateError("candidate-provider-unavailable"); }
  const source = resolvePexelsImageSource(photo, assetId);
  if (!source) throw new PexelsAnalysisCandidateError("candidate-media-unavailable");
  const downloaded = await download(source.downloadUrl, fetchImpl, timeoutMs);
  const extension = downloaded.contentType === "image/png" ? ".png" : ".jpg";
  try { return Object.freeze({ bytes: downloaded.bytes, contentType: validateAnalysisImage(`candidate${extension}`, downloaded.contentType, downloaded.bytes) }); }
  catch { throw new PexelsAnalysisCandidateError("unsupported-media"); }
}

async function download(initial: string, fetchImpl: typeof fetch, timeoutMs: number): Promise<{ readonly bytes: Uint8Array; readonly contentType: string }> {
  let url = initial;
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    if (!isApprovedPexelsUrl(url, "images.pexels.com")) throw new PexelsAnalysisCandidateError("candidate-media-unavailable");
    let response: Response;
    try { response = await fetchImpl(url, { redirect: "manual", signal: AbortSignal.timeout(timeoutMs) }); }
    catch { throw new PexelsAnalysisCandidateError("candidate-media-unavailable"); }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new PexelsAnalysisCandidateError("candidate-media-unavailable");
      try { url = new URL(location, url).toString(); } catch { throw new PexelsAnalysisCandidateError("candidate-media-unavailable"); }
      continue;
    }
    if (!response.ok || !response.body) throw new PexelsAnalysisCandidateError("candidate-media-unavailable");
    if (!validDeclaredLength(response.headers.get("content-length"), MAX_SEMANTIC_PROVIDER_IMAGE_BYTES)) throw new PexelsAnalysisCandidateError("candidate-media-too-large");
    return Object.freeze({ contentType: response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() ?? "", bytes: await boundedBytes(response.body, MAX_SEMANTIC_PROVIDER_IMAGE_BYTES) });
  }
  throw new PexelsAnalysisCandidateError("candidate-media-unavailable");
}

function validDeclaredLength(value: string | null, maximum: number): boolean {
  if (value === null) return true;
  return /^\d+$/u.test(value) && Number.isSafeInteger(Number(value)) && Number(value) <= maximum;
}

async function boundedBytes(body: ReadableStream<Uint8Array>, max: number): Promise<Uint8Array> {
  const reader = body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const { value, done } = await reader.read(); if (done) break; if (!value) continue; size += value.byteLength; if (size > max) { await reader.cancel(); throw new PexelsAnalysisCandidateError("candidate-media-too-large"); } chunks.push(value); } }
  finally { reader.releaseLock(); }
  if (!size) throw new PexelsAnalysisCandidateError("candidate-media-unavailable");
  const result = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; } return result;
}
