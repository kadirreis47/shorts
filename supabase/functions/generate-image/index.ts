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

const IMAGE_MODEL = "gpt-image-1";
const IMAGE_SIZE = "1024x1536";
const MAX_GENERATED_IMAGE_BYTES = 20 * 1024 * 1024;

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
        JSON.stringify({ error: "OpenAI image generation is not configured. Contact an administrator." }),
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

    // GPT Image returns base64 image data, which is persisted server-side before returning.
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        prompt: fullPrompt,
        n: 1,
        size: IMAGE_SIZE,
        quality: "medium",
        output_format: "png",
      }),
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: "OpenAI image generation failed. Verify configured model access and image request parameters." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await response.json();
    const b64Json = data.data?.[0]?.b64_json;
    const revisedPrompt = data.data?.[0]?.revised_prompt;
    if (typeof b64Json !== "string" || !b64Json) {
      return new Response(
        JSON.stringify({ error: "OpenAI image generation returned no usable image data." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let imageBytes: Uint8Array;
    try {
      imageBytes = base64ToBytes(b64Json);
    } catch {
      return new Response(
        JSON.stringify({ error: "OpenAI image generation returned invalid image data." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!isPng(imageBytes) || imageBytes.length > MAX_GENERATED_IMAGE_BYTES) {
      return new Response(
        JSON.stringify({ error: "OpenAI image generation returned an unsupported image size." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const storagePath = `generated-images/${crypto.randomUUID()}.png`;
    const { error: uploadError } = await supabase.storage.from("media").upload(storagePath, imageBytes, {
      contentType: "image/png",
      cacheControl: "31536000",
      upsert: false,
    });
    if (uploadError) {
      return new Response(
        JSON.stringify({ error: "Generated image could not be stored." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const { data: publicUrl } = supabase.storage.from("media").getPublicUrl(storagePath);
    if (!publicUrl.publicUrl) {
      return new Response(
        JSON.stringify({ error: "Generated image storage URL could not be created." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ imageUrl: publicUrl.publicUrl, ...(typeof revisedPrompt === "string" ? { revisedPrompt } : {}) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch {
    return new Response(
      JSON.stringify({ error: "Image generation could not be completed. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

function base64ToBytes(value: string): Uint8Array {
  const decoded = atob(value);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
  return bytes;
}

function isPng(bytes: Uint8Array): boolean {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
}
