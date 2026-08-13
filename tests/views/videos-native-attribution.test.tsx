import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Video } from '@/lib/types';
import type { CanonicalChannelIdentity } from '@/services/canonicalChannelCatalog';
import { I18nProvider } from '@/lib/i18n';

const mocks = vi.hoisted(() => ({ videos: [] as Video[] }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: async () => ({ data: mocks.videos, error: null }),
      }),
    }),
  },
}));

import { Videos } from '@/views/Videos';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const channels: CanonicalChannelIdentity[] = [
  { id: 'youtube:UC-1', name: 'First native', handle: null, niche: null, avatar_color: '#111111', status: 'active', subscriber_count: 0, video_count: 0, source: 'native-youtube', platform: 'youtube', publishingAccountId: 'account-1', channelRef: 'UC-1', legacyChannelId: null },
  { id: 'youtube:UC-2', name: 'Second native', handle: null, niche: null, avatar_color: '#222222', status: 'active', subscriber_count: 0, video_count: 0, source: 'native-youtube', platform: 'youtube', publishingAccountId: 'account-2', channelRef: 'UC-2', legacyChannelId: null },
];

function video(id: string, title: string, channelRef: string): Video {
  return {
    id,
    title,
    channel_id: null,
    publishing_platform: 'youtube',
    publishing_account_id: `account-${channelRef.at(-1)}`,
    publishing_channel_ref: channelRef,
    status: 'rendered',
    tags: [],
    views: 0,
    likes: 0,
    comments: 0,
    duration_seconds: 30,
    created_at: '2026-08-12T00:00:00.000Z',
  } as unknown as Video;
}

describe('Videos native channel attribution', () => {
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    container?.remove();
    container = null;
    mocks.videos = [];
  });

  it('filters native-attributed videos by the correct canonical channel', async () => {
    mocks.videos = [video('video-1', 'First video', 'UC-1'), video('video-2', 'Second video', 'UC-2')];
    container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => { root.render(<I18nProvider><Videos channels={channels} /></I18nProvider>); });
    await act(async () => {});

    const selects = container.querySelectorAll('select');
    const channelFilter = selects[1] as HTMLSelectElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(channelFilter, 'youtube:UC-2');
      channelFilter.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(container.textContent).toContain('Second video');
    expect(container.textContent).not.toContain('First video');
    await act(async () => { root.unmount(); });
  });
});
