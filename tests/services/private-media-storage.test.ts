import { beforeEach, describe, expect, it, vi } from 'vitest';
import { advanceValidatedOwnerGeneration, setValidatedOwnerId } from '@/auth/identity';

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  createSignedUrl: vi.fn(),
  from: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    storage: {
      from: mocks.from,
    },
  },
}));

import {
  assertCurrentOwnerMediaIdentity,
  createPrivateMediaSignedUrl,
  materializePrivateManifestMedia,
  PRIVATE_MEDIA_SIGNED_URL_TTL_SECONDS,
  toDurableScene,
  uploadPrivateMedia,
} from '@/lib/mediaStorage';
import { createSourceSceneProvider } from '@/core/media/providers/sourceSceneProvider';
import { createRenderFingerprint } from '@/core/render/renderFingerprint';
import type { MediaAsset, RenderManifest } from '@/core/media';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('private media renderer boundary', () => {
  beforeEach(() => {
    setValidatedOwnerId('11111111-1111-4111-8111-111111111111');
    mocks.upload.mockResolvedValue({ error: null });
    mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed.example/media' }, error: null });
    mocks.from.mockReturnValue({ upload: mocks.upload, createSignedUrl: mocks.createSignedUrl });
  });

  it('constructs a bounded owner-prefixed path from validated identity', async () => {
    const result = await uploadPrivateMedia(new Blob(['video'], { type: 'video/webm' }), 'videos');
    const uploadedPath = mocks.upload.mock.calls[0][0] as string;
    expect(uploadedPath).toMatch(/^11111111-1111-4111-8111-111111111111\/videos\/[0-9a-f-]+\.webm$/i);
    expect(result.media).toEqual({ bucket: 'media', objectPath: uploadedPath });
    expect(result.videoUrl).toBe('https://signed.example/media');
    expect(mocks.createSignedUrl).toHaveBeenCalledWith(uploadedPath, PRIVATE_MEDIA_SIGNED_URL_TTL_SECONDS);
  });

  it('fails closed while signed out and rejects a foreign path before asking Storage to sign it', async () => {
    setValidatedOwnerId(null);
    await expect(uploadPrivateMedia(new Blob(['video'], { type: 'video/webm' }), 'videos')).rejects.toThrow(/authenticated user/i);
    setValidatedOwnerId('11111111-1111-4111-8111-111111111111');
    await expect(createPrivateMediaSignedUrl({
      bucket: 'media',
      objectPath: '22222222-2222-4222-8222-222222222222/videos/foreign.webm',
    })).rejects.toThrow(/not available/i);
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
  });

  it('does not accept arbitrary renderer media classes or object paths', async () => {
    await expect(uploadPrivateMedia(new Blob(['video'], { type: 'video/webm' }), 'other' as never)).rejects.toThrow(/class is not supported/i);
    await expect(createPrivateMediaSignedUrl({
      bucket: 'media',
      objectPath: '11111111-1111-4111-8111-111111111111/../../foreign-object',
    })).rejects.toThrow(/not available/i);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
    expect(() => assertCurrentOwnerMediaIdentity({
      bucket: 'media',
      objectPath: '22222222-2222-4222-8222-222222222222/generated-images/11111111-1111-4111-8111-111111111111.png',
    })).toThrow(/not available/i);
  });

  it('does not return an A upload to B after an owner-generation change', async () => {
    const pendingUpload = deferred<{ error: null }>();
    mocks.upload.mockReturnValueOnce(pendingUpload.promise);
    const upload = uploadPrivateMedia(new Blob(['video'], { type: 'video/webm' }), 'videos');
    setValidatedOwnerId('22222222-2222-4222-8222-222222222222');
    advanceValidatedOwnerGeneration();
    pendingUpload.resolve({ error: null });
    await expect(upload).rejects.toThrow(/authenticated user changed/i);
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
  });

  it('does not materialize an A-owned recovered asset after an A to B transition', async () => {
    const objectPath = '11111111-1111-4111-8111-111111111111/generated-images/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png';
    const pendingUrl = deferred<{ data: { signedUrl: string }; error: null }>();
    mocks.createSignedUrl.mockReturnValueOnce(pendingUrl.promise);
    const recoveryManifest = {
      assets: [{
        id: 'asset-1', type: 'image', source: `shortsflow-storage://media/${objectPath}`,
        metadata: { storageBucket: 'media', storageObjectPath: objectPath },
      }],
      validation: null,
    } as unknown as RenderManifest;

    const materialization = materializePrivateManifestMedia(recoveryManifest);
    setValidatedOwnerId('22222222-2222-4222-8222-222222222222');
    advanceValidatedOwnerGeneration();
    pendingUrl.resolve({ data: { signedUrl: 'https://signed.example/media?token=a' }, error: null });

    await expect(materialization).rejects.toThrow(/authenticated user changed/i);
  });

  it('keeps signed URLs transient when serializing canonical scene identity', () => {
    expect(toDurableScene({
      text: 'scene', duration: 3, visual: 'visual',
      imageUrl: 'https://signed.example/expiring',
      imageStorage: { bucket: 'media', objectPath: '11111111-1111-4111-8111-111111111111/generated-images/image.png' },
    })).toEqual({
      text: 'scene', duration: 3, visual: 'visual',
      imageStorage: { bucket: 'media', objectPath: '11111111-1111-4111-8111-111111111111/generated-images/image.png' },
    });
  });

  it('keeps canonical manifests stable and materializes a signed URL only for rendering', async () => {
    const objectPath = '11111111-1111-4111-8111-111111111111/generated-images/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png';
    const mediaScene = {
      id: 'scene-1', durationMs: 3_000,
      sourceScene: {
        text: 'scene', duration: 3, visual: 'visual',
        imageStorage: { bucket: 'media', objectPath },
      },
    } as never;
    const provider = createSourceSceneProvider(new Map([['scene-1', mediaScene]]));
    const candidates = await provider.search({ sceneId: 'scene-1' } as never, { limit: 1 });
    expect(candidates[0].source).toBe(`shortsflow-storage://media/${objectPath}`);
    expect(candidates[0].metadata).toMatchObject({ storageBucket: 'media', storageObjectPath: objectPath });

    const stableAsset: MediaAsset = {
      id: 'asset-1', type: 'image', source: candidates[0].source, metadata: candidates[0].metadata ?? {},
    };
    const stableManifest = { assets: [stableAsset], validation: null } as unknown as RenderManifest;
    const materialized = await materializePrivateManifestMedia(stableManifest);
    expect(materialized.assets[0].source).toBe('https://signed.example/media');
    expect(stableManifest.assets[0].source).toBe(`shortsflow-storage://media/${objectPath}`);

    const firstFingerprint = await createRenderFingerprint({
      manifest: { ...stableManifest, assets: [{ ...stableAsset, source: 'https://signed.example/first' }] } as never,
      preset: {} as never,
      adapterId: 'ffmpeg',
    });
    const secondFingerprint = await createRenderFingerprint({
      manifest: { ...stableManifest, assets: [{ ...stableAsset, source: 'https://signed.example/second' }] } as never,
      preset: {} as never,
      adapterId: 'ffmpeg',
    });
    expect(firstFingerprint).toBe(secondFingerprint);
  });
});
