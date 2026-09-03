import { createClient } from "npm:@supabase/supabase-js@2";
import { authorizeProtectedFunction, jsonResponse, readBoundedJson, safeFailure } from "../_shared/protected-function.ts";
import { issueMediaAnalysisReference, MediaAnalysisReferenceError } from "../_shared/media-analysis-reference-gateway.ts";
import { normalizeOpaqueMediaReferenceRequest } from "../_shared/opaque-media-reference.ts";
import { decodeMediaAnalysisSecret } from "../_shared/media-analysis-reference-crypto.ts";

function diagnostic(status: "issued" | "unavailable", reason?: string): void {
  console.info(JSON.stringify({ event: "edge-function.media-analysis-reference", status, ...(reason ? { reason } : {}) }));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey" } });
  if (req.method !== "POST") return safeFailure("Method not allowed.", 405);
  try {
    const authorization = await authorizeProtectedFunction(req, "media-analysis-reference");
    if ("response" in authorization) { diagnostic("unavailable", "authorization-failed"); return authorization.response; }
    const parsed = await readBoundedJson<unknown>(req, 1_024);
    if ("response" in parsed) { diagnostic("unavailable", "invalid-request"); return parsed.response; }
    let request;
    try { request = normalizeOpaqueMediaReferenceRequest(parsed.value); } catch { diagnostic("unavailable", "invalid-request"); return safeFailure("Invalid media analysis reference request.", 400); }
    const secret = Deno.env.get("MEDIA_ANALYSIS_REFERENCE_SECRET");
    if (!secret) { diagnostic("unavailable", "not-configured"); return safeFailure("Media analysis references are temporarily unavailable.", 503); }
    try { decodeMediaAnalysisSecret(secret); } catch { diagnostic("unavailable", "not-configured"); return safeFailure("Media analysis references are temporarily unavailable.", 503); }
    const url = Deno.env.get("SUPABASE_URL"); const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceRoleKey) { diagnostic("unavailable", "temporarily-unavailable"); return safeFailure("Media analysis references are temporarily unavailable.", 503); }
    const service = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const result = await issueMediaAnalysisReference(service, authorization.userId, request, secret);
    diagnostic("issued");
    return jsonResponse(result);
  } catch (error) {
    const reason = error instanceof MediaAnalysisReferenceError ? error.reason : "unexpected";
    diagnostic("unavailable", reason);
    const status = reason === "media-not-found" ? 404 : reason === "media-not-eligible" ? 403 : reason === "media-too-large" ? 413 : 503;
    return safeFailure("Media analysis reference could not be issued.", status);
  }
});
