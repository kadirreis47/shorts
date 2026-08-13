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

    const { query, perPage = 3 } = await req.json();

    if (!query?.trim()) {
      return new Response(
        JSON.stringify({ error: "Query is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Check for Pexels API key
    const { data: apiKeyRow } = await supabase
      .from("api_keys")
      .select("value")
      .eq("key", "pexels")
      .maybeSingle();

    const pexelsKey = apiKeyRow?.value;

    if (!pexelsKey) {
      return new Response(
        JSON.stringify({ error: "Image search is not configured. Contact an administrator." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const response = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=portrait&size=large`,
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
    const images = (data.photos ?? []).map((photo: { id: number; src: { large2x: string; original: string }; alt: string; photographer: string; photographer_url: string }) => ({
      id: photo.id,
      url: photo.src.large2x,
      original: photo.src.original,
      alt: photo.alt,
      photographer: photo.photographer,
      photographerUrl: photo.photographer_url,
    }));

    return new Response(JSON.stringify({ images }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
