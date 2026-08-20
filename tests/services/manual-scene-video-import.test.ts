import { describe, expect, it } from 'vitest';
import { MAX_MANUAL_SCENE_VIDEO_BYTES, requireOneManualSceneVideo, validateManualSceneVideo } from '@/lib/manualSceneVideoImport';

function mp4(size = 24): Blob {
  const bytes = new Uint8Array(Math.max(size, 24));
  bytes.set([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
  return new Blob([bytes], { type: 'video/mp4' });
}

describe('bounded manual MP4 scene import', () => {
  it('accepts a plausible bounded MP4 header before the trusted probe', async () => {
    await expect(validateManualSceneVideo(mp4())).resolves.toBeUndefined();
  });
  it('rejects the wrong MIME, empty files, oversize files, and invalid ftyp before probing', async () => {
    await expect(validateManualSceneVideo(new Blob([new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70])], { type: 'video/webm' }))).rejects.toThrow(/mime/);
    await expect(validateManualSceneVideo(new Blob([], { type: 'video/mp4' }))).rejects.toThrow(/empty/);
    await expect(validateManualSceneVideo(new Blob([new Uint8Array(MAX_MANUAL_SCENE_VIDEO_BYTES + 1)], { type: 'video/mp4' }))).rejects.toThrow(/too-large/);
    await expect(validateManualSceneVideo(new Blob([new Uint8Array([0, 0, 0, 24, 0x6a, 0x75, 0x6e, 0x6b])], { type: 'video/mp4' }))).rejects.toThrow(/signature/);
  });
  it('requires exactly one selected file', () => {
    expect(() => requireOneManualSceneVideo([])).toThrow(/selection/);
    expect(() => requireOneManualSceneVideo([{} as File, {} as File])).toThrow(/selection/);
  });
});
