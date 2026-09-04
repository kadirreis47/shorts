export const MAX_ANALYSIS_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_ANALYSIS_IMAGE_DIMENSION = 4_096;
export const MAX_ANALYSIS_IMAGE_PIXELS = 16_000_000;
const MAX_JPEG_HEADER_BYTES = 1024 * 1024;
const MAX_JPEG_SEGMENTS = 4_096;
const MAX_PNG_CHUNKS = 4_096;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export type AnalysisImageContentType = "image/jpeg" | "image/png";
export interface ValidatedAnalysisImage {
  readonly contentType: AnalysisImageContentType;
  /** Encoded-raster dimensions. JPEG EXIF orientation is reported separately and never applied here. */
  readonly width: number;
  readonly height: number;
  /** JPEG EXIF orientation 1-8; PNG and malformed/unsupported EXIF resolve to 1. */
  readonly exifOrientation: number;
}

/** Validates MIME, extension, signature and dimensions without decoding pixels. */
export function validateAnalysisImage(path: string, contentType: string, bytes: Uint8Array): AnalysisImageContentType {
  return validateAnalysisImageWithGeometry(path, contentType, bytes).contentType;
}

/** Returns only server-derived geometry from the same strict validation pass. */
export function validateAnalysisImageWithGeometry(path: string, contentType: string, bytes: Uint8Array): ValidatedAnalysisImage {
  if (bytes.length < 1 || bytes.length > MAX_ANALYSIS_IMAGE_BYTES) throw new Error("invalid-image");
  const png = path.endsWith(".png") && contentType === "image/png" ? validPng(bytes) : null;
  if (png) return Object.freeze({ contentType: "image/png", ...png, exifOrientation: 1 });
  const jpeg = path.endsWith(".jpg") && contentType === "image/jpeg" ? validJpeg(bytes) : null;
  if (jpeg) return Object.freeze({ contentType: "image/jpeg", ...jpeg });
  throw new Error("invalid-image");
}

function validPng(bytes: Uint8Array): { readonly width: number; readonly height: number } | null {
  if (bytes.length < 57 || !PNG_SIGNATURE.every((byte, index) => bytes[index] === byte) || uint32(bytes, 8) !== 13 || ascii(bytes, 12, 16) !== "IHDR") return null;
  const width = uint32(bytes, 16); const height = uint32(bytes, 20);
  if (!dimensions(width, height) || !validPngColor(bytes[24], bytes[25]) || bytes[26] !== 0 || bytes[27] !== 0 || (bytes[28] !== 0 && bytes[28] !== 1)) return null;
  if (uint32(bytes, 29) !== crc32(bytes.slice(12, 29))) return null;
  let offset = 33; let chunks = 1; let sawIdat = false;
  while (offset < bytes.length && chunks < MAX_PNG_CHUNKS) {
    if (offset + 12 > bytes.length) return null;
    const length = uint32(bytes, offset); const end = offset + 12 + length;
    if (!Number.isSafeInteger(end) || end > bytes.length) return null;
    const type = ascii(bytes, offset + 4, offset + 8);
    if (uint32(bytes, offset + 8 + length) !== crc32(bytes.slice(offset + 4, offset + 8 + length))) return null;
    if (type === "IHDR") return null;
    if (type === "IDAT") { if (length < 1) return null; sawIdat = true; }
    if (type === "IEND") return length === 0 && sawIdat && end === bytes.length ? Object.freeze({ width, height }) : null;
    offset = end; chunks += 1;
  }
  return null;
}

function validPngColor(bitDepth: number, colorType: number): boolean {
  if (colorType === 0) return [1, 2, 4, 8, 16].includes(bitDepth);
  if (colorType === 2 || colorType === 4 || colorType === 6) return [8, 16].includes(bitDepth);
  return colorType === 3 && [1, 2, 4, 8].includes(bitDepth);
}

function validJpeg(bytes: Uint8Array): { readonly width: number; readonly height: number; readonly exifOrientation: number } | null {
  if (bytes.length < 6 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) return null;
  let offset = 2; let segments = 0; let headerBytes = 0; let geometry: { readonly width: number; readonly height: number } | null = null; let sawScan = false; let exifOrientation: number | null = null;
  while (offset < bytes.length && segments < MAX_JPEG_SEGMENTS) {
    if (bytes[offset] !== 0xff) return null;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return null;
    const marker = bytes[offset++]; segments += 1;
    if (marker === 0xd9) return geometry && sawScan && offset === bytes.length ? { ...geometry, exifOrientation: exifOrientation ?? 1 } : null;
    if (marker === 0xd8 || marker === 0x00) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) return null;
    const length = uint16(bytes, offset);
    if (length < 2 || offset + length > bytes.length) return null;
    headerBytes += length + 2;
    if (headerBytes > MAX_JPEG_HEADER_BYTES) return null;
    if (isSof(marker)) {
      const components = bytes[offset + 7];
      if (length < 11 || components < 1 || length !== 8 + components * 3) return null;
      const height = uint16(bytes, offset + 3); const width = uint16(bytes, offset + 5);
      if (!dimensions(width, height)) return null;
      // Preserve the existing semantic validator's acceptance of additional
      // valid SOF segments while treating the first frame as the encoded raster.
      geometry ??= Object.freeze({ width, height });
    }
    if (marker === 0xe1 && exifOrientation === null) exifOrientation = readExifOrientation(bytes, offset + 2, length - 2);
    if (marker === 0xda) {
      const components = bytes[offset + 2];
      if (!geometry || length < 8 || components < 1 || length !== 6 + components * 2) return null;
      sawScan = true; offset += length;
      while (offset < bytes.length) {
        if (bytes[offset] !== 0xff) { offset += 1; continue; }
        const next = bytes[offset + 1];
        if (next === 0x00 || next === 0xff || (next >= 0xd0 && next <= 0xd7)) { offset += 2; continue; }
        break;
      }
      continue;
    }
    offset += length;
  }
  return null;
}

/** Returns null for absent or malformed EXIF. Malformed metadata never invalidates otherwise valid pixels. */
function readExifOrientation(bytes: Uint8Array, start: number, length: number): number | null {
  if (length < 14 || start < 0 || start + length > bytes.length || ascii(bytes, start, start + 6) !== "Exif\0\0") return null;
  const tiff = start + 6; const little = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49;
  if (!little && !(bytes[tiff] === 0x4d && bytes[tiff + 1] === 0x4d)) return null;
  const read16 = (offset: number) => little ? bytes[offset] + bytes[offset + 1] * 256 : uint16(bytes, offset);
  const read32 = (offset: number) => little
    ? bytes[offset] + bytes[offset + 1] * 256 + bytes[offset + 2] * 65_536 + bytes[offset + 3] * 16_777_216
    : uint32(bytes, offset);
  const end = start + length;
  if (tiff + 8 > end || read16(tiff + 2) !== 42) return null;
  const ifdOffset = read32(tiff + 4); const ifd = tiff + ifdOffset;
  if (!Number.isSafeInteger(ifd) || ifdOffset < 8 || ifd + 2 > end) return null;
  const entries = read16(ifd);
  if (entries > 512 || ifd + 2 + entries * 12 > end) return null;
  for (let index = 0; index < entries; index += 1) {
    const entry = ifd + 2 + index * 12;
    if (read16(entry) !== 0x0112) continue;
    if (read16(entry + 2) !== 3 || read32(entry + 4) !== 1) return null;
    const orientation = read16(entry + 8);
    return orientation >= 1 && orientation <= 8 ? orientation : null;
  }
  return null;
}

function isSof(marker: number): boolean { return [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker); }
function dimensions(width: number, height: number): boolean { return Number.isSafeInteger(width) && Number.isSafeInteger(height) && width > 0 && height > 0 && width <= MAX_ANALYSIS_IMAGE_DIMENSION && height <= MAX_ANALYSIS_IMAGE_DIMENSION && width * height <= MAX_ANALYSIS_IMAGE_PIXELS; }
function uint16(bytes: Uint8Array, offset: number): number { return bytes[offset] * 256 + bytes[offset + 1]; }
function uint32(bytes: Uint8Array, offset: number): number { return bytes[offset] * 2 ** 24 + bytes[offset + 1] * 2 ** 16 + bytes[offset + 2] * 256 + bytes[offset + 3]; }
function ascii(bytes: Uint8Array, start: number, end: number): string { return String.fromCharCode(...bytes.slice(start, end)); }
function crc32(bytes: Uint8Array): number { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ 0xffffffff) >>> 0; }
