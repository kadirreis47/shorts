import { createClient } from "npm:@supabase/supabase-js@2";
import { authorizeProtectedFunction, jsonResponse, readBoundedJson, safeFailure } from "../_shared/protected-function.ts";
import { resolveMediaAnalysisReference, MediaAnalysisReferenceError } from "../_shared/media-analysis-reference-gateway.ts";
import { decodeMediaAnalysisSecret } from "../_shared/media-analysis-reference-crypto.ts";
import { createOpenAIVisualSemanticProvider, MAX_SEMANTIC_PROVIDER_IMAGE_BYTES, VisualSemanticProviderError } from "../_shared/openai-visual-semantic-provider.ts";
import { normalizeVisualSemanticAnalysisRequest, unavailableVisualSemanticAnalysis, VISUAL_SEMANTIC_ANALYSIS_CONTRACT_VERSION, type VisualSemanticAnalysisReason } from "../_shared/visual-semantic-analysis.ts";

function diagnostic(status: "start" | "success" | "failure", reason?: string, startedAt?: number): void {
  const elapsed = startedAt === undefined ? undefined : Date.now() - startedAt;
  console.info(JSON.stringify({ event: "edge-function.visual-semantic-analysis", status, mediaType: "image", contractVersion: VISUAL_SEMANTIC_ANALYSIS_CONTRACT_VERSION, ...(reason ? { reason } : {}), ...(elapsed === undefined ? {} : { latencyClass: elapsed < 2_000 ? "fast" : elapsed < 10_000 ? "normal" : "slow" }) }));
}

function mediaReason(error: MediaAnalysisReferenceError): VisualSemanticAnalysisReason {
  if (error.reason === "expired-reference") return "expired-reference";
  if (error.reason === "unsupported-media-type" || error.reason === "media-too-large") return "unsupported-media";
  return "invalid-reference";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey" } });
  if (req.method !== "POST") return safeFailure("Method not allowed.", 405);
  const startedAt = Date.now();
  try {
    const authorization = await authorizeProtectedFunction(req, "analyze-visual-semantics");
    if ("response" in authorization) { diagnostic("failure", "authorization-failed", startedAt); return authorization.response; }
    const parsed = await readBoundedJson<unknown>(req, 8_192);
    if ("response" in parsed) { diagnostic("failure", "invalid-request", startedAt); return parsed.response; }
    let request; try { request = normalizeVisualSemanticAnalysisRequest(parsed.value); } catch { diagnostic("failure", "invalid-request", startedAt); return safeFailure("Invalid visual semantic analysis request.", 400); }
    diagnostic("start", undefined, startedAt);
    const url = Deno.env.get("SUPABASE_URL"); const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); const referenceSecret = Deno.env.get("MEDIA_ANALYSIS_REFERENCE_SECRET");
    if (!url || !serviceRoleKey || !referenceSecret) { diagnostic("failure", "provider-not-configured", startedAt); return jsonResponse(unavailableVisualSemanticAnalysis("provider-not-configured")); }
    try { decodeMediaAnalysisSecret(referenceSecret); } catch { diagnostic("failure", "provider-not-configured", startedAt); return jsonResponse(unavailableVisualSemanticAnalysis("provider-not-configured")); }
    const service = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    // Avoid any media read when the paid provider is unavailable.
    const { data: keyRow, error: keyError } = await service.from("api_keys").select("value").eq("key", "openai").maybeSingle();
    const model = Deno.env.get("OPENAI_VISUAL_SEMANTIC_MODEL")?.trim() || "gpt-4.1-mini";
    if (keyError || typeof keyRow?.value !== "string" || !keyRow.value.trim()) { diagnostic("failure", "provider-not-configured", startedAt); return jsonResponse(unavailableVisualSemanticAnalysis("provider-not-configured")); }
    let resolved;
    try { resolved = await resolveMediaAnalysisReference(service, { supabaseUrl: url, serviceRoleKey }, authorization.userId, request.reference, "semantic-image-analysis", referenceSecret); }
    catch (error) { const reason = error instanceof MediaAnalysisReferenceError ? mediaReason(error) : "invalid-reference"; diagnostic("failure", reason, startedAt); return jsonResponse(unavailableVisualSemanticAnalysis(reason)); }
    if (resolved.bytes.byteLength > MAX_SEMANTIC_PROVIDER_IMAGE_BYTES) {
      diagnostic("failure", "unsupported-media", startedAt);
      return jsonResponse(unavailableVisualSemanticAnalysis("unsupported-media"));
    }
    try {
      const observations = await createOpenAIVisualSemanticProvider({ apiKey: keyRow.value, model }).analyze({ bytes: resolved.bytes, contentType: resolved.contentType, intent: request.intent });
      diagnostic("success", undefined, startedAt);
      return jsonResponse({ status: "evaluated", contractVersion: VISUAL_SEMANTIC_ANALYSIS_CONTRACT_VERSION, observations });
    } catch (error) {
      const reason = error instanceof VisualSemanticProviderError ? error.reason : "provider-unavailable";
      diagnostic("failure", reason, startedAt);
      return jsonResponse(unavailableVisualSemanticAnalysis(reason));
    }
  } catch {
    diagnostic("failure", "provider-unavailable", startedAt);
    return jsonResponse(unavailableVisualSemanticAnalysis("provider-unavailable"));
  }
});
