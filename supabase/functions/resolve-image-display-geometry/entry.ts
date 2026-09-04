import { createBoundedJsonReader } from "../_shared/bounded-json-reader.ts";
import { createProtectedFunctionAuthorizer } from "../_shared/protected-function-authorizer.ts";
import { createVerifiedUserVerifier } from "../_shared/verified-user-verifier.ts";
import { resolveMediaAnalysisReference, MediaAnalysisReferenceError } from "../_shared/media-analysis-reference-gateway.ts";
import { decodeMediaAnalysisSecret } from "../_shared/media-analysis-reference-crypto.ts";
import { createResolveImageDisplayGeometryEndpoint } from "../_shared/resolve-image-display-geometry-endpoint.ts";

interface SupabaseClient {
  readonly auth: { getUser(token: string): Promise<{ data: { user?: { id?: string } | null }; error: { status?: number } | null }> };
  rpc(name: "consume_edge_function_quota", args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: unknown } | null }>;
  readonly storage: { from(bucket: string): { info(path: string): Promise<{ data: Record<string, unknown> | null; error: unknown }> } };
}

export interface ResolveImageDisplayGeometryProductionRuntime {
  readonly deno: { readonly env: { get(name: string): string | undefined } };
  readonly createClient: (url: string, key: string, options: { auth: { persistSession: false; autoRefreshToken: false } }) => SupabaseClient;
  readonly console: { error(message: string): void };
  readonly now?: () => number;
}

let runtime: ResolveImageDisplayGeometryProductionRuntime | null = null;

export function installResolveImageDisplayGeometryProductionRuntime(value: ResolveImageDisplayGeometryProductionRuntime): void {
  if (!value?.deno?.env?.get || typeof value.createClient !== "function" || typeof value.console?.error !== "function") {
    throw new TypeError("Resolve image display geometry runtime is unavailable.");
  }
  runtime = value;
}

function currentRuntime(): ResolveImageDisplayGeometryProductionRuntime {
  if (!runtime) throw new Error("Resolve image display geometry runtime is unavailable.");
  return runtime;
}

const clientOptions = { auth: { persistSession: false as const, autoRefreshToken: false as const } };
const getEnvironment = (name: string) => currentRuntime().deno.env.get(name);
const createRuntimeClient = (url: string, key: string) => currentRuntime().createClient(url, key, clientOptions);
const verifyUser = createVerifiedUserVerifier({ getEnvironment, createAuthClient: createRuntimeClient });
const respond = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
    "Content-Type": "application/json",
  },
});
const requestId = (req: Request) => {
  const value = req.headers.get("x-request-id") ?? req.headers.get("x-sb-request-id");
  return value && /^[A-Za-z0-9._:-]{1,128}$/.test(value) ? value : null;
};
const authorize = createProtectedFunctionAuthorizer({
  verifyUser,
  getEnvironment,
  createServiceClient: createRuntimeClient,
  policyFor: () => ({ burstMax: 12, dailyMax: 120 }),
  respond,
  requestId,
  log: (message) => currentRuntime().console.error(message),
});

async function resolveReference(userId: string, reference: string) {
  const url = getEnvironment("SUPABASE_URL");
  const serviceRoleKey = getEnvironment("SUPABASE_SERVICE_ROLE_KEY");
  const secret = getEnvironment("MEDIA_ANALYSIS_REFERENCE_SECRET");
  if (!url || !serviceRoleKey || !secret) throw new MediaAnalysisReferenceError("temporarily-unavailable");
  try { decodeMediaAnalysisSecret(secret); } catch { throw new MediaAnalysisReferenceError("temporarily-unavailable"); }
  const service = createRuntimeClient(url, serviceRoleKey);
  return resolveMediaAnalysisReference(service, { supabaseUrl: url, serviceRoleKey }, userId, reference, "image-display-geometry", secret, currentRuntime().now?.() ?? Date.now());
}

/** Singleton composition imported by index.ts and invoked directly by behavioral tests. */
export const productionHandleRequest = createResolveImageDisplayGeometryEndpoint({
  authorize: (req) => authorize(req, "resolve-image-display-geometry"),
  readJson: createBoundedJsonReader(respond),
  resolveReference,
});
