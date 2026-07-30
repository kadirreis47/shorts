import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const { niche, trends } = await req.json();

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
            { role: "system", content: `You are a real-time trend alert AI. Given a niche and current trends, generate urgent alerts for emerging trends with pre-written scripts. Return JSON: {alerts: [{topic, urgency ("low"|"medium"|"high"), suggested_script, suggested_hook, suggested_tags (array), trend_phase}]}. Focus on emerging/rising trends that need immediate action.` },
            { role: "user", content: `Niche: ${niche ?? "general"}\nCurrent trends: ${JSON.stringify(trends ?? [])}` },
          ],
          response_format: { type: "json_object" },
          temperature: 0.8,
        }),
      });
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        const result = JSON.parse(content);
        const alerts = result.alerts ?? [];
        for (const a of alerts) {
          await supabase.from("trend_alerts").insert({
            topic: a.topic, niche, trend_phase: a.trend_phase ?? "emerging", urgency: a.urgency ?? "medium",
            suggested_script: a.suggested_script, suggested_hook: a.suggested_hook, suggested_tags: a.suggested_tags ?? [],
          });
        }
        return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Fallback
    const alerts = [
      { topic: "AI productivity tools surge", urgency: "high", suggested_script: "3 AI tools that will save you hours every day...", suggested_hook: "These AI tools feel illegal to know about", suggested_tags: ["ai", "productivity", "shorts"], trend_phase: "emerging" },
      { topic: "Morning routine renaissance", urgency: "medium", suggested_script: "The 5AM club is back and here's why it works...", suggested_hook: "Why successful people wake up at 5AM", suggested_tags: ["morningroutine", "productivity"], trend_phase: "rising" },
    ];
    return new Response(JSON.stringify({ alerts }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
