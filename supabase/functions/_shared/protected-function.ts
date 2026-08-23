import { createClient } from "npm:@supabase/supabase-js@2";
import { getVerifiedUser } from "./verified-user.ts";

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
} as const;

export type ProtectedFunctionName = keyof typeof FUNCTION_POLICIES;

function safeRequestId(req: Request): string | null {
  const value = req.headers.get("x-request-id") ?? req.headers.get("x-sb-request-id");
  return value && /^[A-Za-z0-9._:-]{1,128}$/.test(value) ? value : null;
}

export function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export async function readBoundedJson<T extends object>(
  req: Request,
  maxBytes: number,
): Promise<{ ok: true; value: T } | { ok: false; response: Response }> {
  if (!req.body) return { ok: false, response: jsonResponse({ error: "Invalid request body." }, 400) };

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return { ok: false, response: jsonResponse({ error: "Request body is too large." }, 413) };
      }
      chunks.push(value);
    }

    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, response: jsonResponse({ error: "Invalid request body." }, 400) };
    }
    return { ok: true, value: parsed as T };
  } catch {
    return { ok: false, response: jsonResponse({ error: "Invalid request body." }, 400) };
  } finally {
    reader.releaseLock();
  }
}

/**
 * Authenticates before any provider/service-role work and atomically consumes a
 * server-owned request slot. The caller never supplies an owner or counter.
 */
export async function authorizeProtectedFunction(
  req: Request,
  functionName: ProtectedFunctionName,
): Promise<{ ok: true; userId: string } | { ok: false; response: Response }> {
  const verifiedUser = await getVerifiedUser(req);
  if ("error" in verifiedUser) {
    return { ok: false, response: jsonResponse({ error: verifiedUser.error }, verifiedUser.status) };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return { ok: false, response: jsonResponse({ error: "Service is temporarily unavailable." }, 503) };
  }

  const limit = FUNCTION_POLICIES[functionName];
  try {
    const service = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await service.rpc("consume_edge_function_quota", {
      p_user_id: verifiedUser.userId,
      p_function_name: functionName,
      p_burst_window_seconds: 60,
      p_burst_max_requests: limit.burstMax,
      p_daily_max_requests: limit.dailyMax,
    });
    if (error || data !== true) {
      if (error) {
        console.error(JSON.stringify({
          event: "edge-function.quota-error",
          functionName,
          code: typeof error.code === "string" ? error.code : "UNKNOWN",
          requestId: safeRequestId(req),
        }));
        return { ok: false, response: jsonResponse({ error: "Service is temporarily unavailable." }, 503) };
      }
      return { ok: false, response: jsonResponse({ error: "Request limit reached. Please try again shortly." }, 429) };
    }
  } catch {
    return { ok: false, response: jsonResponse({ error: "Service is temporarily unavailable." }, 503) };
  }

  return { ok: true, userId: verifiedUser.userId };
}

export function isBoundedString(value: unknown, maxLength: number, required = false): value is string {
  return typeof value === "string" && (required ? value.trim().length > 0 : true) && value.length <= maxLength;
}

export function safeFailure(error: string, status = 500): Response {
  return jsonResponse({ error }, status);
}
