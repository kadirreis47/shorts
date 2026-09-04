import { createClient } from "npm:@supabase/supabase-js@2";
import { getVerifiedUser } from "./verified-user.ts";
import { createProtectedFunctionAuthorizer } from "./protected-function-authorizer.ts";
import { createBoundedJsonReader } from "./bounded-json-reader.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

export const FUNCTION_POLICIES = {
  "provider-status": { operationClass: "low", burstMax: 30, dailyMax: 1_000 },
  "generate-script": { operationClass: "medium", burstMax: 10, dailyMax: 200 },
  "generate-hooks": { operationClass: "medium", burstMax: 10, dailyMax: 200 },
  "generate-seo": { operationClass: "medium", burstMax: 10, dailyMax: 200 },
  "analyze-script": { operationClass: "medium", burstMax: 10, dailyMax: 200 },
  "generate-image": { operationClass: "high", burstMax: 8, dailyMax: 25 },
  "ingest-pexels-image": { operationClass: "high", burstMax: 8, dailyMax: 50 },
  // Research can return up to twelve independent provider identities. Keep the
  // expensive acquisition bucket aligned to that server-enforced batch bound;
  // the daily cap remains the abuse/cost ceiling.
  "ingest-pexels-video": { operationClass: "high", burstMax: 12, dailyMax: 25 },
  // This is not a public function endpoint. It is the authenticated,
  // owner-derived deletion of a previously issued video quarantine object.
  // It never resolves a provider URL, downloads bytes, signs media, or creates
  // canonical storage, so it must not consume an acquisition slot.
  "ingest-pexels-video-cleanup": { operationClass: "low", burstMax: 12, dailyMax: 50 },
  "generate-voiceover": { operationClass: "high", burstMax: 3, dailyMax: 25 },
  "list-voices": { operationClass: "low", burstMax: 30, dailyMax: 1_000 },
  "research-footage": { operationClass: "high", burstMax: 2, dailyMax: 20 },
  "search-images": { operationClass: "medium", burstMax: 10, dailyMax: 200 },
  "search-videos": { operationClass: "medium", burstMax: 10, dailyMax: 200 },
  "translate-subtitles": { operationClass: "medium", burstMax: 10, dailyMax: 200 },
  "visual-query-planner": { operationClass: "medium", burstMax: 6, dailyMax: 80 },
  // Short-lived analysis capabilities may perform one bounded Storage metadata lookup.
  "media-analysis-reference": { operationClass: "low", burstMax: 12, dailyMax: 120 },
  // Owner-bound, byte-derived technical metadata; no paid provider call.
  "resolve-image-display-geometry": { operationClass: "low", burstMax: 12, dailyMax: 120 },
  // Explicit, paid image analysis. One request resolves one already-owned image and makes one provider call.
  "analyze-visual-semantics": { operationClass: "high", burstMax: 2, dailyMax: 20 },
  "analyze-discovery-candidate-semantics": { operationClass: "high", burstMax: 2, dailyMax: 20 },
  "analyze-visual-spatial": { operationClass: "high", burstMax: 2, dailyMax: 20 },
  "analyze-discovery-candidate-spatial": { operationClass: "high", burstMax: 2, dailyMax: 20 },
} as const;

export type ProtectedFunctionName = keyof typeof FUNCTION_POLICIES;

export function safeRequestId(req: Request): string | null {
  const value = req.headers.get("x-request-id") ?? req.headers.get("x-sb-request-id");
  return value && /^[A-Za-z0-9._:-]{1,128}$/.test(value) ? value : null;
}

export function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export const readBoundedJson = createBoundedJsonReader(jsonResponse);

/**
 * Authenticates before any provider/service-role work and atomically consumes a
 * server-owned request slot. The caller never supplies an owner or counter.
 */
const productionAuthorizer = createProtectedFunctionAuthorizer({
  verifyUser: getVerifiedUser,
  getEnvironment: (name) => Deno.env.get(name),
  createServiceClient: (url, serviceRoleKey) => createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }),
  policyFor: (functionName) => FUNCTION_POLICIES[functionName as ProtectedFunctionName],
  respond: jsonResponse,
  requestId: safeRequestId,
  log: (message) => console.error(message),
});

export async function authorizeProtectedFunction(
  req: Request,
  functionName: ProtectedFunctionName,
): Promise<{ ok: true; userId: string } | { ok: false; response: Response }> {
  return productionAuthorizer(req, functionName);
}

export function isBoundedString(value: unknown, maxLength: number, required = false): value is string {
  return typeof value === "string" && (required ? value.trim().length > 0 : true) && value.length <= maxLength;
}

export function safeFailure(error: string, status = 500): Response {
  return jsonResponse({ error }, status);
}
