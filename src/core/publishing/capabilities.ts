import type { PublishCapability, PublishPlatform } from './types';
const capabilities: Record<PublishPlatform, PublishCapability> = {
  youtube: { platform: 'youtube', adapterStatus: 'implemented', authenticated: false, supportsScheduling: true, supportsRemoteLookup: true, supportsIdempotency: true, maxTitleLength: 100, maxDescriptionLength: 5000, maxHashtags: 15, reason: 'Modern Electron resumable publishing is available for authenticated accounts.', version: '2026.2' },
  tiktok: { platform: 'tiktok', adapterStatus: 'planned-only', authenticated: false, supportsScheduling: false, supportsRemoteLookup: false, supportsIdempotency: false, maxTitleLength: 150, maxDescriptionLength: 2200, maxHashtags: 10, reason: 'Official publishing adapter is planned but not implemented.', version: '2026.1' },
  instagram: { platform: 'instagram', adapterStatus: 'planned-only', authenticated: false, supportsScheduling: false, supportsRemoteLookup: false, supportsIdempotency: false, maxTitleLength: 150, maxDescriptionLength: 2200, maxHashtags: 30, reason: 'Official publishing adapter is planned but not implemented.', version: '2026.1' },
};
export function getPublishCapability(platform: PublishPlatform, authenticated?: boolean): PublishCapability {
  const capability = capabilities[platform];
  return {
    ...capability,
    authenticated: platform === 'youtube' && typeof authenticated === 'boolean'
      ? authenticated
      : capability.authenticated,
  };
}

export function listPublishCapabilities(authentication: Partial<Record<PublishPlatform, boolean>> = {}): readonly PublishCapability[] {
  return Object.keys(capabilities).map((platform) => getPublishCapability(
    platform as PublishPlatform,
    authentication[platform as PublishPlatform],
  ));
}
