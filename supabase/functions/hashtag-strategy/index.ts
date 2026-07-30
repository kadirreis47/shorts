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
    const { niche, videoTitle, channelId } = await req.json();
    const n = niche || "general";

    const suggested = generateHashtags(n, videoTitle);
    const trending = generateTrending(n);
    const nicheTags = generateNicheTags(n);
    const banned = ["#fyp", "#foryou", "#viral", "#shorts"];
    const scores = suggested.map((tag, i) => ({
      tag,
      reach_score: Math.floor(Math.random() * 30) + 70,
      competition_score: Math.floor(Math.random() * 40) + 30,
      relevance_score: Math.floor(Math.random() * 20) + 80,
      recommendation: i < 5 ? "high" : i < 10 ? "medium" : "optional",
    }));

    const result = {
      id: crypto.randomUUID(),
      channel_id: channelId || null,
      niche: n,
      video_title: videoTitle || null,
      suggested_hashtags: suggested,
      trending_hashtags: trending,
      niche_hashtags: nicheTags,
      banned_hashtags: banned,
      hashtag_scores: scores,
      optimal_count: 15,
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

function generateHashtags(niche: string, title?: string) {
  const base = niche.toLowerCase().replace(/\s+/g, "");
  const words = niche.toLowerCase().split(/\s+/);
  return [
    `#${base}`, ...words.map((w) => `#${w}`),
    "#shorts", "#shortvideo", "#shortsfeed",
    `#${base}tips`, `#${base}community`, `#${base}life`,
    "#contentcreator", "#creator", `#${base}content`,
    "#trending", "#explore", `#${base}daily`,
  ];
}
function generateTrending(niche: string) {
  const n = niche.toLowerCase().replace(/\s+/g, "");
  return [`#${n}2026`, `#${n}trending`, `#${n}viral`, "#trendingnow", `#${n}hacks`, `#${n}daily`];
}
function generateNicheTags(niche: string) {
  const n = niche.toLowerCase().replace(/\s+/g, "");
  return [`#${n}expert`, `#${n}guide`, `#${n}101`, `#${n}tutorial`, `#${n}pro`, `#${n}beginner`];
}
