import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  try {
    const { videoId, originalTitle, niche } = await req.json();

    const powerWords = ["Ultimate", "Secret", "Proven", "Insane", "Nobody", "Actually", "Shocking", "Game-Changing"];
    const triggers = ["curiosity", "fear of missing out", "aspiration", "controversy", "social proof"];

    const alternatives = Array.from({ length: 5 }, (_, i) => {
      const pw = powerWords[i % powerWords.length];
      const trigger = triggers[i % triggers.length];
      return {
        title: `${pw} ${originalTitle} ${i === 0 ? "Guide" : i === 1 ? "Tips" : i === 2 ? "Secrets" : i === 3 ? "Hacks" : "Mistakes"}`,
        trigger,
        ctr_estimate: Math.round((Math.random() * 4 + 6) * 100) / 100,
        seo_score: Math.floor(Math.random() * 20) + 75,
      };
    });

    const optimized = alternatives[0].title;
    const result = {
      id: crypto.randomUUID(),
      video_id: videoId || crypto.randomUUID(),
      original_title: originalTitle,
      optimized_title: optimized,
      alternative_titles: alternatives,
      ctr_prediction: alternatives[0].ctr_estimate,
      seo_score: alternatives[0].seo_score,
      emotional_trigger: alternatives[0].trigger,
      power_words: powerWords.slice(0, 3),
      character_count: optimized.length,
      created_at: new Date().toISOString(),
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
