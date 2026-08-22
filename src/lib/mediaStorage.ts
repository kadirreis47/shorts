import { getValidatedOwnerGeneration, getValidatedOwnerId, isCurrentValidatedOwnerContext } from '@/auth/identity';
import { supabase } from '@/lib/supabase';
import type { MediaStorageObject, Scene } from '@/lib/types';
import type { RenderManifest } from '@/core/media';
import { mediaStorageIdentityFromMetadata } from '@/core/media/storageIdentity';

export const PRIVATE_MEDIA_BUCKET = 'media' as const;
export const PRIVATE_MEDIA_SIGNED_URL_TTL_SECONDS = 60 * 60;

export type PrivateMediaClass = 'videos' | 'generated-images' | 'voiceovers' | 'music';
export const PEXELS_VIDEO_QUARANTINE_PREFIX = 'pexels-video-quarantine';

export interface ValidatedMediaOwnerContext {
  readonly ownerId: string;
  readonly generation: number;
}

export interface PrivateMediaUpload {
  readonly imageUrl?: string;
  readonly videoUrl?: string;
  readonly audioUrl?: string;
  readonly media: MediaStorageObject;
}

export function captureValidatedMediaOwnerContext(): ValidatedMediaOwnerContext {
  const ownerId = getValidatedOwnerId();
  if (!ownerId) throw new Error('Private media access requires an authenticated user.');
  return { ownerId, generation: getValidatedOwnerGeneration() };
}

export function assertCurrentMediaOwnerContext(context: ValidatedMediaOwnerContext): void {
  if (!isCurrentValidatedOwnerContext(context.ownerId, context.generation)) {
    throw new Error('The authenticated user changed while private media was being processed.');
  }
}

function extensionForBlob(file: Blob, mediaClass: PrivateMediaClass): string {
  if (mediaClass === 'videos' && file.type === 'video/webm') return 'webm';
  if (mediaClass === 'videos' && file.type === 'video/mp4') return 'mp4';
  if (mediaClass === 'generated-images' && file.type === 'image/png') return 'png';
  if (mediaClass === 'generated-images' && file.type === 'image/jpeg') return 'jpg';
  if ((mediaClass === 'voiceovers' || mediaClass === 'music') && file.type === 'audio/mpeg') return 'mp3';
  throw new Error('This media type is not supported for private upload.');
}

function ownerPath(context: ValidatedMediaOwnerContext, mediaClass: PrivateMediaClass, extension: string): string {
  if (mediaClass !== 'videos' && mediaClass !== 'generated-images' && mediaClass !== 'voiceovers' && mediaClass !== 'music') {
    throw new Error('This private media class is not supported.');
  }
  return `${context.ownerId}/${mediaClass}/${crypto.randomUUID()}.${extension}`;
}

function assertOwnedMediaIdentity(identity: MediaStorageObject, context: ValidatedMediaOwnerContext): void {
  const escapedOwner = context.ownerId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const boundedPath = new RegExp(`^${escapedOwner}/(?:videos/[0-9a-f-]+\\.(?:webm|mp4)|generated-images/[0-9a-f-]+\\.(?:png|jpg)|voiceovers/[0-9a-f-]+\\.mp3|music/[0-9a-f-]+\\.mp3)$`, 'i');
  if (identity.bucket !== PRIVATE_MEDIA_BUCKET || !boundedPath.test(identity.objectPath)) {
    throw new Error('Private media is not available for the authenticated user.');
  }
}

export function assertCurrentOwnerMediaIdentity(identity: unknown): asserts identity is MediaStorageObject {
  if (!identity || typeof identity !== 'object' || Array.isArray(identity)) {
    throw new Error('Private media returned an invalid durable identity.');
  }
  const candidate = identity as Partial<MediaStorageObject>;
  if (candidate.bucket !== PRIVATE_MEDIA_BUCKET || typeof candidate.objectPath !== 'string') {
    throw new Error('Private media returned an invalid durable identity.');
  }
  assertOwnedMediaIdentity(candidate as MediaStorageObject, captureValidatedMediaOwnerContext());
}

export async function uploadPrivateMedia(file: Blob, mediaClass: PrivateMediaClass): Promise<PrivateMediaUpload> {
  const context = captureValidatedMediaOwnerContext();
  if (mediaClass !== 'videos' && mediaClass !== 'generated-images' && mediaClass !== 'voiceovers' && mediaClass !== 'music') {
    throw new Error('This private media class is not supported.');
  }
  const objectPath = ownerPath(context, mediaClass, extensionForBlob(file, mediaClass));
  const { error } = await supabase.storage.from(PRIVATE_MEDIA_BUCKET).upload(objectPath, file, {
    contentType: file.type,
    upsert: false,
  });
  assertCurrentMediaOwnerContext(context);
  if (error) throw new Error('Private media could not be stored.');

  const media: MediaStorageObject = { bucket: PRIVATE_MEDIA_BUCKET, objectPath };
  const signedUrl = await createPrivateMediaSignedUrl(media, context);
  return mediaClass === 'videos'
    ? { videoUrl: signedUrl, media }
    : mediaClass === 'voiceovers' || mediaClass === 'music'
      ? { audioUrl: signedUrl, media }
      : { imageUrl: signedUrl, media };
}

export async function createPrivateMediaSignedUrl(
  identity: MediaStorageObject,
  capturedContext = captureValidatedMediaOwnerContext(),
): Promise<string> {
  assertCurrentMediaOwnerContext(capturedContext);
  assertOwnedMediaIdentity(identity, capturedContext);
  const { data, error } = await supabase.storage
    .from(PRIVATE_MEDIA_BUCKET)
    .createSignedUrl(identity.objectPath, PRIVATE_MEDIA_SIGNED_URL_TTL_SECONDS);
  assertCurrentMediaOwnerContext(capturedContext);
  if (error || !data?.signedUrl) throw new Error('Private media could not be opened.');
  return data.signedUrl;
}

export function toDurableScene(scene: Scene): Scene {
  const durable = { ...scene };
  if (durable.imageStorage) delete durable.imageUrl;
  if (durable.videoStorage) delete durable.videoUrl;
  return durable;
}

export function toDurableScenes(scenes: readonly Scene[]): Scene[] {
  return scenes.map(toDurableScene);
}

export async function resolvePrivateSceneMedia(scenes: readonly Scene[]): Promise<Scene[]> {
  if (!scenes.some((scene) => scene.imageStorage || scene.videoStorage)) return scenes.map((scene) => ({ ...scene }));
  const context = captureValidatedMediaOwnerContext();
  const resolved = await Promise.all(scenes.map(async (scene) => {
    const next = { ...scene };
    if (scene.imageStorage) next.imageUrl = await createPrivateMediaSignedUrl(scene.imageStorage, context);
    if (scene.videoStorage) next.videoUrl = await createPrivateMediaSignedUrl(scene.videoStorage, context);
    return next;
  }));
  assertCurrentMediaOwnerContext(context);
  return resolved;
}

export async function materializePrivateManifestMedia(manifest: RenderManifest): Promise<RenderManifest> {
  const privateAssets = manifest.assets.filter((asset) => mediaStorageIdentityFromMetadata(asset.metadata));
  const hasInvalidPrivateAsset = manifest.assets.some((asset) => {
    const metadata = asset.metadata;
    return (metadata.storageBucket !== undefined || metadata.storageObjectPath !== undefined)
      && !mediaStorageIdentityFromMetadata(metadata);
  });
  if (hasInvalidPrivateAsset) throw new Error('Private media manifest identity is invalid.');
  if (privateAssets.length === 0) return manifest;
  const context = captureValidatedMediaOwnerContext();
  const assets = await Promise.all(manifest.assets.map(async (asset) => {
    const identity = mediaStorageIdentityFromMetadata(asset.metadata);
    return identity
      ? { ...asset, source: await createPrivateMediaSignedUrl(identity, context) }
      : asset;
  }));
  assertCurrentMediaOwnerContext(context);
  return { ...manifest, assets };
}
