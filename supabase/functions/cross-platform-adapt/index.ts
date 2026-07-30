import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const PLATFORM_CONFIG: Record<string, { maxTitle: number; maxDesc: number; hashtagStyle: string; culture: string }> = {
  youtube_shorts: { maxTitle: 100, maxDesc: 5000, hashtagStyle: "sparse", culture: "SEO-focused, descriptive titles with keywords" },
  tiktok: { maxTitle: 150, maxDesc: 2200, hashtagStyle: "trending", culture: "casual, trendy, uses trending sounds and hashtags" },
  instagram_reels: { maxTitle: 220, maxDesc: 2200, hashtagStyle: "moderate", culture: "aesthetic, aspirational, visual-first" },
  facebook: { maxTitle: 255, maxDesc: 63206, hashtagStyle: "minimal", culture: "community-focused, conversational" },
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const { title, description, tags, niche, videoId } = await req.json();

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: apiKeyRow } = await supabase.from("api_keys").select("value").eq("key", "openai").maybeSingle();
    const openaiKey = apiKeyRow?.value;

    const platforms = Object.keys(PLATFORM_CONFIG);
    const adaptations: Record<string, any> = {};

    for (const platform of platforms) {
      const config = PLATFORM_CONFIG[platform];
      if (openaiKey) {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: `You are a social media adaptation AI. Adapt the given YouTube Short content for ${platform}. The platform culture is: ${config.culture}. Max title length: ${config.maxTitle} chars. Max description: ${config.maxDesc} chars. Hashtag style: ${config.hashtagStyle}. Return JSON: {adapted_title, adapted_description, adapted_hashtags (array of 5-10 hashtags)}` },
              { role: "user", content: `Title: ${title}\nDescription: ${description}\nTags: ${JSON.stringify(tags)}\nNiche: ${niche}` },
            ],
            response_format: { type: "json_object" },
            temperature: 0.7,
          }),
        });
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          const result = JSON.parse(content);
          adaptations[platform] = result;
          if (videoId) {
            await supabase.from("cross_platform_posts").insert({
              video_id: videoId, platform, adapted_title: result.adapted_title,
              adapted_description: result.adapted_description, adapted_hashtags: result.adapted_hashtags,
              status: "ready",
            });
          }
          continue;
        }
      }
      // Fallback per platform
      adaptations[platform] = {
        adapted_title: title.slice(0, config.maxTitle),
        adapted_description: description?.slice(0, config.maxDesc) ?? "",
        adapted_hashtags: (tags ?? []).slice(0, 8).map((t: string) => `#${t.replace(/\s/g, "")}`),
      };
    }

    return new Response(JSON.stringify({ adaptations }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
