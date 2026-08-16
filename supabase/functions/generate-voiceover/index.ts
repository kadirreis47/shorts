import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { authorizeProtectedFunction, isBoundedString, readBoundedJson, safeFailure } from "../_shared/protected-function.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface VoiceoverRequest { text?: unknown; voiceId?: unknown }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") return safeFailure("Method not allowed.", 405);

  try {
    const authorization = await authorizeProtectedFunction(req, "generate-voiceover");
    if ("response" in authorization) return authorization.response;

    const parsedBody = await readBoundedJson<VoiceoverRequest>(req, 16_384);
    if ("response" in parsedBody) return parsedBody.response;
    const { text, voiceId } = parsedBody.value;
    if (!isBoundedString(text, 5_000, true)
      || (typeof voiceId !== "undefined" && (!isBoundedString(voiceId, 128, true) || !/^[A-Za-z0-9_-]+$/.test(voiceId)))) {
      return safeFailure("Invalid voice generation request.", 400);
    }

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
        JSON.stringify({ error: "Voice generation is not configured. Contact an administrator." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const voice = voiceId || "21m00Tcm4TlvDq8ikWAM";

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": elevenlabsKey,
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_turbo_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.3,
            use_speaker_boost: true,
          },
        }),
      },
    );

    if (!response.ok) {
      console.error(JSON.stringify({ event: "edge-function.provider-failure", functionName: "generate-voiceover", providerStatus: response.status }));
      return safeFailure("Voice provider is temporarily unavailable.", 502);
    }

    const audioBuffer = await response.arrayBuffer();
    const base64Audio = btoa(
      String.fromCharCode(...new Uint8Array(audioBuffer)),
    );

    return new Response(
      JSON.stringify({ audio: base64Audio, format: "mp3" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch {
    return safeFailure("Voice generation could not be completed.", 500);
  }
});
