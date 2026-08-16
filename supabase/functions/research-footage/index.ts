import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authorizeProtectedFunction, isBoundedString, readBoundedJson, safeFailure } from "../_shared/protected-function.ts";

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

interface ResearchRequest { topic?: unknown; scenes?: unknown; mode?: unknown }

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") return safeFailure("Method not allowed.", 405);

  try {
    const authorization = await authorizeProtectedFunction(req, "research-footage");
    if ("response" in authorization) return authorization.response;

    const parsedBody = await readBoundedJson<ResearchRequest>(req, 65_536);
    if ("response" in parsedBody) return parsedBody.response;
    const { topic, scenes, mode } = parsedBody.value;
    if (!isBoundedString(topic, 500, true)
      || !Array.isArray(scenes) || scenes.length < 1 || scenes.length > 12
      || !scenes.every((scene: unknown) => {
        if (!scene || typeof scene !== "object") return false;
        const value = scene as Record<string, unknown>;
        return isBoundedString(value.text, 2_000)
          && isBoundedString(value.visual, 500)
          && (typeof value.duration === "undefined" || (typeof value.duration === "number" && value.duration >= 0 && value.duration <= 300))
          && (typeof value.keywords === "undefined" || (Array.isArray(value.keywords) && value.keywords.length <= 10
            && value.keywords.every((keyword) => isBoundedString(keyword, 100, true))));
      })
      || (typeof mode !== "undefined" && !isBoundedString(mode, 50))) {
      return safeFailure("Invalid footage research request.", 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Get Pexels API key
    const { data: keyData } = await supabase.from("api_keys").select("value").eq("key", "pexels").maybeSingle();
    const pexelsKey = keyData?.value;

    if (!pexelsKey) {
      return new Response(
        JSON.stringify({ error: "Footage research is not configured. Contact an administrator." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
  } catch {
    return safeFailure("Footage research could not be completed.", 500);
  }
});
