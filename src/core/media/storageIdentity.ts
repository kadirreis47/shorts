import type { MediaStorageObject } from '@/lib/types';
import type { MediaAsset } from './types';

export function privateStorageSource(identity: MediaStorageObject): string {
  return `shortsflow-storage://${identity.bucket}/${identity.objectPath}`;
}

export function mediaStorageIdentityFromMetadata(metadata: Readonly<Record<string, unknown>>): MediaStorageObject | null {
  return metadata.storageBucket === 'media' && typeof metadata.storageObjectPath === 'string'
    ? { bucket: 'media', objectPath: metadata.storageObjectPath }
    : null;
}

export function canonicalMediaAssetSource(asset: MediaAsset): string {
  const identity = mediaStorageIdentityFromMetadata(asset.metadata);
  return identity ? privateStorageSource(identity) : asset.source;
}
