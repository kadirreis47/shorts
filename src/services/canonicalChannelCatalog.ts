import type { PublishAccount } from '@/core/publishing';
import type { Channel } from '@/lib/types';

export interface CanonicalChannelIdentity {
  id: string;
  name: string;
  handle: string | null;
  niche: string | null;
  avatar_color: string;
  status: string;
  subscriber_count: number;
  video_count: number;
  source: 'legacy-channel' | 'native-youtube';
  platform: 'youtube' | null;
  publishingAccountId: string | null;
  channelRef: string | null;
  legacyChannelId: string | null;
}

function nativeYouTubeChannels(accounts: readonly PublishAccount[]): CanonicalChannelIdentity[] {
  const latestAccountByChannel = new Map<string, PublishAccount>();

  for (const account of accounts) {
    if (account.platform !== 'youtube'
      || !account.authenticated
      || !account.credentialRef
      || !account.channelRef
      || !account.displayName.trim()) continue;
    latestAccountByChannel.set(account.channelRef, account);
  }

  return [...latestAccountByChannel.values()].map((account) => ({
    id: `youtube:${account.channelRef}`,
    name: account.displayName,
    handle: null,
    niche: null,
    avatar_color: '#ff0033',
    status: 'active',
    subscriber_count: 0,
    video_count: 0,
    source: 'native-youtube',
    platform: 'youtube',
    publishingAccountId: account.id,
    channelRef: account.channelRef,
    legacyChannelId: null,
  }));
}

export function buildCanonicalChannelCatalog(
  legacyChannels: readonly Channel[],
  publishingAccounts: readonly PublishAccount[],
): CanonicalChannelIdentity[] {
  const nativeChannels = nativeYouTubeChannels(publishingAccounts);
  const representedIds = new Set(
    nativeChannels.flatMap((channel) => [channel.id, channel.publishingAccountId, channel.channelRef]
      .filter((value): value is string => Boolean(value))),
  );

  const legacyIdentities = legacyChannels
    .filter((channel) => !representedIds.has(channel.id))
    .map((channel): CanonicalChannelIdentity => ({
      id: channel.id,
      name: channel.name,
      handle: channel.handle,
      niche: channel.niche,
      avatar_color: channel.avatar_color,
      status: channel.status,
      subscriber_count: channel.subscriber_count,
      video_count: channel.video_count,
      source: 'legacy-channel',
      platform: null,
      publishingAccountId: null,
      channelRef: null,
      legacyChannelId: channel.id,
    }));

  return [...nativeChannels, ...legacyIdentities];
}
