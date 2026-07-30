import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const { videoId, testType, variants } = await req.json();

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: apiKeyRow } = await supabase.from("api_keys").select("value").eq("key", "openai").maybeSingle();
    const openaiKey = apiKeyRow?.value;

    // Create A/B test record
    const { data: test } = await supabase.from("ab_tests").insert({
      video_id: videoId, test_type: testType, variants, status: "running",
    }).select().single();

    if (openaiKey) {
      // AI predicts winner based on variant content
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: `You are an A/B testing prediction AI for YouTube Shorts. Given test variants, predict the winner and estimated metrics. Return JSON: {winner_index (0-based), metrics: {estimated_ctr (array per variant), estimated_retention (array per variant), confidence (0-100), reasoning}}.` },
            { role: "user", content: `Test type: ${testType}\nVariants: ${JSON.stringify(variants)}` },
          ],
          response_format: { type: "json_object" },
          temperature: 0.5,
        }),
      });
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        const result = JSON.parse(content);
        await supabase.from("ab_tests").update({
          winner_variant_index: result.winner_index, metrics: result.metrics, status: "completed", completed_at: new Date().toISOString(),
        }).eq("id", test.id);
        return new Response(JSON.stringify({ testId: test.id, ...result }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Fallback: pick first variant as winner
    await supabase.from("ab_tests").update({ winner_variant_index: 0, metrics: { confidence: 50 }, status: "completed", completed_at: new Date().toISOString() }).eq("id", test.id);
    return new Response(JSON.stringify({ testId: test.id, winner_index: 0, metrics: { confidence: 50 } }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
