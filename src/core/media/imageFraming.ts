import {
  normalizeImageDisplayGeometry,
  normalizeTrustedImageDisplayGeometry,
  type ImageEncodedToDisplayOrientation,
} from './imageDisplayGeometry';

export const IMAGE_FRAMING_VERSION = 1 as const;
export const IMAGE_FRAMING_COORDINATE_SCALE = 10_000;

export interface ImageFramingAnchor {
  readonly x: number;
  readonly y: number;
}

/** Canonical artistic framing in display-oriented normalized coordinates. */
export interface ImageFramingV1 {
  readonly version: typeof IMAGE_FRAMING_VERSION;
  readonly mode: 'focal-cover';
  readonly anchor: ImageFramingAnchor;
}

/** Non-authorizing immutable identity of the exact image geometry an anchor was approved against. */
export interface ImageFramingBindingV1 {
  readonly version: 1;
  readonly mediaIdentity: string;
  readonly contentDigest: string;
  readonly encodedDimensions: ImageFramingDimensions;
  readonly displayDimensions: ImageFramingDimensions;
  readonly encodedToDisplay: ImageEncodedToDisplayOrientation;
}

export interface ImageFramingDimensions {
  readonly width: number;
  readonly height: number;
}

export interface ImageFramingCropWindow {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Strict canonical boundary. Valid exact-center framing is represented by absence. */
export function normalizeImageFraming(value: unknown): ImageFramingV1 | undefined {
  const source = strictObject(value, ['version', 'mode', 'anchor']);
  if (source.version !== IMAGE_FRAMING_VERSION || source.mode !== 'focal-cover') {
    throw new Error('Image framing is invalid.');
  }
  const anchor = strictObject(source.anchor, ['x', 'y']);
  const x = canonicalCoordinate(anchor.x);
  const y = canonicalCoordinate(anchor.y);
  if (x === 0.5 && y === 0.5) return undefined;
  return Object.freeze({
    version: IMAGE_FRAMING_VERSION,
    mode: 'focal-cover' as const,
    anchor: Object.freeze({ x, y }),
  });
}

/** Converts bounded manual input into canonical four-decimal state. */
export function imageFramingFromAnchor(anchor: ImageFramingAnchor): ImageFramingV1 | undefined {
  if (!anchor || typeof anchor !== 'object' || Array.isArray(anchor)
    || typeof anchor.x !== 'number' || !Number.isFinite(anchor.x) || anchor.x < 0 || anchor.x > 1
    || typeof anchor.y !== 'number' || !Number.isFinite(anchor.y) || anchor.y < 0 || anchor.y > 1) {
    throw new Error('Image framing anchor is invalid.');
  }
  const x = quantizeCoordinate(anchor.x);
  const y = quantizeCoordinate(anchor.y);
  return normalizeImageFraming({ version: 1, mode: 'focal-cover', anchor: { x, y } });
}

export function deriveImageCoverCropWindow(
  displayDimensions: ImageFramingDimensions,
  outputDimensions: ImageFramingDimensions,
  framing?: ImageFramingV1,
): ImageFramingCropWindow {
  const display = dimensions(displayDimensions);
  const output = dimensions(outputDimensions);
  const normalized = framing === undefined ? undefined : normalizeImageFraming(framing);
  const anchor = normalized?.anchor ?? { x: 0.5, y: 0.5 };
  const sourceAspect = display.width / display.height;
  const targetAspect = output.width / output.height;
  const width = sourceAspect > targetAspect ? targetAspect / sourceAspect : 1;
  const height = sourceAspect > targetAspect ? 1 : sourceAspect / targetAspect;
  return Object.freeze({
    x: clamp(anchor.x - width / 2, 0, 1 - width),
    y: clamp(anchor.y - height / 2, 0, 1 - height),
    width,
    height,
  });
}

/** Main-independent TypeScript compiler used for planning and fingerprints. */
export function canonicalImageCropFilter(
  outputWidth: number,
  outputHeight: number,
  framing?: ImageFramingV1,
): string {
  const output = dimensions({ width: outputWidth, height: outputHeight });
  const normalized = framing === undefined ? undefined : normalizeImageFraming(framing);
  if (!normalized) return `crop=${output.width}:${output.height}`;
  const x = formatImageFramingCoordinate(normalized.anchor.x);
  const y = formatImageFramingCoordinate(normalized.anchor.y);
  return `crop=${output.width}:${output.height}:x='min(max(${x}*iw-${output.width}/2,0),iw-${output.width})':y='min(max(${y}*ih-${output.height}/2,0),ih-${output.height})'`;
}

export function imageFramingEqual(left?: ImageFramingV1, right?: ImageFramingV1): boolean {
  const a = left === undefined ? undefined : normalizeImageFraming(left);
  const b = right === undefined ? undefined : normalizeImageFraming(right);
  return a?.anchor.x === b?.anchor.x && a?.anchor.y === b?.anchor.y;
}

export function normalizeImageFramingBinding(value: unknown, expectedMediaIdentity?: string): ImageFramingBindingV1 {
  const source = strictObject(value, [
    'version', 'mediaIdentity', 'contentDigest', 'encodedDimensions', 'displayDimensions', 'encodedToDisplay',
  ]);
  const geometry = normalizeImageDisplayGeometry({
    version: source.version,
    mediaIdentity: source.mediaIdentity,
    encodedDimensions: source.encodedDimensions,
    displayDimensions: source.displayDimensions,
    encodedToDisplay: source.encodedToDisplay,
  }, expectedMediaIdentity);
  if (typeof source.contentDigest !== 'string' || !/^[0-9a-f]{64}$/u.test(source.contentDigest)) {
    throw new Error('Image framing binding is invalid.');
  }
  return bindingFromNormalizedGeometry(geometry, source.contentDigest);
}

/** Captures a binding only from a currently live trusted geometry authority. */
export function imageFramingBindingFromTrustedGeometry(
  value: unknown,
  expectedMediaIdentity?: string,
  now = Date.now(),
): ImageFramingBindingV1 {
  const geometry = normalizeTrustedImageDisplayGeometry(value, expectedMediaIdentity, now);
  return bindingFromNormalizedGeometry(geometry, geometry.contentDigest);
}

/** Reads immutable metadata from historical geometry without treating its capability as live. */
export function imageFramingBindingFromHistoricalGeometry(
  value: unknown,
  expectedMediaIdentity?: string,
): ImageFramingBindingV1 {
  const source = strictObject(value, [
    'version', 'mediaIdentity', 'encodedDimensions', 'displayDimensions', 'encodedToDisplay', 'contentDigest', 'executionAuthority',
  ]);
  return normalizeImageFramingBinding({
    version: source.version,
    mediaIdentity: source.mediaIdentity,
    contentDigest: source.contentDigest,
    encodedDimensions: source.encodedDimensions,
    displayDimensions: source.displayDimensions,
    encodedToDisplay: source.encodedToDisplay,
  }, expectedMediaIdentity);
}

export function imageFramingBindingMatchesTrustedGeometry(
  bindingValue: unknown,
  geometryValue: unknown,
  expectedMediaIdentity?: string,
  now = Date.now(),
): boolean {
  try {
    const binding = normalizeImageFramingBinding(bindingValue, expectedMediaIdentity);
    const current = imageFramingBindingFromTrustedGeometry(geometryValue, expectedMediaIdentity, now);
    return imageFramingBindingEqual(binding, current);
  } catch {
    return false;
  }
}

export function imageFramingBindingEqual(left?: ImageFramingBindingV1, right?: ImageFramingBindingV1): boolean {
  if (left === undefined || right === undefined) return left === right;
  const a = normalizeImageFramingBinding(left);
  const b = normalizeImageFramingBinding(right);
  return a.version === b.version
    && a.mediaIdentity === b.mediaIdentity
    && a.contentDigest === b.contentDigest
    && a.encodedToDisplay === b.encodedToDisplay
    && a.encodedDimensions.width === b.encodedDimensions.width
    && a.encodedDimensions.height === b.encodedDimensions.height
    && a.displayDimensions.width === b.displayDimensions.width
    && a.displayDimensions.height === b.displayDimensions.height;
}

export function formatImageFramingCoordinate(value: number): string {
  const coordinate = canonicalCoordinate(value);
  return coordinate.toFixed(4).replace(/0+$/u, '').replace(/\.$/u, '');
}

function canonicalCoordinate(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1
    || Math.round(value * IMAGE_FRAMING_COORDINATE_SCALE) / IMAGE_FRAMING_COORDINATE_SCALE !== value) {
    throw new Error('Image framing coordinate is invalid.');
  }
  return value;
}

function quantizeCoordinate(value: number): number {
  return Math.round(value * IMAGE_FRAMING_COORDINATE_SCALE) / IMAGE_FRAMING_COORDINATE_SCALE;
}

function bindingFromNormalizedGeometry(
  geometry: ReturnType<typeof normalizeImageDisplayGeometry>,
  contentDigest: string,
): ImageFramingBindingV1 {
  return Object.freeze({
    version: 1 as const,
    mediaIdentity: geometry.mediaIdentity,
    contentDigest,
    encodedDimensions: Object.freeze({ ...geometry.encodedDimensions }),
    displayDimensions: Object.freeze({ ...geometry.displayDimensions }),
    encodedToDisplay: geometry.encodedToDisplay,
  });
}

function dimensions(value: ImageFramingDimensions): ImageFramingDimensions {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !Number.isSafeInteger(value.width) || value.width < 1 || value.width > 16_384
    || !Number.isSafeInteger(value.height) || value.height < 1 || value.height > 16_384) {
    throw new Error('Image framing dimensions are invalid.');
  }
  return value;
}

function strictObject(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error('Image framing is invalid.');
  }
  const source = value as Record<string, unknown>;
  if (Object.keys(source).length !== keys.length
    || keys.some((key) => !Object.prototype.hasOwnProperty.call(source, key))
    || Object.keys(source).some((key) => !keys.includes(key))) {
    throw new Error('Image framing is invalid.');
  }
  return source;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
