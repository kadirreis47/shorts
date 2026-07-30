import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const { script, scenes, videoId } = await req.json();

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
            { role: "system", content: `You are an AI video chapter generator. Segment the script into logical chapters with timestamps. Return JSON: {chapters: [{title, start_time (seconds), end_time (seconds), summary}]}. Chapters should be 10-20 seconds each for Shorts.` },
            { role: "user", content: `Script: ${script}\nScenes: ${JSON.stringify(scenes?.map((s: any, i: number) => ({ index: i, duration: s.duration ?? 10, text: s.narration ?? s.text })))}` },
          ],
          response_format: { type: "json_object" },
          temperature: 0.5,
        }),
      });
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        const result = JSON.parse(content);
        const chapters = result.chapters ?? [];
        if (videoId) {
          await supabase.from("video_chapters").upsert({ video_id: videoId, chapters }, { onConflict: "video_id" });
          await supabase.from("videos").update({ auto_chapters: chapters }).eq("id", videoId);
        }
        return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Fallback: create chapters from scenes
    let currentTime = 0;
    const chapters = (scenes ?? []).map((s: any, i: number) => {
      const duration = s.duration ?? 10;
      const chapter = { title: `Part ${i + 1}`, start_time: currentTime, end_time: currentTime + duration, summary: s.narration ?? s.text ?? "" };
      currentTime += duration;
      return chapter;
    });
    return new Response(JSON.stringify({ chapters }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
