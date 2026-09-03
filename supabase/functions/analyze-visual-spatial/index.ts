import { createClient } from "npm:@supabase/supabase-js@2";
import { authorizeProtectedFunction, jsonResponse, readBoundedJson, safeFailure } from "../_shared/protected-function.ts";
import { resolveMediaAnalysisReference, MediaAnalysisReferenceError } from "../_shared/media-analysis-reference-gateway.ts";
import { decodeMediaAnalysisSecret } from "../_shared/media-analysis-reference-crypto.ts";
import { createOpenAIVisualSpatialProvider, MAX_SPATIAL_PROVIDER_IMAGE_BYTES, VisualSpatialProviderError } from "../_shared/openai-visual-spatial-provider.ts";
import { evaluatedVisualSpatialAnalysis, normalizeAnalyzerVersion, normalizeVisualSpatialAnalysisRequest, unavailableVisualSpatialAnalysis, VISUAL_SPATIAL_ANALYSIS_CONTRACT_VERSION, type VisualSpatialAnalysisReason } from "../_shared/visual-spatial-analysis.ts";

function diagnostic(status: "start" | "success" | "failure", reason?: string, startedAt?: number): void {
  const elapsed = startedAt === undefined ? undefined : Date.now() - startedAt;
  console.info(JSON.stringify({ event: "edge-function.visual-spatial-analysis", status, mediaType: "image", contractVersion: VISUAL_SPATIAL_ANALYSIS_CONTRACT_VERSION, ...(reason ? { reason } : {}), ...(elapsed === undefined ? {} : { latencyClass: elapsed < 2_000 ? "fast" : elapsed < 10_000 ? "normal" : "slow" }) }));
}
function mediaReason(error: MediaAnalysisReferenceError): VisualSpatialAnalysisReason {
  if (error.reason === "expired-reference") return "expired-reference";
  if (error.reason === "unsupported-media-type" || error.reason === "media-too-large") return "unsupported-media";
  return "invalid-reference";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey" } });
  if (req.method !== "POST") return safeFailure("Method not allowed.", 405);
  const startedAt = Date.now();
  try {
    const authorization = await authorizeProtectedFunction(req, "analyze-visual-spatial");
    if ("response" in authorization) { diagnostic("failure", "authorization-failed", startedAt); return authorization.response; }
    const parsed = await readBoundedJson<unknown>(req, 2_048);
    if ("response" in parsed) { diagnostic("failure", "invalid-request", startedAt); return parsed.response; }
    let request; try { request = normalizeVisualSpatialAnalysisRequest(parsed.value); } catch { diagnostic("failure", "invalid-request", startedAt); return safeFailure("Invalid visual spatial analysis request.", 400); }
    diagnostic("start", undefined, startedAt);
    const url = Deno.env.get("SUPABASE_URL"); const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); const referenceSecret = Deno.env.get("MEDIA_ANALYSIS_REFERENCE_SECRET");
    if (!url || !serviceRoleKey || !referenceSecret) return jsonResponse(unavailableVisualSpatialAnalysis("provider-not-configured"));
    try { decodeMediaAnalysisSecret(referenceSecret); } catch { return jsonResponse(unavailableVisualSpatialAnalysis("provider-not-configured")); }
    const service = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: keyRow, error: keyError } = await service.from("api_keys").select("value").eq("key", "openai").maybeSingle();
    const model = Deno.env.get("OPENAI_VISUAL_SPATIAL_MODEL")?.trim() || "gpt-4.1-mini";
    let analyzerVersion: string; try { analyzerVersion = normalizeAnalyzerVersion(`openai:${model}`); } catch { return jsonResponse(unavailableVisualSpatialAnalysis("provider-not-configured")); }
    if (keyError || typeof keyRow?.value !== "string" || !keyRow.value.trim()) return jsonResponse(unavailableVisualSpatialAnalysis("provider-not-configured"));
    let resolved;
    try { resolved = await resolveMediaAnalysisReference(service, { supabaseUrl: url, serviceRoleKey }, authorization.userId, request.reference, "spatial-image-analysis", referenceSecret); }
    catch (error) { const reason = error instanceof MediaAnalysisReferenceError ? mediaReason(error) : "invalid-reference"; diagnostic("failure", reason, startedAt); return jsonResponse(unavailableVisualSpatialAnalysis(reason)); }
    if (resolved.bytes.byteLength > MAX_SPATIAL_PROVIDER_IMAGE_BYTES) return jsonResponse(unavailableVisualSpatialAnalysis("unsupported-media"));
    try {
      const evidence = await createOpenAIVisualSpatialProvider({ apiKey: keyRow.value, model }).analyze({ bytes: resolved.bytes, contentType: resolved.contentType });
      diagnostic("success", undefined, startedAt);
      return jsonResponse(evaluatedVisualSpatialAnalysis({ analyzerVersion, sourceDimensions: { width: resolved.width, height: resolved.height }, evidence }));
    } catch (error) {
      const reason = error instanceof VisualSpatialProviderError ? error.reason : "provider-unavailable";
      diagnostic("failure", reason, startedAt);
      return jsonResponse(unavailableVisualSpatialAnalysis(reason));
    }
  } catch { diagnostic("failure", "provider-unavailable", startedAt); return jsonResponse(unavailableVisualSpatialAnalysis("provider-unavailable")); }
});
