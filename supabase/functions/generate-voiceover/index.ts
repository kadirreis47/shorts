import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { authorizeProtectedFunction, isBoundedString, readBoundedJson, safeFailure } from "../_shared/protected-function.ts";
import { decodeBase64Audio, parseElevenLabsOriginalAlignment } from "../../../src/shared/voiceoverAlignment.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface VoiceoverRequest { text?: unknown; voiceId?: unknown }
const MAX_TIMESTAMP_RESPONSE_BYTES = 34_500_000;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") return safeFailure("Method not allowed.", 405);

  try {
    const authorization = await authorizeProtectedFunction(req, "generate-voiceover");
    if ("response" in authorization) return authorization.response;

    const parsedBody = await readBoundedJson<VoiceoverRequest>(req, 16_384);
    if ("response" in parsedBody) return parsedBody.response;
    const { text, voiceId } = parsedBody.value;
    if (!isBoundedString(text, 5_000, true)
      || (typeof voiceId !== "undefined" && (!isBoundedString(voiceId, 128, true) || !/^[A-Za-z0-9_-]+$/.test(voiceId)))) {
      return safeFailure("Invalid voice generation request.", 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: apiKeyRow } = await supabase
      .from("api_keys")
      .select("value")
      .eq("key", "elevenlabs")
      .maybeSingle();

    const elevenlabsKey = apiKeyRow?.value;
    if (!elevenlabsKey) {
      return new Response(
        JSON.stringify({ error: "Voice generation is not configured. Contact an administrator." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const voice = voiceId || "21m00Tcm4TlvDq8ikWAM";

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": elevenlabsKey,
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_turbo_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.3,
            use_speaker_boost: true,
          },
        }),
      },
    );

    if (!response.ok) {
      console.error(JSON.stringify({ event: "edge-function.provider-failure", functionName: "generate-voiceover", providerStatus: response.status }));
      return safeFailure("Voice provider is temporarily unavailable.", 502);
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("application/json")) {
      console.error(JSON.stringify({ event: "edge-function.provider-invalid-audio", functionName: "generate-voiceover", contentType: contentType.slice(0, 80) }));
      return safeFailure("Voice provider returned an invalid audio response.", 502);
    }
    const providerPayload = await readTimestampPayload(response);
    if (!providerPayload) return safeFailure("Voice provider returned an invalid audio response.", 502);
    const audioBytes = decodeBase64Audio(providerPayload.audio_base64);
    if (!audioBytes) return safeFailure("Voice provider returned invalid audio.", 502);
    const durationMs = mp3DurationMs(audioBytes);
    if (durationMs === null) return safeFailure("Voice provider returned invalid audio.", 502);
    // Alignment is optional enhancement data: invalid/mismatched timing must
    // never discard a valid durable narration asset.
    const alignment = parseElevenLabsOriginalAlignment(providerPayload.alignment, text, durationMs);
    const objectPath = `${authorization.userId}/voiceovers/${crypto.randomUUID()}.mp3`;
    const { error: uploadError } = await supabase.storage.from("media").upload(
      objectPath,
      audioBytes,
      { contentType: "audio/mpeg", upsert: false },
    );
    if (uploadError) {
      console.error(JSON.stringify({ event: "edge-function.storage-upload-failure", functionName: "generate-voiceover", code: typeof uploadError.name === "string" ? uploadError.name : "UNKNOWN" }));
      return safeFailure("Voice audio could not be stored.", 502);
    }
    const { data: signed, error: signError } = await supabase.storage.from("media").createSignedUrl(objectPath, 60 * 60);
    if (signError || !signed?.signedUrl) {
      console.error(JSON.stringify({ event: "edge-function.storage-sign-failure", functionName: "generate-voiceover" }));
      return safeFailure("Voice audio could not be opened.", 502);
    }

    return new Response(
      JSON.stringify({ media: { bucket: "media", objectPath }, durationMs, playbackUrl: signed.signedUrl, format: "mp3", ...(alignment ? { alignment } : {}) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch {
    return safeFailure("Voice generation could not be completed.", 500);
  }
});

async function readTimestampPayload(response: Response): Promise<{ audio_base64?: unknown; alignment?: unknown } | null> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && (!/^\d+$/u.test(contentLength) || Number(contentLength) > MAX_TIMESTAMP_RESPONSE_BYTES)) return null;
  if (!response.body) return null;
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      size += value.byteLength;
      if (size > MAX_TIMESTAMP_RESPONSE_BYTES) { await reader.cancel(); return null; }
      chunks.push(value);
    }
  } catch { return null; } finally { reader.releaseLock(); }
  if (!size) return null;
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as { audio_base64?: unknown; alignment?: unknown } : null;
  } catch { return null; }
}

function mp3DurationMs(bytes: Uint8Array): number | null {
  if (bytes.length < 4 || bytes.length > 25_000_000) return null;
  let offset = bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33
    ? 10 + ((bytes[6] & 0x7f) << 21) + ((bytes[7] & 0x7f) << 14) + ((bytes[8] & 0x7f) << 7) + (bytes[9] & 0x7f) + ((bytes[5] & 0x10) ? 10 : 0) : 0;
  if (offset >= bytes.length) return null;
  const end = bytes.length >= 128 && bytes[bytes.length - 128] === 0x54 && bytes[bytes.length - 127] === 0x41 && bytes[bytes.length - 126] === 0x47 ? bytes.length - 128 : bytes.length;
  let samples = 0; let sampleRate = 0; let frames = 0;
  while (offset + 4 <= end) {
    if (bytes[offset] !== 0xff || (bytes[offset + 1] & 0xe0) !== 0xe0) return null;
    const version = (bytes[offset + 1] >> 3) & 3; const layer = (bytes[offset + 1] >> 1) & 3;
    const bitrateIndex = (bytes[offset + 2] >> 4) & 15; const rateIndex = (bytes[offset + 2] >> 2) & 3;
    if (version === 1 || layer === 0 || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) return null;
    const rates = version === 3 ? [44100, 48000, 32000] : version === 2 ? [22050, 24000, 16000] : [11025, 12000, 8000];
    sampleRate = rates[rateIndex]; const bitrates = version === 3 && layer === 3 ? [0,32,64,96,128,160,192,224,256,288,320,352,384,416,448] : version === 3 ? [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320] : [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160];
    const bitrate = bitrates[bitrateIndex] * 1000; const frameSamples = layer === 3 ? 384 : layer === 1 ? (version === 3 ? 1152 : 576) : 1152;
    const frameLength = layer === 3 ? Math.floor((12 * bitrate / sampleRate + ((bytes[offset + 2] >> 1) & 1)) * 4) : Math.floor(((version === 3 ? 144 : 72) * bitrate / sampleRate) + ((bytes[offset + 2] >> 1) & 1));
    if (frameLength < 4 || offset + frameLength > end) return null;
    samples += frameSamples; frames += 1; offset += frameLength;
  }
  const durationMs = Math.round(samples * 1000 / sampleRate);
  return frames >= 2 && offset === end && Number.isSafeInteger(durationMs) && durationMs > 0 && durationMs <= 15 * 60_000 ? durationMs : null;
}
