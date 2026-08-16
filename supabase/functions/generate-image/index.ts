import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authorizeProtectedFunction, readBoundedJson } from "../_shared/protected-function.ts";

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

function isSupportedStyle(value: unknown): value is keyof typeof STYLE_PROMPTS {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(STYLE_PROMPTS, value);
}

const IMAGE_MODEL = "gpt-image-1";
const IMAGE_SIZE = "1024x1536";
const MAX_GENERATED_IMAGE_BYTES = 20 * 1024 * 1024;

interface GenerateImageRequest {
  prompt?: unknown;
  mode?: unknown;
  characterDesc?: unknown;
  sceneContext?: unknown;
}

type FailureStage =
  | "AUTH"
  | "CONFIG"
  | "PROVIDER_REQUEST"
  | "PROVIDER_RESPONSE"
  | "IMAGE_VALIDATION"
  | "STORAGE_UPLOAD"
  | "SIGNED_URL"
  | "UNKNOWN";

function safeRequestId(req: Request): string | null {
  const value = req.headers.get("x-request-id") ?? req.headers.get("x-sb-request-id");
  return value && /^[A-Za-z0-9._:-]{1,128}$/.test(value) ? value : null;
}

function logFailure(
  req: Request,
  stage: FailureStage,
  code: string,
  providerStatus?: number,
): void {
  console.error(JSON.stringify({
    event: "generate-image.failure",
    stage,
    code,
    requestId: safeRequestId(req),
    ...(typeof providerStatus === "number" ? { providerStatus } : {}),
  }));
}

function failureResponse(
  req: Request,
  status: number,
  error: string,
  stage: FailureStage,
  code: string,
  providerStatus?: number,
): Response {
  logFailure(req, stage, code, providerStatus);
  return new Response(
    JSON.stringify({ error }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed." }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authorization = await authorizeProtectedFunction(req, "generate-image");
    if ("response" in authorization) return authorization.response;
    const verifiedUser = authorization;

    const parsedBody = await readBoundedJson<GenerateImageRequest>(req, 16_384);
    if ("response" in parsedBody) return parsedBody.response;
    const { prompt, mode, characterDesc, sceneContext } = parsedBody.value;
    if (typeof prompt !== "string" || prompt.trim().length === 0 || prompt.length > 4_000
      || (typeof mode !== "undefined" && !isSupportedStyle(mode))
      || (typeof characterDesc !== "undefined" && (typeof characterDesc !== "string" || characterDesc.length > 2_000))
      || (typeof sceneContext !== "undefined" && (typeof sceneContext !== "string" || sceneContext.length > 2_000))) {
      return failureResponse(req, 400, "Invalid image generation request.", "IMAGE_VALIDATION", "REQUEST_INVALID");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return failureResponse(
        req,
        503,
        "Image generation could not be completed. Please try again.",
        "CONFIG",
        "SERVICE_CONFIGURATION_MISSING",
      );
    }
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get OpenAI API key
    const { data: keyData, error: keyError } = await supabase.from("api_keys").select("value").eq("key", "openai").maybeSingle();
    if (keyError) {
      return failureResponse(
        req,
        503,
        "Image generation could not be completed. Please try again.",
        "CONFIG",
        "API_KEYS_QUERY_FAILED",
      );
    }
    const openaiKey = keyData?.value;

    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: "OpenAI image generation is not configured. Contact an administrator." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Build the image generation prompt
    const styleSuffix = mode && isSupportedStyle(mode) ? STYLE_PROMPTS[mode] : STYLE_PROMPTS.ai_realistic;
    let fullPrompt = prompt;
    if (characterDesc) {
      fullPrompt += ` featuring ${characterDesc}`;
    }
    if (sceneContext) {
      fullPrompt += ` Context: ${sceneContext}`;
    }
    fullPrompt += `, ${styleSuffix}, vertical 9:16 composition, high quality, detailed`;

    // GPT Image returns base64 image data, which is persisted server-side before returning.
    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/images/generations", {
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
    } catch {
      return failureResponse(
        req,
        502,
        "OpenAI image generation failed. Verify configured model access and image request parameters.",
        "PROVIDER_REQUEST",
        "OPENAI_REQUEST_FAILED",
      );
    }

    if (!response.ok) {
      return failureResponse(
        req,
        502,
        "OpenAI image generation failed. Verify configured model access and image request parameters.",
        "PROVIDER_RESPONSE",
        "OPENAI_NON_SUCCESS",
        response.status,
      );
    }

    let data: { data?: Array<{ b64_json?: unknown; revised_prompt?: unknown }> };
    try {
      data = await response.json();
    } catch {
      return failureResponse(
        req,
        502,
        "OpenAI image generation returned no usable image data.",
        "PROVIDER_RESPONSE",
        "OPENAI_RESPONSE_INVALID",
      );
    }
    const b64Json = data.data?.[0]?.b64_json;
    const revisedPrompt = data.data?.[0]?.revised_prompt;
    if (typeof b64Json !== "string" || !b64Json) {
      return failureResponse(
        req,
        502,
        "OpenAI image generation returned no usable image data.",
        "IMAGE_VALIDATION",
        "OPENAI_IMAGE_MISSING",
      );
    }

    let imageBytes: Uint8Array;
    try {
      imageBytes = base64ToBytes(b64Json);
    } catch {
      return failureResponse(
        req,
        502,
        "OpenAI image generation returned invalid image data.",
        "IMAGE_VALIDATION",
        "OPENAI_BASE64_INVALID",
      );
    }
    if (!isPng(imageBytes) || imageBytes.length > MAX_GENERATED_IMAGE_BYTES) {
      return failureResponse(
        req,
        502,
        "OpenAI image generation returned an unsupported image size.",
        "IMAGE_VALIDATION",
        "OPENAI_IMAGE_UNSUPPORTED",
      );
    }

    const storagePath = `${verifiedUser.userId}/generated-images/${crypto.randomUUID()}.png`;
    let uploadError: unknown;
    try {
      ({ error: uploadError } = await supabase.storage.from("media").upload(storagePath, imageBytes, {
        contentType: "image/png",
        cacheControl: "31536000",
        upsert: false,
      }));
    } catch {
      return failureResponse(req, 500, "Generated image could not be stored.", "STORAGE_UPLOAD", "STORAGE_UPLOAD_EXCEPTION");
    }
    if (uploadError) {
      return failureResponse(
        req,
        500,
        "Generated image could not be stored.",
        "STORAGE_UPLOAD",
        "STORAGE_UPLOAD_FAILED",
      );
    }
    let signedUrl: { signedUrl?: string } | null;
    let signedUrlError: unknown;
    try {
      ({ data: signedUrl, error: signedUrlError } = await supabase.storage.from("media").createSignedUrl(storagePath, 60 * 60));
    } catch {
      return failureResponse(req, 500, "Generated image storage URL could not be created.", "SIGNED_URL", "SIGNED_URL_EXCEPTION");
    }
    if (signedUrlError || !signedUrl?.signedUrl) {
      return failureResponse(
        req,
        500,
        "Generated image storage URL could not be created.",
        "SIGNED_URL",
        "SIGNED_URL_FAILED",
      );
    }

    return new Response(
      JSON.stringify({
        imageUrl: signedUrl.signedUrl,
        media: { bucket: "media", objectPath: storagePath },
        ...(typeof revisedPrompt === "string" ? { revisedPrompt } : {}),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch {
    return failureResponse(
      req,
      500,
      "Image generation could not be completed. Please try again.",
      "UNKNOWN",
      "UNHANDLED",
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
