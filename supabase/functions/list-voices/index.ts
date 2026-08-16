import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { authorizeProtectedFunction, safeFailure } from "../_shared/protected-function.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "GET") return safeFailure("Method not allowed.", 405);

  try {
    const authorization = await authorizeProtectedFunction(req, "list-voices");
    if ("response" in authorization) return authorization.response;
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: apiKeyRow } = await supabase
      .from("api_keys")
      .select("value")
      .eq("key", "elevenlabs")
      .maybeSingle();

    const elevenlabsKey = apiKeyRow?.value;
    if (!elevenlabsKey) {
      return new Response(
        JSON.stringify({ error: "ElevenLabs API key not configured" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const response = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": elevenlabsKey },
    });

    if (!response.ok) {
      console.error(JSON.stringify({ event: "edge-function.provider-failure", functionName: "list-voices", providerStatus: response.status }));
      return safeFailure("Voice provider is temporarily unavailable.", 502);
    }

    const data = await response.json();
    const voices = (data.voices ?? []).map((v: { voice_id: string; name: string; category?: string; description?: string; preview_url?: string }) => ({
      voice_id: v.voice_id,
      name: v.name,
      category: v.category,
      description: v.description,
      preview_url: v.preview_url,
    }));

    return new Response(JSON.stringify({ voices }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch {
    return safeFailure("Voice list could not be loaded.", 500);
  }
});
