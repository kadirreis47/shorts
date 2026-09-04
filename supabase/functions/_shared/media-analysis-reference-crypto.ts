import { OPAQUE_MEDIA_REFERENCE_TTL_SECONDS, type OpaqueMediaAnalysisScope } from "./opaque-media-reference.ts";

export const MEDIA_ANALYSIS_SECRET_PREFIX = "omr-secret-v1.";
export const MEDIA_ANALYSIS_CLOCK_SKEW_SECONDS = 30;
const TOKEN_CONTEXT = new TextEncoder().encode("shortsflow:opaque-media-reference:v1");
export interface MediaAnalysisCapability {
  v: 1; s: OpaqueMediaAnalysisScope; m: "image"; b: "media"; p: string; o: string;
  oid: string; ov: string; oe: string; ou: string; oz: number; oct: "image/jpeg" | "image/png"; iat: number; exp: number;
}

export async function sealMediaAnalysisCapability(payload: MediaAnalysisCapability, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, tagLength: 128, additionalData: TOKEN_CONTEXT }, await key(secret), new TextEncoder().encode(JSON.stringify(payload)));
  return `omr1.${base64url(iv)}.${base64url(new Uint8Array(encrypted))}`;
}

export async function openMediaAnalysisCapability(reference: string, secret: string): Promise<MediaAnalysisCapability> {
  const match = /^omr1\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{32,4096})$/u.exec(reference);
  if (!match) throw new Error("invalid-reference");
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64url(match[1]), tagLength: 128, additionalData: TOKEN_CONTEXT }, await key(secret), fromBase64url(match[2]));
    return normalizeCapability(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plain)));
  } catch { throw new Error("invalid-reference"); }
}

export function decodeMediaAnalysisSecret(secret: string): Uint8Array {
  const match = /^omr-secret-v1\.([A-Za-z0-9_-]{43})$/u.exec(secret);
  if (!match) throw new Error("invalid-secret");
  let bytes: Uint8Array;
  try { bytes = fromBase64url(match[1]); } catch { throw new Error("invalid-secret"); }
  if (bytes.length !== 32 || new Set(bytes).size < 16) throw new Error("invalid-secret");
  return bytes;
}

function normalizeCapability(value: unknown): MediaAnalysisCapability {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid-reference");
  const item = value as Record<string, unknown>;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
  if (Object.keys(item).length !== 14 || item.v !== 1 || (item.s !== "semantic-image-analysis" && item.s !== "spatial-image-analysis" && item.s !== "image-display-geometry") || item.m !== "image" || item.b !== "media"
    || typeof item.p !== "string" || item.p.length > 240 || typeof item.o !== "string" || !uuid.test(item.o)
    || typeof item.oid !== "string" || !uuid.test(item.oid) || typeof item.ov !== "string" || item.ov.length < 1 || item.ov.length > 160
    || typeof item.oe !== "string" || item.oe.length < 1 || item.oe.length > 160 || typeof item.ou !== "string" || item.ou.length < 1 || item.ou.length > 64
    || (item.oct !== "image/jpeg" && item.oct !== "image/png") || !Number.isSafeInteger(item.oz) || Number(item.oz) < 1
    || !Number.isSafeInteger(item.iat) || Number(item.iat) < 0 || !Number.isSafeInteger(item.exp)
    || Number(item.exp) <= Number(item.iat) || Number(item.exp) - Number(item.iat) > OPAQUE_MEDIA_REFERENCE_TTL_SECONDS) throw new Error("invalid-reference");
  return item as unknown as MediaAnalysisCapability;
}
async function key(secret: string): Promise<CryptoKey> { return crypto.subtle.importKey("raw", decodeMediaAnalysisSecret(secret), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]); }
function base64url(value: Uint8Array): string { let result = ""; for (const byte of value) result += String.fromCharCode(byte); return btoa(result).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, ""); }
function fromBase64url(value: string): Uint8Array { const base64 = value.replace(/-/gu, "+").replace(/_/gu, "/") + "=".repeat((4 - value.length % 4) % 4); const decoded = atob(base64); const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0)); if (base64url(bytes) !== value) throw new Error("invalid-base64url"); return bytes; }
