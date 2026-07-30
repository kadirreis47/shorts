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
    const { channelId, niche, currentRpm, monthlyViews } = await req.json();

    const baseRpm = currentRpm || 1.5;
    const baseViews = monthlyViews || 100000;
    const growthRate = 0.12 + Math.random() * 0.08;
    const projectedRpm = baseRpm * (1 + growthRate * 0.3);
    const projectedViews = Math.floor(baseViews * (1 + growthRate));
    const projectedRevenue = (projectedViews / 1000) * projectedRpm;

    const result = {
      id: crypto.randomUUID(),
      channel_id: channelId || null,
      forecast_period: "30d",
      current_rpm: baseRpm,
      projected_rpm: Math.round(projectedRpm * 100) / 100,
      current_monthly_views: baseViews,
      projected_monthly_views: projectedViews,
      projected_revenue: Math.round(projectedRevenue * 100) / 100,
      growth_rate: Math.round(growthRate * 1000) / 10,
      confidence_score: Math.round((70 + Math.random() * 20) * 10) / 10,
      revenue_breakdown: [
        { source: "Ad Revenue", amount: Math.round(projectedRevenue * 0.6 * 100) / 100, percentage: 60 },
        { source: "Channel Memberships", amount: Math.round(projectedRevenue * 0.15 * 100) / 100, percentage: 15 },
        { source: "Super Chats", amount: Math.round(projectedRevenue * 0.1 * 100) / 100, percentage: 10 },
        { source: "Sponsorships", amount: Math.round(projectedRevenue * 0.1 * 100) / 100, percentage: 10 },
        { source: "Affiliate", amount: Math.round(projectedRevenue * 0.05 * 100) / 100, percentage: 5 },
      ],
      growth_factors: [
        { factor: "Posting frequency", impact: "+15%", controllable: true },
        { factor: "Niche growth trend", impact: "+8%", controllable: false },
        { factor: "Audience retention", impact: "+12%", controllable: true },
        { factor: "Seasonal trends", impact: "+5%", controllable: false },
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
