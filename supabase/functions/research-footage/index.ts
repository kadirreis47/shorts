import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SceneRequest {
  text: string;
  visual: string;
  keywords?: string[];
  duration?: number;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { topic, scenes, mode } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Get Pexels API key
    const { data: keyData } = await supabase.from("api_keys").select("value").eq("key", "pexels").maybeSingle();
    const pexelsKey = keyData?.value;

    if (!pexelsKey) {
      return new Response(
        JSON.stringify({ error: "Pexels API key not configured. Add it in Settings for real footage." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // For each scene, research and find the best matching real footage/image
    const results: Array<{ sceneIndex: number; imageUrl?: string; videoUrl?: string; query: string }> = [];

    for (let i = 0; i < (scenes as SceneRequest[]).length; i++) {
      const scene = (scenes as SceneRequest[])[i];
      const query = scene.visual || scene.keywords?.[0] || topic;

      // Try video first (for documentary feel), then fall back to images
      try {
        const videoRes = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=1&orientation=portrait`, {
          headers: { Authorization: pexelsKey },
        });
        if (videoRes.ok) {
          const videoData = await videoRes.json();
          const video = videoData.videos?.[0];
          if (video) {
            const videoFile = video.video_files?.find((f: { width: number }) => f.width >= 720) ?? video.video_files?.[0];
            if (videoFile?.link) {
              results.push({ sceneIndex: i, videoUrl: videoFile.link, imageUrl: video.image, query });
              continue;
            }
          }
        }
      } catch { /* try image next */ }

      // Fall back to image search
      try {
        const imgRes = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&orientation=portrait`, {
          headers: { Authorization: pexelsKey },
        });
        if (imgRes.ok) {
          const imgData = await imgRes.json();
          const photo = imgData.photos?.[0];
          if (photo?.src?.large) {
            results.push({ sceneIndex: i, imageUrl: photo.src.large, query });
            continue;
          }
        }
      } catch { /* skip */ }

      results.push({ sceneIndex: i, query });
    }

    return new Response(
      JSON.stringify({ results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
