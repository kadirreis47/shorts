import type { PublishCapability, PublishPlatform } from './types';
const capabilities: Record<PublishPlatform, PublishCapability> = {
  youtube: { platform: 'youtube', adapterStatus: 'authentication-required', authenticated: false, supportsScheduling: true, supportsRemoteLookup: false, supportsIdempotency: false, maxTitleLength: 100, maxDescriptionLength: 5000, maxHashtags: 15, reason: 'Official credentials and OAuth integration are not configured in this repository.', version: '2026.1' },
  tiktok: { platform: 'tiktok', adapterStatus: 'planned-only', authenticated: false, supportsScheduling: false, supportsRemoteLookup: false, supportsIdempotency: false, maxTitleLength: 150, maxDescriptionLength: 2200, maxHashtags: 10, reason: 'Official publishing adapter is planned but not implemented.', version: '2026.1' },
  instagram: { platform: 'instagram', adapterStatus: 'planned-only', authenticated: false, supportsScheduling: false, supportsRemoteLookup: false, supportsIdempotency: false, maxTitleLength: 150, maxDescriptionLength: 2200, maxHashtags: 30, reason: 'Official publishing adapter is planned but not implemented.', version: '2026.1' },
};
export function getPublishCapability(platform: PublishPlatform): PublishCapability { return { ...capabilities[platform] }; }
export function listPublishCapabilities(): readonly PublishCapability[] { return Object.values(capabilities).map((item) => ({ ...item })); }
