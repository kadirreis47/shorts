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
    const n = niche || "general content";

    const result = {
      id: crypto.randomUUID(),
      channel_id: channelId || null,
      name: "The Curious Explorer",
      age_range: "18-34",
      gender: "all",
      interests: [n, "self-improvement", "productivity", "trending topics", "quick tips"],
      pain_points: ["too much content, not enough time", "hard to find actionable advice", "information overload"],
      content_preferences: ["fast-paced", "visual", "practical", "story-driven", "data-backed"],
      peak_activity_hours: "7-9 PM",
      preferred_video_length: "15-30 seconds",
      engagement_style: "commenter & sharer",
      demographics: { age_range: "18-34", top_locations: ["US", "UK", "CA", "AU"], gender_split: "55F/45M" },
      psychographics: { values: ["authenticity", "growth"], motivations: ["learning", "entertainment"], fears: ["missing out", "wasting time"] },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
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
