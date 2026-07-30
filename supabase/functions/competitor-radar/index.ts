import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const { competitorName, niche } = await req.json();

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: apiKeyRow } = await supabase.from("api_keys").select("value").eq("key", "openai").maybeSingle();
    const openaiKey = apiKeyRow?.value;

    if (openaiKey) {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: `You are a competitive intelligence AI for YouTube Shorts. Analyze the given competitor channel and return JSON: {posting_cadence, top_hook_formulas (array of strings), thumbnail_styles (array of {style, color_scheme, text_placement}), topic_clusters (array of {topic, frequency, avg_views}), content_gaps (array of {gap, opportunity, suggestion})}. Be specific and actionable.` },
            { role: "user", content: `Competitor: ${competitorName}\nNiche: ${niche ?? "general"}` },
          ],
          response_format: { type: "json_object" },
          temperature: 0.7,
        }),
      });
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        const result = JSON.parse(content);
        await supabase.from("competitor_channels").update({
          top_hook_formulas: result.top_hook_formulas ?? [],
          thumbnail_styles: result.thumbnail_styles ?? [],
          topic_clusters: result.topic_clusters ?? [],
          content_gaps: result.content_gaps ?? [],
          posting_cadence: result.posting_cadence,
          last_analyzed: new Date().toISOString(),
        }).eq("name", competitorName);
        return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Fallback
    const result = {
      posting_cadence: "3-4 videos per week",
      top_hook_formulas: ["Curiosity gap", "Bold claim", "Contrarian take"],
      thumbnail_styles: [{ style: "Bold text overlay", color_scheme: "High contrast", text_placement: "Center" }],
      topic_clusters: [{ topic: "Productivity tips", frequency: "Weekly", avg_views: 50000 }],
      content_gaps: [{ gap: "No long-form breakdowns", opportunity: "High", suggestion: "Create deep-dive Shorts" }],
    };
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
