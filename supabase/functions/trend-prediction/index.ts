import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const { niche } = await req.json();

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
            { role: "system", content: `You are a trend prediction AI for YouTube Shorts. Given a niche, predict 10 trending topics and their lifecycle phase. Return JSON: {trends: [{topic, phase ("emerging"|"rising"|"peaking"|"declining"), growth_rate (percentage), predicted_peak_date (YYYY-MM-DD), recommended_action, urgency ("low"|"medium"|"high")}]}. Focus on topics that are emerging or rising but not yet peaked.` },
            { role: "user", content: `Niche: ${niche ?? "general"}` },
          ],
          response_format: { type: "json_object" },
          temperature: 0.8,
        }),
      });
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        const result = JSON.parse(content);
        return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Fallback
    const trends = ["AI tools", "Productivity hacks", "Mindset shifts", "Passive income", "Morning routines", "Book summaries", "Life lessons", "Tech reviews", "Fitness tips", "Cooking hacks"].map((topic, i) => ({
      topic, phase: i < 3 ? "emerging" : i < 7 ? "rising" : "peaking",
      growth_rate: 15 + i * 3,
      predicted_peak_date: new Date(Date.now() + (i + 1) * 7 * 86400000).toISOString().split("T")[0],
      recommended_action: i < 3 ? "Publish immediately" : i < 7 ? "Publish this week" : "Monitor closely",
      urgency: i < 3 ? "high" : i < 7 ? "medium" : "low",
    }));
    return new Response(JSON.stringify({ trends }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
