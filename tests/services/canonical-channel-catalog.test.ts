import { afterEach, describe, expect, it } from 'vitest';
import type { PublishAccount } from '@/core/publishing';
import type { Channel } from '@/lib/types';
import { buildCanonicalChannelCatalog } from '@/services/canonicalChannelCatalog';
import { usePublishingStore } from '@/store/publishingStore';

function account(overrides: Partial<PublishAccount> = {}): PublishAccount {
  return {
    id: 'youtube:google-account-darwin',
    platform: 'youtube',
    accountRef: 'google-account-darwin',
    channelRef: 'UC-DARWIN',
    displayName: 'Darwin',
    credentialRef: 'youtube_11111111-1111-1111-1111-111111111111',
    authenticated: true,
    createdAt: '2026-08-12T09:00:00.000Z',
    ...overrides,
  };
}

function legacyChannel(overrides: Partial<Channel> = {}): Channel {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Legacy content channel',
    handle: '@legacy',
    niche: 'Education',
    subscriber_count: 0,
    total_views: 0,
    video_count: 0,
    avatar_color: '#10b981',
    description: null,
    status: 'active',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('canonical channel catalog', () => {
  afterEach(() => usePublishingStore.setState({ accounts: [] }));

  it('projects a persisted native publishing account into safe selectable channel identity', () => {
    const [channel] = buildCanonicalChannelCatalog([], [account()]);

    expect(channel).toEqual({
      id: 'youtube:UC-DARWIN',
      name: 'Darwin',
      handle: null,
      niche: null,
      avatar_color: '#ff0033',
      status: 'active',
      subscriber_count: 0,
      video_count: 0,
      source: 'native-youtube',
      platform: 'youtube',
      publishingAccountId: 'youtube:google-account-darwin',
      channelRef: 'UC-DARWIN',
      legacyChannelId: null,
    });
    expect(JSON.stringify(channel)).not.toContain('youtube_11111111');
    expect(channel).not.toHaveProperty('credentialRef');
    expect(channel).not.toHaveProperty('accountRef');
  });

  it('rebuilds the catalog from the publishing store persisted snapshot after reload semantics', () => {
    usePublishingStore.setState({ accounts: [account()] });
    const partialize = usePublishingStore.persist.getOptions().partialize;
    const snapshot = partialize
      ? partialize(usePublishingStore.getState()) as { accounts: PublishAccount[] }
      : { accounts: [] };
    const restoredAccounts = JSON.parse(JSON.stringify(snapshot.accounts)) as PublishAccount[];

    expect(buildCanonicalChannelCatalog([], restoredAccounts)).toEqual([
      expect.objectContaining({ name: 'Darwin', channelRef: 'UC-DARWIN' }),
    ]);
  });

  it('removes disconnected or unusable accounts and keeps distinct channels selectable', () => {
    const channels = buildCanonicalChannelCatalog([], [
      account(),
      account({ id: 'youtube:second', accountRef: 'second', channelRef: 'UC-SECOND', displayName: 'Second channel' }),
      account({ id: 'youtube:disconnected', accountRef: 'disconnected', channelRef: 'UC-OFF', displayName: 'Disconnected', authenticated: false }),
      account({ id: 'youtube:missing-vault-ref', accountRef: 'missing-vault-ref', channelRef: 'UC-MISSING', displayName: 'Missing credential', credentialRef: null }),
    ]);

    expect(channels.map((channel) => [channel.name, channel.id])).toEqual([
      ['Darwin', 'youtube:UC-DARWIN'],
      ['Second channel', 'youtube:UC-SECOND'],
    ]);
  });

  it('deduplicates repeated native representations by authoritative platform channel ID', () => {
    const channels = buildCanonicalChannelCatalog([], [
      account({ id: 'youtube:old-account', displayName: 'Old Darwin' }),
      account({ id: 'youtube:new-account', displayName: 'Darwin' }),
    ]);

    expect(channels).toHaveLength(1);
    expect(channels[0]).toEqual(expect.objectContaining({
      name: 'Darwin',
      publishingAccountId: 'youtube:new-account',
      channelRef: 'UC-DARWIN',
    }));
  });

  it('does not add a legacy entry whose ID already represents the native channel identity', () => {
    const channels = buildCanonicalChannelCatalog([
      legacyChannel({ id: 'youtube:UC-DARWIN', name: 'Stale Darwin copy' }),
    ], [account()]);

    expect(channels).toHaveLength(1);
    expect(channels[0]).toEqual(expect.objectContaining({ name: 'Darwin', source: 'native-youtube' }));
  });

  it('preserves legacy content channels without using them as native credential records', () => {
    const channels = buildCanonicalChannelCatalog([legacyChannel()], [account()]);

    expect(channels).toHaveLength(2);
    expect(channels[1]).toEqual(expect.objectContaining({
      source: 'legacy-channel',
      legacyChannelId: '11111111-1111-1111-1111-111111111111',
      publishingAccountId: null,
    }));
  });
});
