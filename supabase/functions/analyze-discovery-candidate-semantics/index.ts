import { createClient } from "npm:@supabase/supabase-js@2";
import { authorizeProtectedFunction, jsonResponse, readBoundedJson, safeFailure } from "../_shared/protected-function.ts";
import { createOpenAIVisualSemanticProvider, VisualSemanticProviderError } from "../_shared/openai-visual-semantic-provider.ts";
import { PexelsAnalysisCandidateError, resolvePexelsAnalysisCandidate } from "../_shared/pexels-analysis-candidate.ts";
import { normalizeDiscoveryCandidateSemanticAnalysisRequest, unavailableVisualSemanticAnalysis, VISUAL_SEMANTIC_ANALYSIS_CONTRACT_VERSION } from "../_shared/visual-semantic-analysis.ts";

function diagnostic(status: "start" | "success" | "failure", reason?: string, started?: number): void {
  const elapsed = started === undefined ? undefined : Date.now() - started;
  console.info(JSON.stringify({ event: "edge-function.discovery-candidate-semantic-analysis", provider: "pexels", status, mediaType: "image", contractVersion: VISUAL_SEMANTIC_ANALYSIS_CONTRACT_VERSION, ...(reason ? { reason } : {}), ...(elapsed === undefined ? {} : { latencyClass: elapsed < 2_000 ? "fast" : elapsed < 10_000 ? "normal" : "slow" }) }));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey" } });
  if (req.method !== "POST") return safeFailure("Method not allowed.", 405);
  const started = Date.now();
  try {
    const authorization = await authorizeProtectedFunction(req, "analyze-discovery-candidate-semantics");
    if ("response" in authorization) { diagnostic("failure", "authorization-failed", started); return authorization.response; }
    const parsed = await readBoundedJson<unknown>(req, 8_192);
    if ("response" in parsed) return parsed.response;
    let request; try { request = normalizeDiscoveryCandidateSemanticAnalysisRequest(parsed.value); } catch { diagnostic("failure", "candidate-invalid", started); return safeFailure("Invalid discovery candidate analysis request.", 400); }
    diagnostic("start", undefined, started);
    const url = Deno.env.get("SUPABASE_URL"); const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceRoleKey) return jsonResponse(unavailableVisualSemanticAnalysis("provider-not-configured"));
    const service = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: openAi, error: openAiError } = await service.from("api_keys").select("value").eq("key", "openai").maybeSingle();
    if (openAiError || typeof openAi?.value !== "string" || !openAi.value.trim()) return jsonResponse(unavailableVisualSemanticAnalysis("provider-not-configured"));
    const { data: pexels, error: pexelsError } = await service.from("api_keys").select("value").eq("key", "pexels").maybeSingle();
    if (pexelsError || typeof pexels?.value !== "string" || !pexels.value.trim()) return jsonResponse(unavailableVisualSemanticAnalysis("candidate-provider-not-configured"));
    try {
      const image = await resolvePexelsAnalysisCandidate(request.candidate.providerAssetId, pexels.value);
      const model = Deno.env.get("OPENAI_VISUAL_SEMANTIC_MODEL")?.trim() || "gpt-4.1-mini";
      const observations = await createOpenAIVisualSemanticProvider({ apiKey: openAi.value, model }).analyze({ bytes: image.bytes, contentType: image.contentType, intent: request.intent });
      diagnostic("success", undefined, started);
      return jsonResponse({ status: "evaluated", contractVersion: VISUAL_SEMANTIC_ANALYSIS_CONTRACT_VERSION, observations });
    } catch (error) {
      const reason = error instanceof PexelsAnalysisCandidateError ? error.reason : error instanceof VisualSemanticProviderError ? error.reason : "provider-unavailable";
      diagnostic("failure", reason, started);
      return jsonResponse(unavailableVisualSemanticAnalysis(reason));
    }
  } catch { diagnostic("failure", "provider-unavailable", started); return jsonResponse(unavailableVisualSemanticAnalysis("provider-unavailable")); }
});
