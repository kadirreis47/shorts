import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const { script, hook, title, niche, thumbnailText, tags } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: apiKeyRow } = await supabase
      .from("api_keys").select("value").eq("key", "openai").maybeSingle();
    const openaiKey = apiKeyRow?.value;

    if (openaiKey) {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: `You are a viral Shorts prediction AI. Analyze the given video metadata and predict its virality. Return JSON: {virality_confidence (0-100), predicted_views (integer), predicted_engagement_rate (0-100), simulated_retention_curve (array of {second, retention_percent} for 0-60s showing where viewers drop off), drop_off_risks (array of {time_range, reason, severity}), improvement_suggestions (array of {area, suggestion, impact})}. Base predictions on known viral patterns: strong hooks in first 3s, pacing under 12 words/sentence, emotional triggers, clear CTA.` },
            { role: "user", content: `Title: ${title}\nHook: ${hook}\nNiche: ${niche}\nThumbnail text: ${thumbnailText}\nTags: ${JSON.stringify(tags)}\nScript: ${script}` },
          ],
          response_format: { type: "json_object" },
          temperature: 0.7,
        }),
      });
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        const result = JSON.parse(content);
        return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Fallback heuristic
    const wordCount = (script ?? "").split(/\s+/).filter(Boolean).length;
    const hasQuestion = /\?/.test(hook ?? "");
    const hasNumbers = /\d/.test(script ?? "");
    const hookLen = (hook ?? "").length;
    const confidence = Math.min(90, 40 + (hookLen < 100 ? 15 : 5) + (hasQuestion ? 15 : 0) + (hasNumbers ? 10 : 0) + (wordCount < 200 ? 10 : 0));
    const curve = Array.from({ length: 13 }, (_, i) => ({ second: i * 5, retention_percent: Math.max(20, 100 - i * 6 - (i > 8 ? 5 : 0)) }));
    return new Response(JSON.stringify({
      virality_confidence: confidence,
      predicted_views: Math.round(confidence * 1000),
      predicted_engagement_rate: Math.round(confidence * 0.4),
      simulated_retention_curve: curve,
      drop_off_risks: [{ time_range: "0-3s", reason: "Hook may not be strong enough", severity: "medium" }, { time_range: "30-40s", reason: "Potential pacing drop", severity: "low" }],
      improvement_suggestions: [{ area: "hook", suggestion: "Make the first 3 seconds more visually dynamic", impact: "high" }, { area: "pacing", suggestion: "Add a pattern interrupt at the 15-second mark", impact: "medium" }],
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
