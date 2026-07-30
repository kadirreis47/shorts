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
    const { script, visualStyle, channelId, videoId } = await req.json();

    const scenes = script.split(/\n\n+|(?=\[HOOK\]|\[BODY\]|\[CTA\]|\[Scene)/).filter((s: string) => s.trim());
    const shotTypes = ["wide", "medium", "close-up", "overhead", "pov", "tracking", "dolly", "aerial"];
    const cameraAngles = ["eye-level", "low-angle", "high-angle", "dutch-angle", "over-shoulder"];
    const transitions = ["cut", "whip-pan", "zoom", "glitch", "match-cut", "fade"];

    const storyboardScenes = (scenes.length > 0 ? scenes : ["Opening hook", "Main content", "Call to action"]).map((scene: string, i: number) => ({
      scene_number: i + 1,
      description: scene.slice(0, 200),
      shot_type: shotTypes[i % shotTypes.length],
      camera_angle: cameraAngles[i % cameraAngles.length],
      transition: transitions[i % transitions.length],
      duration: 3 + Math.floor(Math.random() * 4),
      visual_description: `Visual: ${scene.slice(0, 100)}`,
      text_overlay: scene.slice(0, 50),
      estimated_duration: 3 + Math.floor(Math.random() * 4),
    }));

    const totalDuration = storyboardScenes.reduce((sum: number, s: any) => sum + s.duration, 0);

    const result = {
      id: crypto.randomUUID(),
      video_id: videoId || null,
      channel_id: channelId || null,
      script,
      scenes: storyboardScenes,
      visual_style: visualStyle || "modern",
      shot_types: shotTypes.map((t) => ({ type: t, count: storyboardScenes.filter((s: any) => s.shot_type === t).length })),
      camera_angles: cameraAngles.map((a) => ({ angle: a, count: storyboardScenes.filter((s: any) => s.camera_angle === a).length })),
      transitions: transitions.map((t) => ({ type: t, count: storyboardScenes.filter((s: any) => s.transition === t).length })),
      estimated_duration: totalDuration,
      thumbnail_url: null,
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
