import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { query, perPage = 5 } = await req.json();

    if (!query?.trim()) {
      return new Response(
        JSON.stringify({ error: "Query is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: apiKeyRow } = await supabase
      .from("api_keys")
      .select("value")
      .eq("key", "pexels")
      .maybeSingle();

    const pexelsKey = apiKeyRow?.value;

    if (!pexelsKey) {
      return new Response(
        JSON.stringify({ error: "Pexels API key not configured. Add it in Settings to enable video search." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const response = await fetch(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=portrait&size=large`,
      {
        headers: { Authorization: pexelsKey },
      },
    );

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: `Pexels API error: ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await response.json();
    const videos = (data.videos ?? []).map((video: {
      id: number;
      url: string;
      duration: number;
      width: number;
      height: number;
      image: string;
      video_files: { link: string; width: number; height: number; quality: string; file_type: string }[];
    }) => {
      const portraitFile = video.video_files?.find(
        (f) => f.height > f.width && f.quality === "hd",
      ) ?? video.video_files?.find((f) => f.height > f.width) ?? video.video_files?.[0];
      return {
        id: video.id,
        url: video.url,
        fileUrl: portraitFile?.link ?? "",
        preview: video.image,
        duration: video.duration,
        width: video.width,
        height: video.height,
        photographer: "",
      };
    }).filter((v: { fileUrl: string }) => v.fileUrl);

    return new Response(JSON.stringify({ videos }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
