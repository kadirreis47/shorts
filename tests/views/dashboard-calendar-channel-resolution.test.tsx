import { act } from 'react';
import type { ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Video } from '@/lib/types';
import type { CanonicalChannelIdentity } from '@/services/canonicalChannelCatalog';
import { I18nProvider } from '@/lib/i18n';

const data = vi.hoisted(() => ({
  videos: [] as Video[],
  activity: [] as unknown[],
  queue: [] as unknown[],
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        in: async () => ({ data: data.videos, error: null }),
        order: () => {
          const result = table === 'videos'
            ? { data: data.videos, error: null }
            : table === 'activity_log'
              ? { data: data.activity, error: null }
              : { data: data.queue, error: null };
          return table === 'videos'
            ? Promise.resolve(result)
            : { limit: async () => result };
        },
      }),
    }),
  },
}));

import { CalendarView } from '@/views/CalendarView';
import { Dashboard } from '@/views/Dashboard';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const channels: CanonicalChannelIdentity[] = [
  { id: 'youtube:UC-1', name: 'Native one', handle: null, niche: null, avatar_color: '#112233', status: 'active', subscriber_count: 0, video_count: 0, source: 'native-youtube', platform: 'youtube', publishingAccountId: 'account-1', channelRef: 'UC-1', legacyChannelId: null },
  { id: 'youtube:UC-2', name: 'Native two', handle: null, niche: null, avatar_color: '#445566', status: 'active', subscriber_count: 0, video_count: 0, source: 'native-youtube', platform: 'youtube', publishingAccountId: 'account-2', channelRef: 'UC-2', legacyChannelId: null },
  { id: '11111111-1111-1111-1111-111111111111', name: 'Legacy channel', handle: '@legacy', niche: null, avatar_color: '#778899', status: 'active', subscriber_count: 3, video_count: 2, source: 'legacy-channel', platform: null, publishingAccountId: null, channelRef: null, legacyChannelId: '11111111-1111-1111-1111-111111111111' },
];

function attributedVideo(
  id: string,
  title: string,
  attribution: { channelId?: string; accountId?: string; channelRef?: string },
  status: 'published' | 'scheduled' = 'published',
): Video {
  const timestamp = new Date().toISOString();
  return {
    id,
    title,
    channel_id: attribution.channelId ?? null,
    publishing_platform: attribution.channelRef ? 'youtube' : null,
    publishing_account_id: attribution.accountId ?? null,
    publishing_channel_ref: attribution.channelRef ?? null,
    status,
    tags: [],
    views: 10,
    likes: 1,
    comments: 0,
    duration_seconds: 30,
    scheduled_at: status === 'scheduled' ? timestamp : null,
    published_at: status === 'published' ? timestamp : null,
    created_at: timestamp,
  } as unknown as Video;
}

describe('Dashboard and Calendar canonical video channel resolution', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    container?.remove();
    container = null;
    root = null;
    data.videos = [];
    data.activity = [];
    data.queue = [];
  });

  async function mount(node: ReactNode) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => { root?.render(<I18nProvider>{node}</I18nProvider>); });
    await act(async () => {});
  }

  it('Dashboard resolves legacy and two distinct native joined videos through the canonical catalog', async () => {
    const nativeOne = attributedVideo('native-1', 'Native top one', { accountId: 'account-1', channelRef: 'UC-1' });
    const nativeTwo = attributedVideo('native-2', 'Native top two', { accountId: 'account-2', channelRef: 'UC-2' });
    const legacy = attributedVideo('legacy', 'Legacy top', { channelId: channels[2].id });
    data.videos = [nativeOne, nativeTwo, legacy];
    data.queue = [nativeOne, nativeTwo, legacy].map((video, index) => ({
      id: `queue-${index}`,
      scheduled_at: new Date(Date.now() + 60_000).toISOString(),
      video,
    }));

    await mount(<Dashboard channels={channels} />);

    expect(container!.textContent).toContain('Native one');
    expect(container!.textContent).toContain('Native two');
    expect(container!.textContent).toContain('Legacy channel');
    expect(nativeOne.channel_id).toBeNull();
    expect(nativeTwo.channel_id).toBeNull();
  });

  it('Calendar resolves native and legacy scheduled video colors and includes every canonical channel in its legend', async () => {
    data.videos = [
      attributedVideo('native-1', 'Native calendar one', { accountId: 'account-1', channelRef: 'UC-1' }, 'scheduled'),
      attributedVideo('native-2', 'Native calendar two', { accountId: 'account-2', channelRef: 'UC-2' }, 'scheduled'),
      attributedVideo('legacy', 'Legacy calendar', { channelId: channels[2].id }, 'scheduled'),
    ];

    await mount(<CalendarView channels={channels} />);

    const cardFor = (title: string) => Array.from(container!.querySelectorAll('p'))
      .find((element) => element.textContent === title)?.parentElement as HTMLElement;
    expect(cardFor('Native calendar one').style.borderLeftColor).toBe('rgb(17, 34, 51)');
    expect(cardFor('Native calendar two').style.borderLeftColor).toBe('rgb(68, 85, 102)');
    expect(cardFor('Legacy calendar').style.borderLeftColor).toBe('rgb(119, 136, 153)');
    expect(container!.textContent).toContain('Native one');
    expect(container!.textContent).toContain('Native two');
    expect(container!.textContent).toContain('Legacy channel');
  });
});
