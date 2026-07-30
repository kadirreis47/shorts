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
    const { channelId, niche } = await req.json();

    const current = Math.floor(Math.random() * 50000) + 5000;
    const newSubs = Math.floor(Math.random() * 500) + 50;
    const unsubs = Math.floor(Math.random() * 50) + 5;
    const net = newSubs - unsubs;
    const rate = (net / current) * 100;
    const projected30 = Math.floor(current + net * 30);
    const projected90 = Math.floor(current + net * 90);
    const milestone = Math.ceil(current / 10000) * 10000 + 10000;
    const daysToMilestone = Math.ceil((milestone - current) / Math.max(net, 1));

    const result = {
      id: crypto.randomUUID(),
      channel_id: channelId || null,
      snapshot_date: new Date().toISOString().split("T")[0],
      subscriber_count: current,
      new_subscribers: newSubs,
      unsubscribers: unsubs,
      net_growth: net,
      growth_rate: Math.round(rate * 100) / 100,
      projected_30d: projected30,
      projected_90d: projected90,
      milestone_target: milestone,
      milestone_eta: new Date(Date.now() + daysToMilestone * 86400000).toISOString().split("T")[0],
      growth_factors: [
        { factor: "Consistent posting schedule", impact: "high", trend: "positive" },
        { factor: "Trending topic coverage", impact: "medium", trend: "positive" },
        { factor: "Audience engagement", impact: "high", trend: "positive" },
      ],
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
