import { MAX_ANALYSIS_IMAGE_DIMENSION, MAX_ANALYSIS_IMAGE_PIXELS } from "./analysis-image-validation.ts";

export const IMAGE_DISPLAY_GEOMETRY_VERSION = 1 as const;

export type ImageEncodedToDisplayOrientation =
  | "identity"
  | "mirror-horizontal"
  | "rotate-180"
  | "mirror-vertical"
  | "transpose"
  | "rotate-90-cw"
  | "transverse"
  | "rotate-90-ccw";

export interface ImageDisplayDimensions { readonly width: number; readonly height: number; }

/** Source-derived technical geometry. It contains no artistic or provider authority. */
export interface ImageDisplayGeometryV1 {
  readonly version: typeof IMAGE_DISPLAY_GEOMETRY_VERSION;
  readonly mediaIdentity: string;
  readonly encodedDimensions: ImageDisplayDimensions;
  readonly displayDimensions: ImageDisplayDimensions;
  readonly encodedToDisplay: ImageEncodedToDisplayOrientation;
}

/**
 * An opaque, process-local execution capability. The renderer may inspect the
 * descriptive geometry above, but only Electron main can resolve this random
 * reference back to owner-bound geometry at FFmpeg execution time.
 */
export interface ImageDisplayGeometryExecutionAuthorityV1 {
  readonly version: 1;
  readonly reference: string;
  readonly expiresAt: string;
}

export interface TrustedImageDisplayGeometryV1 extends ImageDisplayGeometryV1 {
  /** SHA-256 of the exact validated encoded bytes; pixel-semantic, not an authority by itself. */
  readonly contentDigest: string;
  readonly executionAuthority: ImageDisplayGeometryExecutionAuthorityV1;
}

export interface ImageDisplayPoint { readonly x: number; readonly y: number; }
export interface ImageDisplayRegion { readonly x: number; readonly y: number; readonly width: number; readonly height: number; }
export interface ImageDisplayGeometryRequest { readonly reference: string; }

const orientations: readonly ImageEncodedToDisplayOrientation[] = [
  "identity", "mirror-horizontal", "rotate-180", "mirror-vertical",
  "transpose", "rotate-90-cw", "transverse", "rotate-90-ccw",
];
const mediaIdentityPattern = /^media:[A-Za-z0-9_-]{1,128}\/generated-images\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpg)$/u;
const referencePattern = /^omr1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{32,4096}$/u;
const executionReferencePattern = /^idga1_[A-Za-z0-9_-]{43}$/u;
const utcDatePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

export function normalizeImageDisplayGeometryRequest(value: unknown): ImageDisplayGeometryRequest {
  const source = strictObject(value, ["reference"]);
  if (typeof source.reference !== "string" || !referencePattern.test(source.reference)) throw new Error("Image display geometry request is invalid.");
  return Object.freeze({ reference: source.reference });
}

export function imageOrientationFromExif(value: number): ImageEncodedToDisplayOrientation {
  if (!Number.isSafeInteger(value) || value < 1 || value > 8) return "identity";
  return orientations[value - 1];
}

export function createImageDisplayGeometry(
  mediaIdentity: string,
  encodedWidth: number,
  encodedHeight: number,
  encodedToDisplay: ImageEncodedToDisplayOrientation,
): ImageDisplayGeometryV1 {
  return normalizeImageDisplayGeometry({
    version: IMAGE_DISPLAY_GEOMETRY_VERSION,
    mediaIdentity,
    encodedDimensions: { width: encodedWidth, height: encodedHeight },
    displayDimensions: swapsDimensions(encodedToDisplay)
      ? { width: encodedHeight, height: encodedWidth }
      : { width: encodedWidth, height: encodedHeight },
    encodedToDisplay,
  });
}

export function normalizeImageDisplayGeometry(value: unknown, expectedMediaIdentity?: string): ImageDisplayGeometryV1 {
  const source = strictObject(value, ["version", "mediaIdentity", "encodedDimensions", "displayDimensions", "encodedToDisplay"]);
  if (source.version !== IMAGE_DISPLAY_GEOMETRY_VERSION || typeof source.mediaIdentity !== "string"
    || !mediaIdentityPattern.test(source.mediaIdentity) || expectedMediaIdentity !== undefined && source.mediaIdentity !== expectedMediaIdentity
    || typeof source.encodedToDisplay !== "string" || !orientations.includes(source.encodedToDisplay as ImageEncodedToDisplayOrientation)) {
    throw new Error("Image display geometry is invalid.");
  }
  const encodedDimensions = dimensions(source.encodedDimensions);
  const displayDimensions = dimensions(source.displayDimensions);
  const orientation = source.encodedToDisplay as ImageEncodedToDisplayOrientation;
  const expected = swapsDimensions(orientation)
    ? { width: encodedDimensions.height, height: encodedDimensions.width }
    : encodedDimensions;
  if (displayDimensions.width !== expected.width || displayDimensions.height !== expected.height) {
    throw new Error("Image display geometry dimensions are inconsistent.");
  }
  return Object.freeze({
    version: IMAGE_DISPLAY_GEOMETRY_VERSION,
    mediaIdentity: source.mediaIdentity,
    encodedDimensions,
    displayDimensions,
    encodedToDisplay: orientation,
  });
}

export function normalizeTrustedImageDisplayGeometry(
  value: unknown,
  expectedMediaIdentity?: string,
  now = Date.now(),
): TrustedImageDisplayGeometryV1 {
  const source = strictObject(value, ["version", "mediaIdentity", "encodedDimensions", "displayDimensions", "encodedToDisplay", "contentDigest", "executionAuthority"]);
  const geometry = normalizeImageDisplayGeometry({
    version: source.version,
    mediaIdentity: source.mediaIdentity,
    encodedDimensions: source.encodedDimensions,
    displayDimensions: source.displayDimensions,
    encodedToDisplay: source.encodedToDisplay,
  }, expectedMediaIdentity);
  const authority = strictObject(source.executionAuthority, ["version", "reference", "expiresAt"]);
  const expiresAt = typeof authority.expiresAt === "string" && utcDatePattern.test(authority.expiresAt)
    ? Date.parse(authority.expiresAt)
    : Number.NaN;
  if (authority.version !== 1 || typeof authority.reference !== "string" || !executionReferencePattern.test(authority.reference)
    || !Number.isSafeInteger(expiresAt) || expiresAt <= now
    || typeof source.contentDigest !== "string" || !/^[0-9a-f]{64}$/u.test(source.contentDigest)) throw new Error("Image display geometry execution authority is invalid.");
  return Object.freeze({
    ...geometry,
    contentDigest: source.contentDigest,
    executionAuthority: Object.freeze({ version: 1 as const, reference: authority.reference, expiresAt: authority.expiresAt as string }),
  });
}

/** Pure advisory conversion. It never mutates or creates canonical framing state. */
export function encodedPointToDisplay(pointValue: ImageDisplayPoint, orientation: ImageEncodedToDisplayOrientation): ImageDisplayPoint {
  const point = normalizedPoint(pointValue);
  const { x, y } = point;
  switch (orientation) {
    case "identity": return point;
    case "mirror-horizontal": return Object.freeze({ x: 1 - x, y });
    case "rotate-180": return Object.freeze({ x: 1 - x, y: 1 - y });
    case "mirror-vertical": return Object.freeze({ x, y: 1 - y });
    case "transpose": return Object.freeze({ x: y, y: x });
    case "rotate-90-cw": return Object.freeze({ x: 1 - y, y: x });
    case "transverse": return Object.freeze({ x: 1 - y, y: 1 - x });
    case "rotate-90-ccw": return Object.freeze({ x: y, y: 1 - x });
    default: throw new Error("Image display orientation is invalid.");
  }
}

export function encodedRegionToDisplay(regionValue: ImageDisplayRegion, orientation: ImageEncodedToDisplayOrientation): ImageDisplayRegion {
  const region = normalizedRegion(regionValue);
  const corners = [
    encodedPointToDisplay({ x: region.x, y: region.y }, orientation),
    encodedPointToDisplay({ x: region.x + region.width, y: region.y }, orientation),
    encodedPointToDisplay({ x: region.x, y: region.y + region.height }, orientation),
    encodedPointToDisplay({ x: region.x + region.width, y: region.y + region.height }, orientation),
  ];
  const xs = corners.map((point) => point.x); const ys = corners.map((point) => point.y);
  const x = Math.min(...xs); const y = Math.min(...ys);
  return Object.freeze({ x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y });
}

export function imageOrientationFilters(orientation: ImageEncodedToDisplayOrientation): readonly string[] {
  switch (orientation) {
    case "identity": return Object.freeze([]);
    case "mirror-horizontal": return Object.freeze(["hflip"]);
    case "rotate-180": return Object.freeze(["hflip", "vflip"]);
    case "mirror-vertical": return Object.freeze(["vflip"]);
    case "transpose": return Object.freeze(["transpose=clock", "hflip"]);
    case "rotate-90-cw": return Object.freeze(["transpose=clock"]);
    case "transverse": return Object.freeze(["transpose=clock", "vflip"]);
    case "rotate-90-ccw": return Object.freeze(["transpose=cclock"]);
    default: throw new Error("Image display orientation is invalid.");
  }
}

function swapsDimensions(value: ImageEncodedToDisplayOrientation): boolean {
  return value === "transpose" || value === "rotate-90-cw" || value === "transverse" || value === "rotate-90-ccw";
}
function dimensions(value: unknown): ImageDisplayDimensions {
  const source = strictObject(value, ["width", "height"]);
  if (!Number.isSafeInteger(source.width) || Number(source.width) < 1 || Number(source.width) > MAX_ANALYSIS_IMAGE_DIMENSION
    || !Number.isSafeInteger(source.height) || Number(source.height) < 1 || Number(source.height) > MAX_ANALYSIS_IMAGE_DIMENSION
    || Number(source.width) * Number(source.height) > MAX_ANALYSIS_IMAGE_PIXELS) throw new Error("Image display dimensions are invalid.");
  return Object.freeze({ width: Number(source.width), height: Number(source.height) });
}
function normalizedPoint(value: unknown): ImageDisplayPoint {
  const source = strictObject(value, ["x", "y"]); return Object.freeze({ x: coordinate(source.x), y: coordinate(source.y) });
}
function normalizedRegion(value: unknown): ImageDisplayRegion {
  const source = strictObject(value, ["x", "y", "width", "height"]);
  const x = coordinate(source.x); const y = coordinate(source.y); const width = coordinate(source.width); const height = coordinate(source.height);
  if (width <= 0 || height <= 0 || x + width > 1 || y + height > 1) throw new Error("Image display region is invalid.");
  return Object.freeze({ x, y, width, height });
}
function coordinate(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) throw new Error("Image display coordinate is invalid."); return value;
}
function strictObject(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error("Image display geometry is invalid.");
  const source = value as Record<string, unknown>;
  if (Object.keys(source).length !== allowed.length || allowed.some((key) => !Object.prototype.hasOwnProperty.call(source, key)) || Object.keys(source).some((key) => !allowed.includes(key))) throw new Error("Image display geometry is invalid.");
  return source;
}
