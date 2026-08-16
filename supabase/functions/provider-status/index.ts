import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { PROVIDER_KEYS, providerStatusFromRows } from "./status.ts";
import { authorizeProtectedFunction } from "../_shared/protected-function.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "GET") return response({ error: "Method not allowed." }, 405);

  const authorization = await authorizeProtectedFunction(req, "provider-status");
  if ("response" in authorization) return authorization.response;

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) return response({ error: "Provider status is unavailable." }, 503);

  try {
    const supabase = createClient(url, serviceRoleKey);
    const { data, error } = await supabase
      .from("api_keys")
      .select("key,value")
      .in("key", PROVIDER_KEYS);
    if (error) return response({ error: "Provider status is unavailable." }, 503);

    return response(providerStatusFromRows(data ?? []));
  } catch {
    return response({ error: "Provider status is unavailable." }, 503);
  }
});
