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
    const { channelId, videoId } = await req.json();

    const total = Math.floor(Math.random() * 500) + 100;
    const positive = Math.floor(total * 0.65);
    const neutral = Math.floor(total * 0.2);
    const negative = Math.floor(total * 0.1);
    const questions = total - positive - neutral - negative;
    const score = (positive - negative) / total * 100;

    const result = {
      id: crypto.randomUUID(),
      channel_id: channelId || null,
      video_id: videoId || crypto.randomUUID(),
      total_comments: total,
      positive_count: positive,
      neutral_count: neutral,
      negative_count: negative,
      question_count: questions,
      sentiment_score: Math.round(score * 100) / 100,
      top_themes: [
        { theme: "Helpful content", frequency: "high", sentiment: "positive" },
        { theme: "Requests for more", frequency: "medium", sentiment: "positive" },
        { theme: "Disagreement with tips", frequency: "low", sentiment: "negative" },
        { theme: "Questions about implementation", frequency: "medium", sentiment: "neutral" },
      ],
      sentiment_trend: Array.from({ length: 7 }, (_, i) => ({
        date: new Date(Date.now() - (6 - i) * 86400000).toISOString().split("T")[0],
        score: Math.round((Math.random() * 20 + 60) * 10) / 10,
      })),
      actionable_insights: [
        { insight: "Audience loves practical tips — create more how-to content", priority: "high" },
        { insight: "Several questions about implementation — consider a follow-up Q&A video", priority: "medium" },
        { insight: "Positive sentiment trending up — maintain current content direction", priority: "low" },
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
