import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Video } from '@/lib/types';
import type { CanonicalChannelIdentity } from '@/services/canonicalChannelCatalog';
import {
  createVideoChannelAttribution,
  isConsistentVideoChannelAttribution,
  isVideoAttributedToChannel,
  resolveVideoCanonicalChannelId,
  resolveVideoPublishingTarget,
  toSafePublishingTarget,
} from '@/services/videoChannelAttribution';

const nativeChannel = (accountId: string, channelRef: string): CanonicalChannelIdentity => ({
  id: `youtube:${channelRef}`,
  name: channelRef,
  handle: null,
  niche: null,
  avatar_color: '#ff0033',
  status: 'active',
  subscriber_count: 0,
  video_count: 0,
  source: 'native-youtube',
  platform: 'youtube',
  publishingAccountId: accountId,
  channelRef,
  legacyChannelId: null,
});

const legacyChannel: CanonicalChannelIdentity = {
  id: 'c431d158-78c8-4d70-a9c8-87684d57bb23',
  name: 'Legacy',
  handle: '@legacy',
  niche: null,
  avatar_color: '#123456',
  status: 'active',
  subscriber_count: 0,
  video_count: 0,
  source: 'legacy-channel',
  platform: null,
  publishingAccountId: null,
  channelRef: null,
  legacyChannelId: 'c431d158-78c8-4d70-a9c8-87684d57bb23',
};

describe('durable video channel attribution', () => {
  it('persists native identity beside, never inside, the legacy UUID foreign key', () => {
    const attribution = createVideoChannelAttribution(nativeChannel('account-2', 'UC-channel-2'));
    expect(attribution).toEqual({
      channel_id: null,
      publishing_platform: 'youtube',
      publishing_account_id: 'account-2',
      publishing_channel_ref: 'UC-channel-2',
    });
    expect(resolveVideoCanonicalChannelId(attribution)).toBe('youtube:UC-channel-2');
    expect(resolveVideoPublishingTarget(attribution)).toEqual({ platform: 'youtube', publishingAccountId: 'account-2', channelRef: 'UC-channel-2' });
  });

  it('keeps legacy UUID attribution compatible and leaves native fields empty', () => {
    const attribution = createVideoChannelAttribution(legacyChannel);
    expect(attribution).toEqual({
      channel_id: legacyChannel.id,
      publishing_platform: null,
      publishing_account_id: null,
      publishing_channel_ref: null,
    });
    expect(resolveVideoCanonicalChannelId(attribution)).toBe(legacyChannel.id);
    expect(resolveVideoPublishingTarget(attribution)).toBeNull();
  });

  it('resolves multiple native channels distinctly for channel filtering', () => {
    const first = createVideoChannelAttribution(nativeChannel('account-1', 'UC-channel-1'));
    const second = createVideoChannelAttribution(nativeChannel('account-2', 'UC-channel-2'));
    expect(isVideoAttributedToChannel(first, 'youtube:UC-channel-1')).toBe(true);
    expect(isVideoAttributedToChannel(first, 'youtube:UC-channel-2')).toBe(false);
    expect(isVideoAttributedToChannel(second, 'youtube:UC-channel-2')).toBe(true);
  });

  it('exposes and persists only safe identity fields', () => {
    const unsafeFixture = 'opaque-refresh-token-or-credential-ref';
    const channel = {
      ...nativeChannel('account-2', 'UC-channel-2'),
      credentialRef: unsafeFixture,
      refreshToken: unsafeFixture,
    } as CanonicalChannelIdentity;
    const values = JSON.stringify({
      handoff: toSafePublishingTarget(channel),
      video: createVideoChannelAttribution(channel),
    });
    expect(values).not.toContain(unsafeFixture);
    expect(values).not.toMatch(/credentialRef|accessToken|refreshToken|clientSecret|authorizationCode/i);
  });

  it('adds nullable native attribution columns with a consistency constraint', () => {
    const migration = readFileSync('supabase/migrations/20260812000000_add_native_video_channel_attribution.sql', 'utf8');
    expect(migration).toContain('publishing_account_id text');
    expect(migration).toContain('publishing_channel_ref text');
    expect(migration).toContain('videos_native_channel_attribution_consistent');
    expect(migration).toMatch(/channel_id IS NULL[\s\S]+publishing_platform IS NOT NULL[\s\S]+publishing_platform = 'youtube'/);
    expect(migration).toContain(')) IS TRUE');
    expect(migration).toContain('invalid_attribution_count');
    expect(migration).not.toMatch(/credential|token|secret/i);
  });

  it('accepts valid legacy and native database attribution states', () => {
    expect(isConsistentVideoChannelAttribution(createVideoChannelAttribution(legacyChannel))).toBe(true);
    expect(isConsistentVideoChannelAttribution(createVideoChannelAttribution(nativeChannel('account-2', 'UC-channel-2')))).toBe(true);
  });

  it('rejects null-platform, partial, unattributed, and mixed database states', () => {
    expect(isConsistentVideoChannelAttribution({
      channel_id: null,
      publishing_platform: null,
      publishing_account_id: 'account-2',
      publishing_channel_ref: 'UC-channel-2',
    })).toBe(false);
    expect(isConsistentVideoChannelAttribution({
      channel_id: null,
      publishing_platform: 'youtube',
      publishing_account_id: 'account-2',
      publishing_channel_ref: null,
    })).toBe(false);
    expect(isConsistentVideoChannelAttribution({
      channel_id: null,
      publishing_platform: null,
      publishing_account_id: null,
      publishing_channel_ref: null,
    })).toBe(false);
    expect(isConsistentVideoChannelAttribution({
      channel_id: legacyChannel.id,
      publishing_platform: 'youtube',
      publishing_account_id: 'account-2',
      publishing_channel_ref: 'UC-channel-2',
    })).toBe(false);
  });

  it('ignores incomplete native attribution instead of inventing a publishing target', () => {
    const partial = { publishing_platform: 'youtube', publishing_account_id: 'account-2', publishing_channel_ref: null } as Pick<Video, 'publishing_platform' | 'publishing_account_id' | 'publishing_channel_ref'>;
    expect(resolveVideoPublishingTarget(partial)).toBeNull();
  });

  it('restores the safe native target when a persisted video is handed back to publishing', async () => {
    const { resolveVideoPublishingHandoff } = await import('@/store/publishingStore');
    const handoff = resolveVideoPublishingHandoff({
      id: 'video-native',
      title: 'Native video',
      publishing_platform: 'youtube',
      publishing_account_id: 'account-2',
      publishing_channel_ref: 'UC-channel-2',
    }, null);
    expect(handoff.target).toEqual({ platform: 'youtube', publishingAccountId: 'account-2', channelRef: 'UC-channel-2' });
  });
});
