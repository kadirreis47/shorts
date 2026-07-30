import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const { scenes, niche, videoId } = await req.json();

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
            { role: "system", content: `You are an AI B-roll director. For each scene narration, suggest the best visual content. Return JSON: {suggestions: [{scene_index, narration_text, suggested_images (array of search terms), suggested_videos (array of search terms), ai_generated_prompt (DALL-E prompt for a custom image)}]}. Be specific and visual.` },
            { role: "user", content: `Scenes: ${JSON.stringify(scenes.map((s: any, i: number) => ({ index: i, narration: s.narration ?? s.text ?? ""})))}\nNiche: ${niche ?? "general"}` },
          ],
          response_format: { type: "json_object" },
          temperature: 0.7,
        }),
      });
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        const result = JSON.parse(content);
        const suggestions = result.suggestions ?? [];
        if (videoId) {
          for (const s of suggestions) {
            await supabase.from("broll_suggestions").insert({ video_id: videoId, scene_index: s.scene_index, narration_text: s.narration_text, suggested_images: s.suggested_images, suggested_videos: s.suggested_videos, ai_generated_prompt: s.ai_generated_prompt });
          }
        }
        return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Fallback
    const suggestions = scenes.map((s: any, i: number) => ({
      scene_index: i,
      narration_text: s.narration ?? s.text ?? "",
      suggested_images: [`${niche ?? "topic"} close-up`, "abstract background", "text overlay"],
      suggested_videos: [`${niche ?? "topic"} footage`, "slow motion b-roll"],
      ai_generated_prompt: `Cinematic shot representing: ${s.narration ?? s.text ?? "the scene"}`,
    }));
    return new Response(JSON.stringify({ suggestions }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
