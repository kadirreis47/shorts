import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const { script, niche, videoId } = await req.json();

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
            { role: "system", content: `You are an AI music director. Analyze the script and determine its emotional mood, then suggest 5 royalty-free music tracks that match. Return JSON: {detected_mood, suggested_tracks: [{title, mood, bpm, energy_level (1-10), genre, suggested_for, beat_markers (array of timestamps in seconds where beats hit)}]}. Focus on tracks that enhance the emotional arc.` },
            { role: "user", content: `Script: ${script}\nNiche: ${niche ?? "general"}` },
          ],
          response_format: { type: "json_object" },
          temperature: 0.7,
        }),
      });
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        const result = JSON.parse(content);
        if (videoId) {
          await supabase.from("music_match_suggestions").insert({
            video_id: videoId, detected_mood: result.detected_mood,
            suggested_tracks: result.suggested_tracks, beat_markers: result.suggested_tracks?.[0]?.beat_markers ?? [],
          });
        }
        return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Fallback
    const moods = ["Energetic", "Inspirational", "Dramatic", "Upbeat", "Calm"];
    const tracks = moods.map((mood, i) => ({
      title: `${mood} Pulse ${i + 1}`, mood, bpm: 90 + i * 20, energy_level: 5 + i,
      genre: i % 2 === 0 ? "Electronic" : "Cinematic", suggested_for: i < 2 ? "Hook + pacing" : "Background",
      beat_markers: Array.from({ length: 8 }, (_, j) => j * (60 / (90 + i * 20))),
    }));
    return new Response(JSON.stringify({ detected_mood: "Energetic", suggested_tracks: tracks }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
