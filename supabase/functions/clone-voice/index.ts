import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const { name, sampleAudioUrl, language } = await req.json();

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Create voice clone record
    const { data: clone } = await supabase.from("voice_clones").insert({
      name, sample_audio_url: sampleAudioUrl, status: "training", language: language ?? "en",
    }).select().single();

    // In production, this would call ElevenLabs API to clone the voice.
    // For now, we simulate the training process.
    setTimeout(() => {
      supabase.from("voice_clones").update({ status: "ready", clone_id: `clone_${clone.id.slice(0, 8)}` }).eq("id", clone.id);
    }, 3000);

    return new Response(JSON.stringify({ cloneId: clone.id, status: "training", message: "Voice clone training started. This usually takes 30-60 seconds." }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
