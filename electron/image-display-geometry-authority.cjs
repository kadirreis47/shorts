const { createHash, randomBytes, timingSafeEqual } = require('crypto');
const fs = require('fs');
const path = require('path');

const IMAGE_PATH = /^(?<owner>[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/generated-images\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpg)$/i;
const ORIENTATIONS = new Set(['identity', 'mirror-horizontal', 'rotate-180', 'mirror-vertical', 'transpose', 'rotate-90-cw', 'transverse', 'rotate-90-ccw']);
const OPAQUE_REFERENCE = /^omr1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{32,4096}$/;
// Long enough for one bounded render session; still process-local, owner-session
// bound, capped, and expired before it can become durable draft authority.
const HANDLE_TTL_MS = 60 * 60 * 1000;
const MAX_HANDLES = 256;
const MAX_HANDLES_PER_WEB_CONTENTS = 64;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ORIENTATION_FILTERS = Object.freeze({
  identity: Object.freeze([]),
  'mirror-horizontal': Object.freeze(['hflip']),
  'rotate-180': Object.freeze(['hflip', 'vflip']),
  'mirror-vertical': Object.freeze(['vflip']),
  transpose: Object.freeze(['transpose=clock', 'hflip']),
  'rotate-90-cw': Object.freeze(['transpose=clock']),
  transverse: Object.freeze(['transpose=clock', 'vflip']),
  'rotate-90-ccw': Object.freeze(['transpose=cclock']),
});

class ImageDisplayGeometryAuthorityError extends Error {
  constructor(code, message = 'Trusted image display geometry is unavailable.') {
    super(message);
    this.name = 'ImageDisplayGeometryAuthorityError';
    this.code = code;
  }
}

function createImageDisplayGeometryAuthorityService({
  ownerContext,
  resolveConfig,
  fetchImpl = globalThis.fetch,
  random = randomBytes,
  now = () => Date.now(),
} = {}) {
  if (!ownerContext?.capture || !ownerContext?.assertCurrent || typeof resolveConfig !== 'function' || typeof fetchImpl !== 'function') {
    throw new TypeError('Image geometry authority requires a trusted owner and Supabase transport.');
  }
  const handles = new Map();
  ownerContext.onTransition?.(() => handles.clear());

  async function resolve(webContentsId, input) {
    if (!Number.isSafeInteger(webContentsId) || webContentsId < 1) throw new ImageDisplayGeometryAuthorityError('geometry-authority-invalid');
    const owner = ownerContext.capture();
    const media = normalizeMedia(input?.media, owner.ownerId);
    const accessToken = normalizeAccessToken(input?.accessToken, owner.ownerId, now());
    const config = resolveConfig();
    if (!config?.url || !config?.anonKey) throw new ImageDisplayGeometryAuthorityError('geometry-not-configured');
    const headers = { apikey: config.anonKey, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
    const issued = await postFunction(fetchImpl, config.url, 'media-analysis-reference', { media, scope: 'image-display-geometry' }, headers);
    if (!issued || typeof issued.reference !== 'string' || !OPAQUE_REFERENCE.test(issued.reference)
      || issued.scope !== 'image-display-geometry' || issued.mediaType !== 'image') {
      throw new ImageDisplayGeometryAuthorityError('geometry-invalid-response');
    }
    const resolved = normalizeGeometry(await postFunction(fetchImpl, config.url, 'resolve-image-display-geometry', { reference: issued.reference }, headers), `media:${media.objectPath}`);
    const geometry = resolved.geometry;
    ownerContext.assertCurrent(owner);
    pruneHandles(handles, now());
    let reference = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const candidate = `idga1_${random(32).toString('base64url')}`;
      if (!handles.has(candidate)) { reference = candidate; break; }
    }
    if (!reference) throw new ImageDisplayGeometryAuthorityError('geometry-authority-unavailable');
    const expiresAtMs = now() + HANDLE_TTL_MS;
    const record = Object.freeze({
      reference,
      ownerId: owner.ownerId,
      ownerGeneration: owner.generation,
      webContentsId,
      mediaIdentity: geometry.mediaIdentity,
      geometry,
      contentDigest: resolved.contentDigest,
      expiresAtMs,
    });
    handles.set(reference, record);
    while ([...handles.values()].filter((value) => value.webContentsId === webContentsId).length > MAX_HANDLES_PER_WEB_CONTENTS) {
      const oldest = [...handles].find(([, value]) => value.webContentsId === webContentsId);
      if (!oldest) break;
      handles.delete(oldest[0]);
    }
    while (handles.size > MAX_HANDLES) handles.delete(handles.keys().next().value);
    return Object.freeze({
      ...geometry,
      contentDigest: resolved.contentDigest,
      executionAuthority: Object.freeze({ version: 1, reference, expiresAt: new Date(expiresAtMs).toISOString() }),
    });
  }

  function authorize(webContentsId, reference, mediaIdentity, expectedOrientation, expectedContentDigest) {
    if (!Number.isSafeInteger(webContentsId) || webContentsId < 1) throw new ImageDisplayGeometryAuthorityError('geometry-authority-invalid');
    const owner = ownerContext.capture();
    pruneHandles(handles, now());
    const record = handles.get(reference);
    if (!record || record.webContentsId !== webContentsId || record.ownerId !== owner.ownerId || record.ownerGeneration !== owner.generation
      || record.mediaIdentity !== mediaIdentity || record.geometry.encodedToDisplay !== expectedOrientation
      || record.contentDigest !== expectedContentDigest) {
      throw new ImageDisplayGeometryAuthorityError('geometry-authority-invalid');
    }
    ownerContext.assertCurrent(owner);
    return Object.freeze({ geometry: record.geometry, contentDigest: record.contentDigest });
  }

  function clear() { handles.clear(); }
  function clearWebContents(webContentsId) {
    for (const [reference, record] of handles) if (record.webContentsId === webContentsId) handles.delete(reference);
  }
  function stats() {
    pruneHandles(handles, now());
    const perWebContents = {};
    for (const record of handles.values()) perWebContents[record.webContentsId] = (perWebContents[record.webContentsId] || 0) + 1;
    return Object.freeze({ total: handles.size, perWebContents: Object.freeze(perWebContents) });
  }
  return Object.freeze({ resolve, authorize, clear, clearWebContents, stats });
}

async function postFunction(fetchImpl, baseUrl, name, body, headers) {
  let response;
  try {
    response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/functions/v1/${name}`, {
      method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000),
    });
  } catch { throw new ImageDisplayGeometryAuthorityError('geometry-network-failure'); }
  let text;
  try { text = await response.text(); } catch { throw new ImageDisplayGeometryAuthorityError('geometry-invalid-response'); }
  if (text.length > 65_536) throw new ImageDisplayGeometryAuthorityError('geometry-invalid-response');
  if (!response.ok) throw new ImageDisplayGeometryAuthorityError(response.status === 401 ? 'geometry-unauthorized' : response.status === 429 ? 'geometry-quota-rejected' : 'geometry-resolution-failed');
  try { return JSON.parse(text); } catch { throw new ImageDisplayGeometryAuthorityError('geometry-invalid-response'); }
}

function normalizeAccessToken(value, ownerId, currentTime) {
  if (typeof value !== 'string' || value.length < 20 || value.length > 16_384 || /\s/.test(value)) throw new ImageDisplayGeometryAuthorityError('geometry-unauthorized');
  try {
    const payload = JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString('utf8'));
    if (payload?.sub !== ownerId || !Number.isFinite(payload?.exp) || payload.exp * 1000 <= currentTime) throw new Error();
  } catch { throw new ImageDisplayGeometryAuthorityError('geometry-unauthorized'); }
  return value;
}

function normalizeMedia(value, ownerId) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.bucket !== 'media' || typeof value.objectPath !== 'string') {
    throw new ImageDisplayGeometryAuthorityError('geometry-invalid-media');
  }
  const match = IMAGE_PATH.exec(value.objectPath);
  if (!match || match.groups.owner.toLowerCase() !== ownerId.toLowerCase()) throw new ImageDisplayGeometryAuthorityError('geometry-invalid-media');
  return Object.freeze({ bucket: 'media', objectPath: value.objectPath });
}

function normalizeGeometry(value, expectedIdentity) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 6
    || value.version !== 1 || value.mediaIdentity !== expectedIdentity || !ORIENTATIONS.has(value.encodedToDisplay)
    || typeof value.contentDigest !== 'string' || !/^[0-9a-f]{64}$/.test(value.contentDigest)) {
    throw new ImageDisplayGeometryAuthorityError('geometry-invalid-response');
  }
  const encoded = normalizeDimensions(value.encodedDimensions);
  const display = normalizeDimensions(value.displayDimensions);
  const swaps = ['transpose', 'rotate-90-cw', 'transverse', 'rotate-90-ccw'].includes(value.encodedToDisplay);
  if (display.width !== (swaps ? encoded.height : encoded.width) || display.height !== (swaps ? encoded.width : encoded.height)) {
    throw new ImageDisplayGeometryAuthorityError('geometry-invalid-response');
  }
  return Object.freeze({
    geometry: Object.freeze({ version: 1, mediaIdentity: expectedIdentity, encodedDimensions: encoded, displayDimensions: display, encodedToDisplay: value.encodedToDisplay }),
    contentDigest: value.contentDigest,
  });
}

function normalizeDimensions(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 2
    || !Number.isSafeInteger(value.width) || !Number.isSafeInteger(value.height)
    || value.width < 1 || value.height < 1 || value.width > 4096 || value.height > 4096 || value.width * value.height > 16_000_000) {
    throw new ImageDisplayGeometryAuthorityError('geometry-invalid-response');
  }
  return Object.freeze({ width: value.width, height: value.height });
}

function pruneHandles(handles, currentTime) {
  for (const [reference, record] of handles) if (record.expiresAtMs <= currentTime) handles.delete(reference);
}

function materializeImageDisplayGeometryArgs(args, declarations, authorityService, supabaseUrl, options = {}) {
  return authorizeImageDisplayGeometryArgs(args, declarations, authorityService, supabaseUrl, options).args;
}

/** Main-internal preflight: authority metadata must approve framing provenance before crop argv is compiled. */
function authorizeCanonicalImageIntent(scenes, authorityService, webContentsId) {
  if (!Array.isArray(scenes)) throw new ImageDisplayGeometryAuthorityError('geometry-authority-invalid');
  for (const scene of scenes) {
    if (scene?.source?.kind !== 'private-image') continue;
    if (Boolean(scene.source.framing) !== Boolean(scene.source.framingBinding)) {
      throw new ImageDisplayGeometryAuthorityError('geometry-framing-binding-invalid');
    }
    const declaration = normalizeAuthorityDeclaration({
      ...scene.source.geometry,
      ...(scene.source.framingBinding ? { framingBinding: scene.source.framingBinding } : {}),
    });
    const authorized = authorizeDeclaration(declaration, authorityService, webContentsId);
    assertAuthorizedImmutableIdentity(declaration, authorized);
  }
}

function authorizeImageDisplayGeometryArgs(args, declarations, authorityService, supabaseUrl, {
  webContentsId = null,
  trustedCanonicalFilters = false,
} = {}) {
  const declared = Array.isArray(declarations) ? declarations : [];
  if (declared.length > 64) throw new ImageDisplayGeometryAuthorityError('geometry-authority-invalid');
  const filterArguments = args.flatMap((arg, index) => {
    if (/^-(?:vf|filter(?::v(?::\d+)?)?|filter_complex|lavfi)=/i.test(arg)) return [arg.slice(arg.indexOf('=') + 1)];
    return index > 0 && /^-(?:vf|filter(?::v(?::\d+)?)?|filter_complex|lavfi)$/i.test(args[index - 1]) ? [arg] : [];
  });
  if (!trustedCanonicalFilters && filterArguments.some((arg) => /\b(?:hflip|vflip|transpose)\b|\b(?:a?movie)\s*=|https?|shortsflow-storage|storage\/v1/i.test(arg))) {
    throw new ImageDisplayGeometryAuthorityError('geometry-filter-injection');
  }
  const inputs = [];
  let groupStart = 0;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== '-i' || index + 1 >= args.length) continue;
    inputs.push({ inputIndex: inputs.length, optionStart: groupStart, optionEnd: index, source: args[index + 1] });
    groupStart = index + 2;
    index += 1;
  }
  const used = new Set();
  const authorizedInputs = [];
  let output = [...args];
  for (const input of inputs) {
    const identity = privateImageIdentityFromSource(input.source, supabaseUrl);
    const options = args.slice(input.optionStart, input.optionEnd);
    const loopsImage = options.some((value, index) => value === '-loop' && options[index + 1] === '1');
    const imageDemuxer = options.some((value, index) => (value === '-f' && options[index + 1] === 'image2') || value === '-framerate');
    const noAutorotateCount = options.filter((value) => value === '-noautorotate').length;
    if (!identity) {
      if (noAutorotateCount > 0) throw new ImageDisplayGeometryAuthorityError('geometry-video-separation');
      if (loopsImage || imageDemuxer || /\.(?:png|jpe?g)(?:[?#].*)?$/i.test(input.source) || /^data:image\//i.test(input.source)) {
        throw new ImageDisplayGeometryAuthorityError('mutable-external-image', 'Mutable or local images must be promoted to authority-bound private media before verified FFmpeg execution.');
      }
      continue;
    }
    if (!loopsImage || noAutorotateCount !== 1) throw new ImageDisplayGeometryAuthorityError('geometry-autorotate-policy');
    const rawDeclaration = declared.find((value) => value?.inputIndex === input.inputIndex);
    if (!rawDeclaration || used.has(rawDeclaration)) throw new ImageDisplayGeometryAuthorityError('geometry-authority-invalid');
    const declaration = normalizeAuthorityDeclaration(rawDeclaration);
    const authorized = authorizeDeclaration(declaration, authorityService, webContentsId);
    assertAuthorizedImmutableIdentity(declaration, authorized);
    const geometry = authorized?.geometry ?? authorized;
    if (declaration.mediaIdentity !== identity) throw new ImageDisplayGeometryAuthorityError('geometry-media-mismatch');
    const placeholder = `{{IMAGE_DISPLAY_GEOMETRY_INPUT_${input.inputIndex}}}`;
    const occurrences = output.reduce((count, arg) => count + arg.split(placeholder).length - 1, 0);
    if (occurrences !== 1) throw new ImageDisplayGeometryAuthorityError('geometry-filter-placeholder-invalid');
    assertCanonicalPlaceholderPlacement(output, placeholder, input.inputIndex);
    const filters = ORIENTATION_FILTERS[geometry.encodedToDisplay];
    output = output.map((arg) => arg.replaceAll(placeholder, filters.length ? filters.join(',') : 'null'));
    used.add(rawDeclaration);
    authorizedInputs.push(Object.freeze({
      inputIndex: input.inputIndex,
      sourceArgIndex: input.optionEnd + 1,
      source: input.source,
      mediaIdentity: identity,
      contentDigest: declaration.contentDigest,
    }));
  }
  if (used.size !== declared.length || output.some((arg) => /\{\{IMAGE_DISPLAY_GEOMETRY_INPUT_\d+\}\}/.test(arg))) {
    throw new ImageDisplayGeometryAuthorityError('geometry-authority-invalid');
  }
  return Object.freeze({ args: output, authorizedInputs: Object.freeze(authorizedInputs) });
}

function authorizeDeclaration(declaration, authorityService, webContentsId) {
  if (!authorityService?.authorize) throw new ImageDisplayGeometryAuthorityError('geometry-authority-unavailable');
  return authorityService.authorize(webContentsId, declaration.authorityReference, declaration.mediaIdentity, declaration.expectedOrientation, declaration.contentDigest);
}

function normalizeAuthorityDeclaration(value) {
  const allowed = ['inputIndex', 'authorityReference', 'mediaIdentity', 'expectedOrientation', 'contentDigest', 'encodedDimensions', 'displayDimensions', 'framingBinding'];
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype
    || Object.keys(value).some((key) => !allowed.includes(key))
    || !Number.isSafeInteger(value.inputIndex) || value.inputIndex < 0 || value.inputIndex > 63
    || typeof value.authorityReference !== 'string' || !/^idga1_[A-Za-z0-9_-]{43}$/.test(value.authorityReference)
    || typeof value.mediaIdentity !== 'string' || !/^media:[0-9a-f-]{36}\/generated-images\/[0-9a-f-]{36}\.(?:png|jpg)$/i.test(value.mediaIdentity)
    || !ORIENTATIONS.has(value.expectedOrientation)
    || typeof value.contentDigest !== 'string' || !/^[0-9a-f]{64}$/.test(value.contentDigest)) {
    throw new ImageDisplayGeometryAuthorityError('geometry-authority-invalid');
  }
  const encodedDimensions = normalizeDimensions(value.encodedDimensions);
  const displayDimensions = normalizeDimensions(value.displayDimensions);
  const swaps = ['transpose', 'rotate-90-cw', 'transverse', 'rotate-90-ccw'].includes(value.expectedOrientation);
  if (displayDimensions.width !== (swaps ? encodedDimensions.height : encodedDimensions.width)
    || displayDimensions.height !== (swaps ? encodedDimensions.width : encodedDimensions.height)) {
    throw new ImageDisplayGeometryAuthorityError('geometry-authority-invalid');
  }
  const framingBinding = value.framingBinding === undefined ? undefined : normalizeFramingBinding(value.framingBinding);
  return Object.freeze({
    inputIndex: value.inputIndex,
    authorityReference: value.authorityReference,
    mediaIdentity: value.mediaIdentity,
    expectedOrientation: value.expectedOrientation,
    contentDigest: value.contentDigest,
    encodedDimensions,
    displayDimensions,
    ...(framingBinding ? { framingBinding } : {}),
  });
}

function normalizeFramingBinding(value) {
  const allowed = ['version', 'mediaIdentity', 'contentDigest', 'encodedDimensions', 'displayDimensions', 'encodedToDisplay'];
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype
    || Object.keys(value).length !== allowed.length || allowed.some((key) => !Object.prototype.hasOwnProperty.call(value, key))
    || Object.keys(value).some((key) => !allowed.includes(key)) || value.version !== 1
    || typeof value.mediaIdentity !== 'string' || !/^media:[0-9a-f-]{36}\/generated-images\/[0-9a-f-]{36}\.(?:png|jpg)$/i.test(value.mediaIdentity)
    || typeof value.contentDigest !== 'string' || !/^[0-9a-f]{64}$/.test(value.contentDigest)
    || !ORIENTATIONS.has(value.encodedToDisplay)) {
    throw new ImageDisplayGeometryAuthorityError('geometry-framing-binding-invalid');
  }
  const encodedDimensions = normalizeDimensions(value.encodedDimensions);
  const displayDimensions = normalizeDimensions(value.displayDimensions);
  const swaps = ['transpose', 'rotate-90-cw', 'transverse', 'rotate-90-ccw'].includes(value.encodedToDisplay);
  if (displayDimensions.width !== (swaps ? encodedDimensions.height : encodedDimensions.width)
    || displayDimensions.height !== (swaps ? encodedDimensions.width : encodedDimensions.height)) {
    throw new ImageDisplayGeometryAuthorityError('geometry-framing-binding-invalid');
  }
  return Object.freeze({ version: 1, mediaIdentity: value.mediaIdentity, contentDigest: value.contentDigest, encodedDimensions, displayDimensions, encodedToDisplay: value.encodedToDisplay });
}

function assertAuthorizedImmutableIdentity(declaration, authorized) {
  const geometry = authorized?.geometry;
  const digest = authorized?.contentDigest;
  if (!geometry || typeof digest !== 'string'
    || declaration.mediaIdentity !== geometry.mediaIdentity
    || declaration.contentDigest !== digest
    || declaration.expectedOrientation !== geometry.encodedToDisplay
    || declaration.encodedDimensions.width !== geometry.encodedDimensions?.width
    || declaration.encodedDimensions.height !== geometry.encodedDimensions?.height
    || declaration.displayDimensions.width !== geometry.displayDimensions?.width
    || declaration.displayDimensions.height !== geometry.displayDimensions?.height) {
    throw new ImageDisplayGeometryAuthorityError('geometry-authority-invalid');
  }
  const binding = declaration.framingBinding;
  if (binding && (binding.mediaIdentity !== geometry.mediaIdentity
    || binding.contentDigest !== digest
    || binding.encodedToDisplay !== geometry.encodedToDisplay
    || binding.encodedDimensions.width !== geometry.encodedDimensions.width
    || binding.encodedDimensions.height !== geometry.encodedDimensions.height
    || binding.displayDimensions.width !== geometry.displayDimensions.width
    || binding.displayDimensions.height !== geometry.displayDimensions.height)) {
    throw new ImageDisplayGeometryAuthorityError('geometry-framing-binding-mismatch');
  }
}

async function prepareImageDisplayGeometryExecution(
  args,
  declarations,
  authorityService,
  supabaseUrl,
  { fetchImpl = globalThis.fetch, fsApi = fs, tempDir, ownerContext = null, executionOwner = null, webContentsId = null, trustedCanonicalFilters = false } = {},
) {
  if (typeof fetchImpl !== 'function' || typeof tempDir !== 'string' || !path.isAbsolute(tempDir)) {
    throw new ImageDisplayGeometryAuthorityError('geometry-authority-unavailable');
  }
  const authorized = authorizeImageDisplayGeometryArgs(args, declarations, authorityService, supabaseUrl, { webContentsId, trustedCanonicalFilters });
  const output = [...authorized.args];
  for (const input of authorized.authorizedInputs) {
    if (executionOwner) ownerContext?.assertCurrent(executionOwner);
    if (typeof input.contentDigest !== 'string' || !/^[0-9a-f]{64}$/.test(input.contentDigest)) {
      throw new ImageDisplayGeometryAuthorityError('geometry-authority-invalid');
    }
    const bytes = await readExactPrivateImage(fetchImpl, input.source, input.contentDigest, executionOwner?.signal);
    if (executionOwner) ownerContext?.assertCurrent(executionOwner);
    const extension = input.mediaIdentity.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
    const target = path.join(tempDir, `trusted-image-${input.inputIndex}.${extension}`);
    await fsApi.promises.writeFile(target, bytes, { flag: 'wx' });
    if (executionOwner) ownerContext?.assertCurrent(executionOwner);
    output[input.sourceArgIndex] = target;
  }
  return output;
}

function assertCanonicalPlaceholderPlacement(args, placeholder, inputIndex) {
  const argumentIndex = args.findIndex((arg) => arg.includes(placeholder));
  if (argumentIndex < 0) throw new ImageDisplayGeometryAuthorityError('geometry-filter-placeholder-invalid');
  const value = args[argumentIndex];
  const segmentPlacement = inputIndex === 0 && args[argumentIndex - 1] === '-vf'
    && (value === placeholder || value.startsWith(`${placeholder},`));
  const filterComplexPlacement = args[argumentIndex - 1] === '-filter_complex'
    && value.split(`[${inputIndex}:v]${placeholder}`).length - 1 === 1
    && value.split(`[${inputIndex}:v]`).length - 1 === 1;
  if (!segmentPlacement && !filterComplexPlacement) {
    throw new ImageDisplayGeometryAuthorityError('geometry-filter-placeholder-invalid');
  }
}

async function readExactPrivateImage(fetchImpl, source, expectedDigest, ownerSignal) {
  let response;
  try {
    const timeoutSignal = AbortSignal.timeout(30_000);
    const signal = ownerSignal && typeof AbortSignal.any === 'function'
      ? AbortSignal.any([timeoutSignal, ownerSignal]) : (ownerSignal || timeoutSignal);
    response = await fetchImpl(source, {
      method: 'GET', redirect: 'error',
      headers: { Accept: 'image/png,image/jpeg', 'Cache-Control': 'no-store' },
      signal,
    });
  } catch { throw new ImageDisplayGeometryAuthorityError('geometry-media-read-failed'); }
  if (!response?.ok || !response.body) throw new ImageDisplayGeometryAuthorityError('geometry-media-read-failed');
  const declared = response.headers?.get?.('content-length');
  if (declared !== null && declared !== undefined && (!/^\d{1,12}$/.test(declared) || Number(declared) < 1 || Number(declared) > MAX_IMAGE_BYTES)) {
    throw new ImageDisplayGeometryAuthorityError('geometry-media-read-failed');
  }
  const reader = response.body.getReader();
  const chunks = []; let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_IMAGE_BYTES) { await reader.cancel(); throw new ImageDisplayGeometryAuthorityError('geometry-media-read-failed'); }
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    if (error instanceof ImageDisplayGeometryAuthorityError) throw error;
    throw new ImageDisplayGeometryAuthorityError('geometry-media-read-failed');
  } finally { reader.releaseLock(); }
  if (total < 1 || declared !== null && declared !== undefined && total !== Number(declared)) throw new ImageDisplayGeometryAuthorityError('geometry-media-read-failed');
  const bytes = Buffer.concat(chunks, total);
  const actual = createHash('sha256').update(bytes).digest();
  const expected = Buffer.from(expectedDigest, 'hex');
  if (expected.length !== actual.length || !timingSafeEqual(actual, expected)) throw new ImageDisplayGeometryAuthorityError('geometry-media-changed');
  return bytes;
}

function privateImageIdentityFromSource(source, supabaseUrl) {
  try {
    const sourceUrl = new URL(source);
    const trusted = new URL(supabaseUrl);
    if (sourceUrl.protocol !== 'https:' || sourceUrl.origin !== trusted.origin) return null;
    const prefix = '/storage/v1/object/sign/media/';
    if (!sourceUrl.pathname.startsWith(prefix)) return null;
    const objectPath = decodeURIComponent(sourceUrl.pathname.slice(prefix.length));
    return IMAGE_PATH.test(objectPath) ? `media:${objectPath}` : null;
  } catch { return null; }
}

module.exports = {
  ImageDisplayGeometryAuthorityError,
  createImageDisplayGeometryAuthorityService,
  materializeImageDisplayGeometryArgs,
  authorizeCanonicalImageIntent,
  authorizeImageDisplayGeometryArgs,
  prepareImageDisplayGeometryExecution,
  normalizeGeometry,
  privateImageIdentityFromSource,
};
