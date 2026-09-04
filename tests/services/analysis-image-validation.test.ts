import { describe, expect, it } from 'vitest';
import { validateAnalysisImage, validateAnalysisImageWithGeometry } from '../../supabase/functions/_shared/analysis-image-validation';

describe('analysis image validation', () => {
  it('accepts bounded PNG and JPEG dimensions with matching extension, MIME, and signature', () => {
    expect(validateAnalysisImage('owner/generated-images/id.png', 'image/png', png(1080, 1920))).toBe('image/png');
    expect(validateAnalysisImage('owner/generated-images/id.jpg', 'image/jpeg', jpeg(1080, 1920))).toBe('image/jpeg');
  });

  it('returns trusted encoded-raster dimensions from the same validation pass', () => {
    expect(validateAnalysisImageWithGeometry('owner/generated-images/id.png', 'image/png', png(1080, 1920))).toEqual({ contentType: 'image/png', width: 1080, height: 1920, exifOrientation: 1 });
    expect(validateAnalysisImageWithGeometry('owner/generated-images/id.jpg', 'image/jpeg', jpeg(1920, 1080))).toEqual({ contentType: 'image/jpeg', width: 1920, height: 1080, exifOrientation: 1 });
  });

  it('reports JPEG encoded-raster geometry without applying EXIF display orientation', () => {
    expect(validateAnalysisImageWithGeometry('owner/generated-images/id.jpg', 'image/jpeg', jpegWithExifOrientation(1920, 1080, 6))).toEqual({ contentType: 'image/jpeg', width: 1920, height: 1080, exifOrientation: 6 });
  });

  it('retains the first valid JPEG SOF geometry when a later valid SOF is present', () => {
    expect(validateAnalysisImageWithGeometry('owner/generated-images/id.jpg', 'image/jpeg', jpegWithAdditionalSof(1920, 1080, 640, 480))).toEqual({ contentType: 'image/jpeg', width: 1920, height: 1080, exifOrientation: 1 });
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8])('parses bounded EXIF orientation %s without changing SOF geometry', (orientation) => {
    expect(validateAnalysisImageWithGeometry('owner/generated-images/id.jpg', 'image/jpeg', jpegWithExifOrientation(1920, 1080, orientation)))
      .toEqual({ contentType: 'image/jpeg', width: 1920, height: 1080, exifOrientation: orientation });
  });

  it('uses deterministic identity for invalid or truncated EXIF metadata', () => {
    expect(validateAnalysisImageWithGeometry('owner/generated-images/id.jpg', 'image/jpeg', jpegWithExifOrientation(20, 10, 9)).exifOrientation).toBe(1);
    expect(validateAnalysisImageWithGeometry('owner/generated-images/id.jpg', 'image/jpeg', jpegWithTruncatedExif(20, 10)).exifOrientation).toBe(1);
  });

  it('supports big-endian TIFF and deterministically retains the first valid EXIF orientation', () => {
    expect(validateAnalysisImageWithGeometry('owner/generated-images/id.jpg', 'image/jpeg', jpegWithExifOrientation(20, 10, 7, false)).exifOrientation).toBe(7);
    expect(validateAnalysisImageWithGeometry('owner/generated-images/id.jpg', 'image/jpeg', jpegWithTwoExifOrientations(20, 10, 2, 8)).exifOrientation).toBe(2);
  });

  it.each([
    ['maximum little-endian IFD offset', customExifApp1({ ifdOffset: 65_513, orientation: 6 }), 6],
    ['maximum big-endian IFD offset', customExifApp1({ ifdOffset: 65_513, orientation: 8, littleEndian: false }), 8],
    ['overflowing IFD offset', customExifApp1({ ifdOffset: 0xffff_ffff }), 1],
    ['IFD entry count over 512', customExifApp1({ entries: 513 }), 1],
    ['wrong orientation TIFF type', customExifApp1({ type: 4 }), 1],
    ['wrong orientation TIFF count', customExifApp1({ count: 2 }), 1],
    ['truncated inline orientation value', truncatedOrientationEntryApp1(), 1],
    ['minimum empty APP1 length', Uint8Array.from([0xff, 0xe1, 0, 2]), 1],
  ] as const)('handles EXIF boundary: %s', (_label, app1, expected) => {
    expect(validateAnalysisImageWithGeometry('owner/generated-images/id.jpg', 'image/jpeg', jpegWithApp1Segments(20, 10, [app1])).exifOrientation).toBe(expected);
  });

  it('skips a malformed first APP1 and accepts the first later valid EXIF block', () => {
    const malformed = customExifApp1({ type: 4, orientation: 2 });
    expect(validateAnalysisImageWithGeometry('owner/generated-images/id.jpg', 'image/jpeg', jpegWithApp1Segments(20, 10, [malformed, exifApp1(7)])).exifOrientation).toBe(7);
  });

  it('rejects APP1 lengths that run beyond the bounded JPEG bytes', () => {
    const invalidLength = Uint8Array.from([0xff, 0xe1, 0xff, 0xff, 0x45, 0x78, 0x69, 0x66]);
    expect(() => validateAnalysisImageWithGeometry('owner/generated-images/id.jpg', 'image/jpeg', jpegWithApp1Segments(20, 10, [invalidLength]))).toThrow(/invalid-image/u);
  });

  it('rejects truncated, malformed, absurd, mismatched, and arbitrary images', () => {
    const validPng = png(1080, 1920); const validJpeg = jpeg(1080, 1920);
    for (const [path, mime, bytes] of [
      ['id.png', 'image/png', validPng.slice(0, 33)],
      ['id.png', 'image/png', withByte(validPng, 29, validPng[29] ^ 1)],
      ['id.png', 'image/png', png(4096, 4096)],
      ['id.jpg', 'image/jpeg', validJpeg.slice(0, -2)],
      ['id.jpg', 'image/jpeg', Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 255, 0xff, 0xd9])],
      ['id.jpg', 'image/jpeg', Uint8Array.from([0xff, 0xd8, 0xff, 0xda, 0, 2, 0xff, 0xd9])],
      ['id.jpg', 'image/jpeg', jpeg(65_535, 65_535)],
      ['id.jpg', 'image/jpeg', validPng],
      ['id.png', 'image/png', validJpeg],
      ['id.png', 'image/png', new Uint8Array(10)],
      ['id.png', 'image/png', new Uint8Array(0)],
    ] as const) expect(() => validateAnalysisImage(path, mime, bytes)).toThrow(/invalid-image/u);
  });
});

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(58);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  setUint32(bytes, 16, width); setUint32(bytes, 20, height); bytes.set([8, 2, 0, 0, 0], 24); setUint32(bytes, 29, crc32(bytes.slice(12, 29)));
  bytes.set([0, 0, 0, 1, 0x49, 0x44, 0x41, 0x54, 0], 33); setUint32(bytes, 42, crc32(bytes.slice(37, 42)));
  bytes.set([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82], 46);
  return bytes;
}
function jpeg(width: number, height: number): Uint8Array { return Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, height >> 8, height & 255, width >> 8, width & 255, 1, 1, 0x11, 0, 0xff, 0xda, 0, 8, 1, 1, 0, 0, 63, 0, 0, 0xff, 0xd9]); }
function jpegWithAdditionalSof(firstWidth: number, firstHeight: number, secondWidth: number, secondHeight: number): Uint8Array {
  return Uint8Array.from([
    0xff, 0xd8,
    0xff, 0xc0, 0, 11, 8, firstHeight >> 8, firstHeight & 255, firstWidth >> 8, firstWidth & 255, 1, 1, 0x11, 0,
    0xff, 0xc0, 0, 11, 8, secondHeight >> 8, secondHeight & 255, secondWidth >> 8, secondWidth & 255, 1, 1, 0x11, 0,
    0xff, 0xda, 0, 8, 1, 1, 0, 0, 63, 0, 0, 0xff, 0xd9,
  ]);
}
function jpegWithExifOrientation(width: number, height: number, orientation: number, littleEndian = true): Uint8Array {
  return jpegWithApp1Segments(width, height, [exifApp1(orientation, littleEndian)]);
}
function jpegWithTwoExifOrientations(width: number, height: number, first: number, second: number): Uint8Array {
  return jpegWithApp1Segments(width, height, [exifApp1(first), exifApp1(second)]);
}
function jpegWithTruncatedExif(width: number, height: number): Uint8Array {
  return jpegWithApp1Segments(width, height, [Uint8Array.from([
    0xff, 0xe1, 0, 12, 0x45, 0x78, 0x69, 0x66, 0, 0, 0x49, 0x49, 0x2a, 0,
  ])]);
}
function exifApp1(orientation: number, littleEndian = true): Uint8Array {
  return littleEndian ? Uint8Array.from([
    0xff, 0xe1, 0, 34, 0x45, 0x78, 0x69, 0x66, 0, 0,
    0x49, 0x49, 0x2a, 0, 8, 0, 0, 0, 1, 0,
    0x12, 0x01, 3, 0, 1, 0, 0, 0, orientation, 0, 0, 0,
    0, 0, 0, 0,
  ]) : Uint8Array.from([
    0xff, 0xe1, 0, 34, 0x45, 0x78, 0x69, 0x66, 0, 0,
    0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 1,
    0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0,
    0, 0, 0, 0,
  ]);
}
function customExifApp1(options: { ifdOffset?: number; entries?: number; type?: number; count?: number; orientation?: number; littleEndian?: boolean }): Uint8Array {
  const little = options.littleEndian ?? true;
  const ifdOffset = options.ifdOffset ?? 8;
  const entries = options.entries ?? 1;
  const payloadLength = Math.max(14, 6 + (ifdOffset <= 65_513 ? ifdOffset + 14 : 8));
  const bytes = new Uint8Array(payloadLength + 4);
  bytes.set([0xff, 0xe1, (payloadLength + 2) >>> 8, (payloadLength + 2) & 255, 0x45, 0x78, 0x69, 0x66, 0, 0]);
  const tiff = 10;
  bytes.set(little ? [0x49, 0x49] : [0x4d, 0x4d], tiff);
  write16(bytes, tiff + 2, 42, little); write32(bytes, tiff + 4, ifdOffset, little);
  if (ifdOffset <= 65_513) {
    const ifd = tiff + ifdOffset;
    write16(bytes, ifd, entries, little);
    if (entries === 1) {
      write16(bytes, ifd + 2, 0x0112, little); write16(bytes, ifd + 4, options.type ?? 3, little);
      write32(bytes, ifd + 6, options.count ?? 1, little); write16(bytes, ifd + 10, options.orientation ?? 6, little);
    }
  }
  return bytes;
}
function truncatedOrientationEntryApp1(): Uint8Array {
  const payload = Uint8Array.from([
    0x45, 0x78, 0x69, 0x66, 0, 0, 0x49, 0x49, 0x2a, 0, 8, 0, 0, 0, 1, 0,
    0x12, 0x01, 3, 0, 1, 0, 0, 0, 6,
  ]);
  return Uint8Array.from([0xff, 0xe1, (payload.length + 2) >>> 8, (payload.length + 2) & 255, ...payload]);
}
function write16(bytes: Uint8Array, offset: number, value: number, little: boolean): void {
  if (little) { bytes[offset] = value; bytes[offset + 1] = value >>> 8; }
  else { bytes[offset] = value >>> 8; bytes[offset + 1] = value; }
}
function write32(bytes: Uint8Array, offset: number, value: number, little: boolean): void {
  if (little) { bytes[offset] = value; bytes[offset + 1] = value >>> 8; bytes[offset + 2] = value >>> 16; bytes[offset + 3] = value >>> 24; }
  else { bytes[offset] = value >>> 24; bytes[offset + 1] = value >>> 16; bytes[offset + 2] = value >>> 8; bytes[offset + 3] = value; }
}
function jpegWithApp1Segments(width: number, height: number, segments: readonly Uint8Array[]): Uint8Array {
  const base = jpeg(width, height);
  const total = segments.reduce((sum, segment) => sum + segment.length, base.length);
  const result = new Uint8Array(total);
  result.set(base.slice(0, 2)); let offset = 2;
  for (const segment of segments) { result.set(segment, offset); offset += segment.length; }
  result.set(base.slice(2), offset);
  return result;
}
function setUint32(bytes: Uint8Array, offset: number, value: number): void { bytes[offset] = value >>> 24; bytes[offset + 1] = value >>> 16; bytes[offset + 2] = value >>> 8; bytes[offset + 3] = value; }
function crc32(bytes: Uint8Array): number { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ 0xffffffff) >>> 0; }
function withByte(bytes: Uint8Array, index: number, value: number): Uint8Array { const copy = bytes.slice(); copy[index] = value; return copy; }
