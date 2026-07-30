import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const { videoId, retentionData, scenes } = await req.json();

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: apiKeyRow } = await supabase.from("api_keys").select("value").eq("key", "openai").maybeSingle();
    const openaiKey = apiKeyRow?.value;

    // If no retention data provided, simulate it
    const curve = retentionData ?? Array.from({ length: 13 }, (_, i) => ({
      second: i * 5, retention_percent: Math.max(25, 100 - i * 5 - (i > 6 ? 8 : 0)),
    }));

    const dropOffs = curve.filter((p: any, i: number) => i > 0 && curve[i - 1].retention_percent - p.retention_percent > 8)
      .map((p: any) => ({ second: p.second, drop: curve[curve.indexOf(p) - 1]?.retention_percent - p.rentention_percent }));

    if (openaiKey) {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: `You are a retention analysis AI. Given a retention curve and video scenes, analyze where viewers drop off and why. Return JSON: {analysis: {overall_retention, best_moment: {start, end, reason}, worst_moment: {start, end, reason}, drop_off_points: [{time, severity, likely_cause, fix_suggestion}]}}. Be specific about what in the content caused each drop.` },
            { role: "user", content: `Retention curve: ${JSON.stringify(curve)}\nScenes: ${JSON.stringify(scenes?.map((s: any, i: number) => ({ index: i, start: i * 10, text: s.narration ?? s.text })))}` },
          ],
          response_format: { type: "json_object" },
          temperature: 0.5,
        }),
      });
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        const result = JSON.parse(content);
        const analysis = result.analysis ?? {};
        if (videoId) {
          await supabase.from("retention_replays").insert({
            video_id: videoId, retention_curve: curve, drop_off_points: analysis.drop_off_points ?? [],
            ai_analysis: analysis, average_retention: analysis.overall_retention,
            best_moment_start: analysis.best_moment?.start, best_moment_end: analysis.best_moment?.end,
            worst_moment_start: analysis.worst_moment?.start, worst_moment_end: analysis.worst_moment?.end,
          });
        }
        return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Fallback
    const avgRetention = curve.reduce((sum: number, p: any) => sum + p.retention_percent, 0) / curve.length;
    return new Response(JSON.stringify({
      analysis: {
        overall_retention: Math.round(avgRetention),
        best_moment: { start: 0, end: 5, reason: "Strong hook with high initial attention" },
        worst_moment: { start: 30, end: 40, reason: "Pacing drops, content becomes repetitive" },
        drop_off_points: [{ time: 15, severity: "medium", likely_cause: "Pacing slows down", fix_suggestion: "Add a pattern interrupt or visual change" }, { time: 40, severity: "high", likely_cause: "Content loses momentum", fix_suggestion: "Introduce a new sub-topic or twist" }],
      },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
