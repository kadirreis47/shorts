import type { MediaStorageObject } from '@/lib/types';
import type { MediaAsset } from './types';

const CANONICAL_PRIVATE_MEDIA_PATH = /^[^/]+\/(?:videos\/[0-9a-f-]+\.(?:webm|mp4)|generated-images\/[0-9a-f-]+\.(?:png|jpg)|voiceovers\/[0-9a-f-]+\.mp3|music\/[0-9a-f-]+\.mp3)$/i;

/**
 * Shared structural gate for canonical media identities. Owner validation is
 * deliberately performed at signing/Recipe boundaries; this prevents staging
 * namespaces from entering the source/manifest pipeline at all.
 */
export function isCanonicalPrivateMediaIdentity(value: unknown): value is MediaStorageObject {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && (value as Partial<MediaStorageObject>).bucket === 'media'
    && typeof (value as Partial<MediaStorageObject>).objectPath === 'string'
    && CANONICAL_PRIVATE_MEDIA_PATH.test((value as MediaStorageObject).objectPath));
}

export function privateStorageSource(identity: MediaStorageObject): string {
  return `shortsflow-storage://${identity.bucket}/${identity.objectPath}`;
}

export function mediaStorageIdentityFromMetadata(metadata: Readonly<Record<string, unknown>>): MediaStorageObject | null {
  const identity = metadata.storageBucket === 'media' && typeof metadata.storageObjectPath === 'string'
    ? { bucket: 'media' as const, objectPath: metadata.storageObjectPath }
    : null;
  return identity && isCanonicalPrivateMediaIdentity(identity) ? identity : null;
}

export function canonicalMediaAssetSource(asset: MediaAsset): string {
  const identity = mediaStorageIdentityFromMetadata(asset.metadata);
  return identity ? privateStorageSource(identity) : asset.source;
}
