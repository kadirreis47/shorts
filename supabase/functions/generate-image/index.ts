import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const STYLE_PROMPTS: Record<string, string> = {
  ai_cartoon: "cartoon illustration, bold outlines, vibrant colors, animated style, flat shading",
  ai_realistic: "photorealistic, high detail, natural lighting, 4k photography style",
  ai_anime: "anime style, cel shading, dramatic lighting, vibrant colors, studio anime production",
  ai_horror: "dark atmospheric illustration, low-key lighting, desaturated colors, horror art style, eerie mood",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { prompt, mode, characterDesc, sceneContext } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Get OpenAI API key
    const { data: keyData } = await supabase.from("api_keys").select("value").eq("key", "openai").maybeSingle();
    const openaiKey = keyData?.value;

    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: "OpenAI API key not configured. Add it in Settings." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Build the image generation prompt
    const styleSuffix = STYLE_PROMPTS[mode as string] ?? STYLE_PROMPTS.ai_realistic;
    let fullPrompt = prompt;
    if (characterDesc) {
      fullPrompt += ` featuring ${characterDesc}`;
    }
    if (sceneContext) {
      fullPrompt += ` Context: ${sceneContext}`;
    }
    fullPrompt += `, ${styleSuffix}, vertical 9:16 composition, high quality, detailed`;

    // Call OpenAI DALL-E 3 for image generation
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: fullPrompt,
        n: 1,
        size: "1024x1792",
        quality: "standard",
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: { message: "Image generation failed" } }));
      return new Response(
        JSON.stringify({ error: err.error?.message ?? "Image generation failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await response.json();
    const imageUrl = data.data?.[0]?.url;
    const revisedPrompt = data.data?.[0]?.revised_prompt;

    return new Response(
      JSON.stringify({ imageUrl, revisedPrompt, prompt: fullPrompt }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
