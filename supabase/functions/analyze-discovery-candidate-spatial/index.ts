import { createClient } from "npm:@supabase/supabase-js@2";
import { authorizeProtectedFunction, jsonResponse, readBoundedJson, safeFailure } from "../_shared/protected-function.ts";
import { createOpenAIVisualSpatialProvider, VisualSpatialProviderError } from "../_shared/openai-visual-spatial-provider.ts";
import { PexelsAnalysisCandidateError, resolvePexelsAnalysisCandidate } from "../_shared/pexels-analysis-candidate.ts";
import { evaluatedVisualSpatialAnalysis, normalizeAnalyzerVersion, normalizeDiscoveryCandidateSpatialAnalysisRequest, unavailableVisualSpatialAnalysis, VISUAL_SPATIAL_ANALYSIS_CONTRACT_VERSION } from "../_shared/visual-spatial-analysis.ts";

function diagnostic(status: "start" | "success" | "failure", reason?: string, started?: number): void {
  const elapsed = started === undefined ? undefined : Date.now() - started;
  console.info(JSON.stringify({ event: "edge-function.discovery-candidate-spatial-analysis", provider: "pexels", status, mediaType: "image", contractVersion: VISUAL_SPATIAL_ANALYSIS_CONTRACT_VERSION, ...(reason ? { reason } : {}), ...(elapsed === undefined ? {} : { latencyClass: elapsed < 2_000 ? "fast" : elapsed < 10_000 ? "normal" : "slow" }) }));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey" } });
  if (req.method !== "POST") return safeFailure("Method not allowed.", 405);
  const started = Date.now();
  try {
    const authorization = await authorizeProtectedFunction(req, "analyze-discovery-candidate-spatial");
    if ("response" in authorization) { diagnostic("failure", "authorization-failed", started); return authorization.response; }
    const parsed = await readBoundedJson<unknown>(req, 2_048);
    if ("response" in parsed) return parsed.response;
    let request; try { request = normalizeDiscoveryCandidateSpatialAnalysisRequest(parsed.value); } catch { diagnostic("failure", "candidate-invalid", started); return safeFailure("Invalid discovery candidate spatial analysis request.", 400); }
    diagnostic("start", undefined, started);
    const url = Deno.env.get("SUPABASE_URL"); const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceRoleKey) return jsonResponse(unavailableVisualSpatialAnalysis("provider-not-configured"));
    const service = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: openAi, error: openAiError } = await service.from("api_keys").select("value").eq("key", "openai").maybeSingle();
    if (openAiError || typeof openAi?.value !== "string" || !openAi.value.trim()) return jsonResponse(unavailableVisualSpatialAnalysis("provider-not-configured"));
    const { data: pexels, error: pexelsError } = await service.from("api_keys").select("value").eq("key", "pexels").maybeSingle();
    if (pexelsError || typeof pexels?.value !== "string" || !pexels.value.trim()) return jsonResponse(unavailableVisualSpatialAnalysis("candidate-provider-not-configured"));
    const model = Deno.env.get("OPENAI_VISUAL_SPATIAL_MODEL")?.trim() || "gpt-4.1-mini";
    let analyzerVersion: string; try { analyzerVersion = normalizeAnalyzerVersion(`openai:${model}`); } catch { return jsonResponse(unavailableVisualSpatialAnalysis("provider-not-configured")); }
    try {
      const image = await resolvePexelsAnalysisCandidate(request.candidate.providerAssetId, pexels.value);
      const evidence = await createOpenAIVisualSpatialProvider({ apiKey: openAi.value, model }).analyze({ bytes: image.bytes, contentType: image.contentType });
      diagnostic("success", undefined, started);
      return jsonResponse(evaluatedVisualSpatialAnalysis({ analyzerVersion, sourceDimensions: { width: image.width, height: image.height }, evidence }));
    } catch (error) {
      const reason = error instanceof PexelsAnalysisCandidateError ? error.reason : error instanceof VisualSpatialProviderError ? error.reason : "provider-unavailable";
      diagnostic("failure", reason, started);
      return jsonResponse(unavailableVisualSpatialAnalysis(reason));
    }
  } catch { diagnostic("failure", "provider-unavailable", started); return jsonResponse(unavailableVisualSpatialAnalysis("provider-unavailable")); }
});
