import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authorizeProtectedFunction, isBoundedString, readBoundedJson, safeFailure } from "../_shared/protected-function.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};
const PEXELS_SEARCH_TIMEOUT_MS = 15_000;
const MAX_PEXELS_SEARCH_RESPONSE_BYTES = 256 * 1024;

type ResearchDiagnostic = {
  stage: "request-accepted" | "scene-search-start" | "video-search-result" | "image-fallback-result" | "scene-result-selected" | "scene-no-result" | "batch-complete" | "failure";
  boundary?: "authorization" | "request-parse" | "request-validation" | "credential-load" | "video-search" | "image-search" | "unhandled";
  requestedSceneCount?: number;
  resultCount?: number;
  videoCount?: number;
  imageCount?: number;
  noResultCount?: number;
  sceneIndex?: number;
  kind?: "image" | "video" | "none";
  providerResultCount?: number;
  statusClass?: number;
  timeout?: boolean;
  reason?: "REJECTED" | "NON_SUCCESS" | "INVALID_RESPONSE" | "TIMEOUT" | "UNAVAILABLE";
};

function researchDiagnostic(diagnostic: ResearchDiagnostic): void {
  console.info(JSON.stringify({ event: "edge-function.research-footage", ...diagnostic }));
}

function providerFailureReason(error: unknown): "INVALID_RESPONSE" | "TIMEOUT" | "UNAVAILABLE" {
  return error instanceof DOMException && error.name === "TimeoutError" ? "TIMEOUT" : "UNAVAILABLE";
}

async function readBoundedPexelsSearchJson(response: Response): Promise<Record<string, unknown>> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_PEXELS_SEARCH_RESPONSE_BYTES)) {
    throw new Error("Pexels search response exceeds the allowed size.");
  }
  if (!response.body) throw new Error("Pexels search response has no body.");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_PEXELS_SEARCH_RESPONSE_BYTES) throw new Error("Pexels search response exceeds the allowed size.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Pexels search response is invalid.");
  return value as Record<string, unknown>;
}

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

  let boundary: ResearchDiagnostic["boundary"] = "authorization";
  try {
    const authorization = await authorizeProtectedFunction(req, "research-footage");
    if ("response" in authorization) {
      researchDiagnostic({ stage: "failure", boundary, reason: "REJECTED" });
      return authorization.response;
    }

    boundary = "request-parse";
    const parsedBody = await readBoundedJson<ResearchRequest>(req, 65_536);
    if ("response" in parsedBody) {
      researchDiagnostic({ stage: "failure", boundary, reason: "REJECTED" });
      return parsedBody.response;
    }
    const { topic, scenes, mode } = parsedBody.value;
    boundary = "request-validation";
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
      researchDiagnostic({ stage: "failure", boundary, reason: "REJECTED" });
      return safeFailure("Invalid footage research request.", 400);
    }
    const requestedSceneCount = scenes.length;
    researchDiagnostic({ stage: "request-accepted", requestedSceneCount });

    boundary = "credential-load";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Get Pexels API key
    const { data: keyData } = await supabase.from("api_keys").select("value").eq("key", "pexels").maybeSingle();
    const pexelsKey = keyData?.value;

    if (!pexelsKey) {
      researchDiagnostic({ stage: "failure", boundary, requestedSceneCount, reason: "UNAVAILABLE" });
      return new Response(
        JSON.stringify({ error: "Footage research is not configured. Contact an administrator." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // For each scene, research and find the best matching real footage/image
    const results: Array<{ sceneIndex: number; kind: "image" | "video"; mediaId: number; query: string }> = [];
    let videoCount = 0;
    let imageCount = 0;
    let noResultCount = 0;

    for (let i = 0; i < (scenes as SceneRequest[]).length; i++) {
      const scene = (scenes as SceneRequest[])[i];
      const query = scene.visual || scene.keywords?.[0] || topic;
      researchDiagnostic({ stage: "scene-search-start", requestedSceneCount, sceneIndex: i });

      // Try video first (for documentary feel), then fall back to images
      try {
        boundary = "video-search";
        const videoRes = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=1&orientation=portrait`, {
          headers: { Authorization: pexelsKey },
          signal: AbortSignal.timeout(PEXELS_SEARCH_TIMEOUT_MS),
        });
        const videoStatusClass = Math.floor(videoRes.status / 100) * 100;
        if (videoRes.ok) {
          const videoData = await readBoundedPexelsSearchJson(videoRes);
          const videos = Array.isArray(videoData.videos) ? videoData.videos : [];
          researchDiagnostic({ stage: "video-search-result", requestedSceneCount, sceneIndex: i, providerResultCount: Math.min(videos.length, 12), statusClass: videoStatusClass });
          const video = videos[0];
          const videoId = video && typeof video === "object" ? (video as Record<string, unknown>).id : undefined;
          if (Number.isSafeInteger(videoId) && videoId > 0 && videoId <= 2_147_483_647) {
            results.push({ sceneIndex: i, kind: "video", mediaId: Number(videoId), query });
            videoCount += 1;
            researchDiagnostic({ stage: "scene-result-selected", requestedSceneCount, sceneIndex: i, kind: "video" });
            continue;
          }
        } else {
          researchDiagnostic({ stage: "video-search-result", requestedSceneCount, sceneIndex: i, providerResultCount: 0, statusClass: videoStatusClass, reason: "NON_SUCCESS" });
        }
      } catch (error) {
        researchDiagnostic({ stage: "failure", boundary: "video-search", requestedSceneCount, sceneIndex: i, timeout: providerFailureReason(error) === "TIMEOUT", reason: providerFailureReason(error) });
      }

      // Fall back to image search
      try {
        boundary = "image-search";
        const imgRes = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&orientation=portrait`, {
          headers: { Authorization: pexelsKey },
          signal: AbortSignal.timeout(PEXELS_SEARCH_TIMEOUT_MS),
        });
        const imageStatusClass = Math.floor(imgRes.status / 100) * 100;
        if (imgRes.ok) {
          const imgData = await readBoundedPexelsSearchJson(imgRes);
          const photos = Array.isArray(imgData.photos) ? imgData.photos : [];
          researchDiagnostic({ stage: "image-fallback-result", requestedSceneCount, sceneIndex: i, providerResultCount: Math.min(photos.length, 12), statusClass: imageStatusClass });
          const photo = photos[0];
          const photoId = photo && typeof photo === "object" ? (photo as Record<string, unknown>).id : undefined;
          if (Number.isSafeInteger(photoId) && photoId > 0 && photoId <= 2_147_483_647) {
            results.push({ sceneIndex: i, kind: "image", mediaId: Number(photoId), query });
            imageCount += 1;
            researchDiagnostic({ stage: "scene-result-selected", requestedSceneCount, sceneIndex: i, kind: "image" });
            continue;
          }
        } else {
          researchDiagnostic({ stage: "image-fallback-result", requestedSceneCount, sceneIndex: i, providerResultCount: 0, statusClass: imageStatusClass, reason: "NON_SUCCESS" });
        }
      } catch (error) {
        researchDiagnostic({ stage: "failure", boundary: "image-search", requestedSceneCount, sceneIndex: i, timeout: providerFailureReason(error) === "TIMEOUT", reason: providerFailureReason(error) });
      }

      noResultCount += 1;
      researchDiagnostic({ stage: "scene-no-result", requestedSceneCount, sceneIndex: i, kind: "none" });
    }

    researchDiagnostic({ stage: "batch-complete", requestedSceneCount, resultCount: results.length, videoCount, imageCount, noResultCount });

    return new Response(
      JSON.stringify({ results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch {
    researchDiagnostic({ stage: "failure", boundary: boundary ?? "unhandled", reason: "UNAVAILABLE" });
    return safeFailure("Footage research could not be completed.", 500);
  }
});
