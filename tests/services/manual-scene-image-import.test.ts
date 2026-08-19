import { describe, expect, it } from 'vitest';
import { MAX_MANUAL_SCENE_IMAGE_BYTES, requireOneManualSceneImage, validateManualSceneImage } from '@/lib/manualSceneImageImport';

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x08, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);

function image(bytes: Uint8Array, type: 'image/png' | 'image/jpeg'): Blob {
  return new Blob([bytes], { type });
}

describe('manual scene image import validation', () => {
  it('requires exactly one selected file', () => {
    expect(() => requireOneManualSceneImage(null)).toThrow(/selection/);
    expect(() => requireOneManualSceneImage([])).toThrow(/selection/);
  });

  it('accepts a non-empty PNG with the exact signature', async () => {
    await expect(validateManualSceneImage(image(PNG_SIGNATURE, 'image/png'))).resolves.toBeUndefined();
  });

  it('accepts a JPEG with bounded opening and closing markers', async () => {
    await expect(validateManualSceneImage(image(JPEG_BYTES, 'image/jpeg'))).resolves.toBeUndefined();
  });

  it('rejects a JPEG MIME claim with fake JPEG bytes', async () => {
    await expect(validateManualSceneImage(image(PNG_SIGNATURE, 'image/jpeg')))
      .rejects.toMatchObject({ code: 'signature' });
  });

  it('rejects a JPEG extension-style MIME mismatch before upload', async () => {
    await expect(validateManualSceneImage(image(JPEG_BYTES, 'image/png')))
      .rejects.toMatchObject({ code: 'signature' });
  });

  it('rejects an empty JPEG candidate', async () => {
    await expect(validateManualSceneImage(new Blob([], { type: 'image/jpeg' })))
      .rejects.toMatchObject({ code: 'empty' });
  });

  it('rejects a PNG MIME claim without PNG bytes', async () => {
    await expect(validateManualSceneImage(image(new Uint8Array([1, 2, 3]), 'image/png')))
      .rejects.toMatchObject({ code: 'signature' });
  });

  it('accepts the exact 20 MB boundary', async () => {
    const atLimit = new Blob([PNG_SIGNATURE, new Uint8Array(MAX_MANUAL_SCENE_IMAGE_BYTES - PNG_SIGNATURE.byteLength)], { type: 'image/png' });
    await expect(validateManualSceneImage(atLimit)).resolves.toBeUndefined();
  });

  it('rejects files larger than the bounded 20 MB limit', async () => {
    const oversized = new Blob([PNG_SIGNATURE, new Uint8Array(MAX_MANUAL_SCENE_IMAGE_BYTES - PNG_SIGNATURE.byteLength + 1)], { type: 'image/png' });
    await expect(validateManualSceneImage(oversized))
      .rejects.toMatchObject({ code: 'too-large' });
  });
});
