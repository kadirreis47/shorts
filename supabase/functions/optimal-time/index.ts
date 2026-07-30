import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const { channelId, historicalData } = await req.json();

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: apiKeyRow } = await supabase.from("api_keys").select("value").eq("key", "openai").maybeSingle();
    const openaiKey = apiKeyRow?.value;

    if (openaiKey && historicalData) {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: `You are an AI scheduling optimizer for YouTube Shorts. Analyze historical posting data and audience activity to find optimal posting times. Return JSON: {optimal_slots: [{day_of_week (0-6), optimal_hour (0-23), confidence_score (0-100), reason}], timezone, summary}. Day 0 = Sunday.` },
            { role: "user", content: `Historical data: ${JSON.stringify(historicalData)}` },
          ],
          response_format: { type: "json_object" },
          temperature: 0.5,
        }),
      });
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        const result = JSON.parse(content);
        const slots = result.optimal_slots ?? [];
        if (channelId) {
          for (const slot of slots) {
            await supabase.from("optimal_times").upsert({
              channel_id: channelId, day_of_week: slot.day_of_week, optimal_hour: slot.optimal_hour,
              confidence_score: slot.confidence_score, updated_at: new Date().toISOString(),
            }, { onConflict: "channel_id,day_of_week,optimal_hour" });
          }
        }
        return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Fallback: typical best times
    const slots = [
      { day_of_week: 1, optimal_hour: 18, confidence_score: 75, reason: "Monday evening high activity" },
      { day_of_week: 3, optimal_hour: 12, confidence_score: 70, reason: "Wednesday lunch peak" },
      { day_of_week: 5, optimal_hour: 17, confidence_score: 80, reason: "Friday after-work surge" },
      { day_of_week: 6, optimal_hour: 11, confidence_score: 72, reason: "Saturday morning browsing" },
    ];
    return new Response(JSON.stringify({ optimal_slots: slots, timezone: "UTC", summary: "Best times are weekday evenings and weekend mornings" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
