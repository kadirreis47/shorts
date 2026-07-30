import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const LANGUAGES: Record<string, string> = {
  es: "Spanish", fr: "French", de: "German", pt: "Portuguese", it: "Italian",
  ja: "Japanese", ko: "Korean", zh: "Chinese (Simplified)", ar: "Arabic", hi: "Hindi", ru: "Russian", tr: "Turkish", nl: "Dutch", pl: "Polish",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const { script, targetLanguages, videoId } = await req.json();

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: apiKeyRow } = await supabase.from("api_keys").select("value").eq("key", "openai").maybeSingle();
    const openaiKey = apiKeyRow?.value;

    const { data: job } = await supabase.from("dub_jobs").insert({
      video_id: videoId, target_languages: targetLanguages, status: "dubbing",
    }).select().single();

    const results: Record<string, string> = {};

    for (const langCode of targetLanguages) {
      const langName = LANGUAGES[langCode] ?? langCode;
      if (openaiKey) {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: `You are a professional voice dubbing translator. Translate the script into ${langName} for voice-over. Keep it natural, conversational, and matching the original tone. Return the translated script as a plain string.` },
              { role: "user", content: script },
            ],
            temperature: 0.3,
          }),
        });
        const data = await response.json();
        const translated = data.choices?.[0]?.message?.content;
        if (translated) results[langCode] = translated;
      } else {
        results[langCode] = `[${langName} translation of: ${script.slice(0, 200)}...]`;
      }
    }

    await supabase.from("dub_jobs").update({
      completed_languages: Object.keys(results), status: "ready",
    }).eq("id", job.id);

    return new Response(JSON.stringify({ jobId: job.id, dubs: results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
