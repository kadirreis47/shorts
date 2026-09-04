import { createImageDisplayGeometry, imageOrientationFromExif, normalizeImageDisplayGeometryRequest } from './image-display-geometry.ts';
import type { ResolvedMediaAnalysisReference } from './media-analysis-reference-gateway.ts';

type AuthorizationResult = { readonly ok: true; readonly userId: string } | { readonly ok: false; readonly response: Response };
type JsonResult = { readonly ok: true; readonly value: object } | { readonly ok: false; readonly response: Response };

export interface ResolveImageDisplayGeometryHandlerDependencies {
  readonly authorize: (req: Request, functionName: 'resolve-image-display-geometry') => Promise<AuthorizationResult>;
  readonly readJson?: (req: Request, maxBytes: number) => Promise<JsonResult>;
  readonly resolveReference: (userId: string, reference: string) => Promise<ResolvedMediaAnalysisReference>;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

export async function handleResolveImageDisplayGeometryRequest(
  req: Request,
  dependencies: ResolveImageDisplayGeometryHandlerDependencies,
): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return safeFailure('Method not allowed.', 405);
  try {
    const authorization = await dependencies.authorize(req, 'resolve-image-display-geometry');
    if ('response' in authorization) return authorization.response;
    const parsed = await (dependencies.readJson ?? readBoundedRequestJson)(req, 4_608);
    if ('response' in parsed) return parsed.response;
    let request;
    try { request = normalizeImageDisplayGeometryRequest(parsed.value); }
    catch { return safeFailure('Invalid image display geometry request.', 400); }
    const resolved = await dependencies.resolveReference(authorization.userId, request.reference);
    return jsonResponse({
      ...createImageDisplayGeometry(
        resolved.mediaIdentity,
        resolved.width,
        resolved.height,
        imageOrientationFromExif(resolved.exifOrientation),
      ),
      // Electron main retains this exact-byte binding internally. It is never
      // accepted from durable renderer state and never enters output identity.
      contentDigest: resolved.contentDigest,
    });
  } catch (error) {
    const reason = error && typeof error === 'object' && typeof (error as { reason?: unknown }).reason === 'string'
      ? (error as { reason: string }).reason : 'unexpected';
    const status = reason === 'expired-reference' || reason === 'scope-mismatch' || reason === 'invalid-reference' ? 403
      : reason === 'media-not-found' ? 404 : reason === 'media-too-large' ? 413 : 503;
    return safeFailure('Image display geometry could not be resolved.', status);
  }
}

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function safeFailure(message: string, status: number): Response { return jsonResponse({ error: message }, status); }

async function readBoundedRequestJson(req: Request, maxBytes: number): Promise<JsonResult> {
  try {
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.byteLength > maxBytes) return { ok: false, response: safeFailure('Request body is too large.', 413) };
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    return value && typeof value === 'object' && !Array.isArray(value)
      ? { ok: true, value }
      : { ok: false, response: safeFailure('Invalid request body.', 400) };
  } catch { return { ok: false, response: safeFailure('Invalid request body.', 400) }; }
}
