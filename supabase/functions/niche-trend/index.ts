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
    const { niche } = await req.json();
    const n = niche || "general";

    const phases = ["emerging", "growing", "peak", "declining"];
    const phase = phases[Math.floor(Math.random() * 2)];

    const result = {
      id: crypto.randomUUID(),
      niche: n,
      topic: `${n} content trends`,
      trend_phase: phase,
      growth_rate: Math.round((Math.random() * 40 + 10) * 10) / 10,
      search_volume: Math.floor(Math.random() * 500000) + 50000,
      competition_score: Math.round((Math.random() * 50 + 30) * 10) / 10,
      opportunity_score: Math.round((Math.random() * 30 + 65) * 10) / 10,
      related_topics: [
        { topic: `${n} for beginners`, growth: "+22%", volume: "High" },
        { topic: `${n} tips 2026`, growth: "+18%", volume: "Medium" },
        { topic: `${n} mistakes to avoid`, growth: "+15%", volume: "Medium" },
        { topic: `advanced ${n}`, growth: "+10%", volume: "Low" },
      ],
      top_channels: [
        { name: `${n} Pro`, subscribers: "1.2M", avg_views: "450K" },
        { name: `${n} Daily`, subscribers: "850K", avg_views: "320K" },
        { name: `${n} Hacks`, subscribers: "600K", avg_views: "280K" },
      ],
      recommended_actions: [
        { action: `Create ${n} tutorial shorts`, priority: "high", expected_impact: "High reach" },
        { action: `Cover emerging ${n} trends`, priority: "high", expected_impact: "First-mover advantage" },
        { action: `Make ${n} myth-busting content`, priority: "medium", expected_impact: "Engagement boost" },
      ],
      data_points: Array.from({ length: 7 }, (_, i) => ({
        date: new Date(Date.now() - (6 - i) * 86400000).toISOString().split("T")[0],
        volume: Math.floor(Math.random() * 50000) + 10000,
        growth: Math.round((Math.random() * 20 - 5) * 10) / 10,
      })),
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
