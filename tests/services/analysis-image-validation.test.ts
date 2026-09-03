import { describe, expect, it } from 'vitest';
import { validateAnalysisImage } from '../../supabase/functions/_shared/analysis-image-validation';

describe('analysis image validation', () => {
  it('accepts bounded PNG and JPEG dimensions with matching extension, MIME, and signature', () => {
    expect(validateAnalysisImage('owner/generated-images/id.png', 'image/png', png(1080, 1920))).toBe('image/png');
    expect(validateAnalysisImage('owner/generated-images/id.jpg', 'image/jpeg', jpeg(1080, 1920))).toBe('image/jpeg');
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
function setUint32(bytes: Uint8Array, offset: number, value: number): void { bytes[offset] = value >>> 24; bytes[offset + 1] = value >>> 16; bytes[offset + 2] = value >>> 8; bytes[offset + 3] = value; }
function crc32(bytes: Uint8Array): number { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ 0xffffffff) >>> 0; }
function withByte(bytes: Uint8Array, index: number, value: number): Uint8Array { const copy = bytes.slice(); copy[index] = value; return copy; }
