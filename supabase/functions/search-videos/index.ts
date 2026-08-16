import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { authorizeProtectedFunction, isBoundedString, readBoundedJson, safeFailure } from "../_shared/protected-function.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SearchRequest { query?: unknown; perPage?: number }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") return safeFailure("Method not allowed.", 405);

  try {
    const authorization = await authorizeProtectedFunction(req, "search-videos");
    if ("response" in authorization) return authorization.response;

    const parsedBody = await readBoundedJson<SearchRequest>(req, 8_192);
    if ("response" in parsedBody) return parsedBody.response;
    const { query, perPage = 5 } = parsedBody.value;
    if (!isBoundedString(query, 500, true) || !Number.isInteger(perPage) || perPage < 1 || perPage > 12) {
      return safeFailure("Invalid video search request.", 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: apiKeyRow } = await supabase
      .from("api_keys")
      .select("value")
      .eq("key", "pexels")
      .maybeSingle();

    const pexelsKey = apiKeyRow?.value;

    if (!pexelsKey) {
      return new Response(
        JSON.stringify({ error: "Video search is not configured. Contact an administrator." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const response = await fetch(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=portrait&size=large`,
      {
        headers: { Authorization: pexelsKey },
      },
    );

    if (!response.ok) {
      console.error(JSON.stringify({ event: "edge-function.provider-failure", functionName: "search-videos", providerStatus: response.status }));
      return safeFailure("Video search provider is temporarily unavailable.", 502);
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
  } catch {
    return safeFailure("Video search could not be completed.", 500);
  }
});
