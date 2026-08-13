import type { Video } from '@/lib/types';
import type { CanonicalChannelIdentity } from '@/services/canonicalChannelCatalog';

export interface SafePublishingTarget {
  platform: 'youtube';
  publishingAccountId: string;
  channelRef: string;
}

export interface VideoChannelAttribution {
  channel_id: string | null;
  publishing_platform: 'youtube' | null;
  publishing_account_id: string | null;
  publishing_channel_ref: string | null;
}

export function isConsistentVideoChannelAttribution(
  attribution: Partial<VideoChannelAttribution>,
): boolean {
  const legacy = Boolean(attribution.channel_id)
    && attribution.publishing_platform == null
    && attribution.publishing_account_id == null
    && attribution.publishing_channel_ref == null;
  const native = attribution.channel_id == null
    && attribution.publishing_platform === 'youtube'
    && Boolean(attribution.publishing_account_id?.trim())
    && Boolean(attribution.publishing_channel_ref?.trim());
  return legacy || native;
}

export function toSafePublishingTarget(
  channel: CanonicalChannelIdentity | null | undefined,
): SafePublishingTarget | null {
  if (channel?.platform !== 'youtube' || !channel.publishingAccountId || !channel.channelRef) return null;
  return {
    platform: 'youtube',
    publishingAccountId: channel.publishingAccountId,
    channelRef: channel.channelRef,
  };
}

export function createVideoChannelAttribution(
  channel: CanonicalChannelIdentity,
): VideoChannelAttribution {
  const target = toSafePublishingTarget(channel);
  return {
    channel_id: target ? null : channel.legacyChannelId,
    publishing_platform: target?.platform ?? null,
    publishing_account_id: target?.publishingAccountId ?? null,
    publishing_channel_ref: target?.channelRef ?? null,
  };
}

export function resolveVideoPublishingTarget(
  video: Pick<Video, 'publishing_platform' | 'publishing_account_id' | 'publishing_channel_ref'>,
): SafePublishingTarget | null {
  if (video.publishing_platform !== 'youtube'
    || !video.publishing_account_id
    || !video.publishing_channel_ref) return null;
  return {
    platform: 'youtube',
    publishingAccountId: video.publishing_account_id,
    channelRef: video.publishing_channel_ref,
  };
}

export function resolveVideoCanonicalChannelId(
  video: Pick<Video, 'channel_id' | 'publishing_platform' | 'publishing_channel_ref'>,
): string | null {
  if (video.publishing_platform === 'youtube' && video.publishing_channel_ref) {
    return `youtube:${video.publishing_channel_ref}`;
  }
  return video.channel_id;
}

export function isVideoAttributedToChannel(
  video: Pick<Video, 'channel_id' | 'publishing_platform' | 'publishing_channel_ref'>,
  canonicalChannelId: string,
): boolean {
  return resolveVideoCanonicalChannelId(video) === canonicalChannelId;
}
