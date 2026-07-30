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
    const { sourceUrl, channelId, maxClips = 5 } = await req.json();

    const clips = Array.from({ length: Math.min(maxClips, 8) }, (_, i) => ({
      clip_id: i + 1,
      start_time: i * 45,
      end_time: i * 45 + 30,
      duration: 30,
      title: `Clip ${i + 1} - Key Moment`,
      hook: generateHook(i),
      summary: `This clip covers a key segment from the ${i + 1}th part of the source video.`,
      viral_score: Math.floor(Math.random() * 30) + 65,
      suggested_title: `Viral Short ${i + 1}: ${generateHook(i)}`,
      adapted_script: `[HOOK] ${generateHook(i)}\n\n[BODY] This is the key takeaway from this segment.\n\n[CTA] Follow for more!`,
      status: "ready",
    }));

    const result = {
      id: crypto.randomUUID(),
      channel_id: channelId || null,
      source_url: sourceUrl,
      source_title: "Source Video",
      source_duration: clips.length * 45,
      detected_clips: clips,
      selected_clips: clips.slice(0, 3),
      adapted_scripts: clips.slice(0, 3).map((c) => ({ clip_id: c.clip_id, script: c.adapted_script })),
      status: "completed",
      total_clips: clips.length,
      completed_clips: clips.length,
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

function generateHook(i: number) {
  const hooks = [
    "Nobody talks about this...",
    "The secret they don't want you to know",
    "This changed everything for me",
    "You've been doing it wrong the whole time",
    "Here's what actually works",
    "This took me 5 years to learn",
    "The #1 mistake to avoid",
    "Why this works every time",
  ];
  return hooks[i % hooks.length];
}
