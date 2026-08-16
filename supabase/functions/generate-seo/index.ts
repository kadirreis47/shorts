import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authorizeProtectedFunction, isBoundedString, readBoundedJson, safeFailure } from "../_shared/protected-function.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SeoRequest {
  title?: string;
  script?: string;
  hook?: string;
  niche?: string;
  topic?: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") return safeFailure("Method not allowed.", 405);

  try {
    const authorization = await authorizeProtectedFunction(req, "generate-seo");
    if ("response" in authorization) return authorization.response;

    const parsedBody = await readBoundedJson<SeoRequest>(req, 32_768);
    if ("response" in parsedBody) return parsedBody.response;
    const { title, script, hook, niche, topic } = parsedBody.value;
    if (![title, hook, niche, topic].every((value) => typeof value === "undefined" || isBoundedString(value, 500))
      || (typeof script !== "undefined" && !isBoundedString(script, 20_000))
      || ![title, topic].some((value) => isBoundedString(value, 500, true))) {
      return safeFailure("Invalid SEO request.", 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: keyData } = await supabase.from("api_keys").select("value").eq("key", "openai").maybeSingle();
    const openaiKey = keyData?.value;

    if (!openaiKey) {
      // Fallback: generate basic SEO without AI
      const fallbackTags = (topic || title || "").split(/\s+/).filter((w: string) => w.length > 3).slice(0, 8);
      const fallbackHashtags = fallbackTags.map((t: string) => `#${t.toLowerCase()}`);
      return new Response(
        JSON.stringify({
          optimizedTitle: title?.slice(0, 100) || topic,
          optimizedDescription: script?.slice(0, 5000) || "",
          tags: fallbackTags,
          hashtags: fallbackHashtags,
          thumbnailText: hook || title,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const systemPrompt = `You are a YouTube Shorts SEO expert. Generate optimized metadata for a short-form video.
Return ONLY a JSON object with these fields:
- optimizedTitle: A click-worthy title under 100 characters. Use proven YouTube title formulas.
- optimizedDescription: A 2-3 sentence description with keywords naturally woven in. Include a CTA.
- tags: An array of 8-12 relevant SEO tags (single words or short phrases, no #).
- hashtags: An array of 5-8 hashtags (with # prefix).
- thumbnailText: A short, punchy text overlay for the thumbnail (3-6 words max).`;

    const userPrompt = `Title: ${title}\nTopic: ${topic}\nNiche: ${niche}\nHook: ${hook}\nScript: ${script?.slice(0, 2000)}`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      throw new Error("SEO generation failed");
    }

    const data = await response.json();
    const seo = JSON.parse(data.choices[0].message.content);

    return new Response(
      JSON.stringify({
        optimizedTitle: seo.optimizedTitle || title,
        optimizedDescription: seo.optimizedDescription || script,
        tags: seo.tags || [],
        hashtags: seo.hashtags || [],
        thumbnailText: seo.thumbnailText || hook || title,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch {
    return safeFailure("SEO generation could not be completed.", 500);
  }
});
