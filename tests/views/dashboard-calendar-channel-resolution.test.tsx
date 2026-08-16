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
  videoError: null as { message: string } | null,
  activityError: null as { message: string } | null,
  queriedTables: [] as string[],
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      data.queriedTables.push(table);
      return ({
      select: () => ({
        in: async () => ({ data: data.videos, error: null }),
        order: () => {
          const result = table === 'videos'
            ? { data: data.videos, error: data.videoError }
            : table === 'activity_log'
              ? { data: data.activity, error: data.activityError }
              : { data: [], error: null };
          return table === 'videos'
            ? Promise.resolve(result)
            : { limit: async () => result };
        },
      }),
    });
    },
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
    data.videoError = null;
    data.activityError = null;
    data.queriedTables = [];
  });

  async function mount(node: ReactNode) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => { root?.render(<I18nProvider>{node}</I18nProvider>); });
    await act(async () => {});
  }

  it('Dashboard resolves legacy and native scheduled videos without a schedule_queue dependency', async () => {
    const nativeOne = attributedVideo('native-1', 'Native queue one', { accountId: 'account-1', channelRef: 'UC-1' }, 'scheduled');
    const nativeTwo = attributedVideo('native-2', 'Native queue two', { accountId: 'account-2', channelRef: 'UC-2' }, 'scheduled');
    const legacy = attributedVideo('legacy', 'Legacy queue', { channelId: channels[2].id }, 'scheduled');
    data.videos = [nativeOne, nativeTwo, legacy];

    await mount(<Dashboard channels={channels} />);

    expect(container!.textContent).toContain('Native one');
    expect(container!.textContent).toContain('Native two');
    expect(container!.textContent).toContain('Legacy channel');
    expect(container!.textContent).toContain('Scheduled jobs run while ShortsFlow is open.');
    expect(container!.textContent).toContain('Overdue jobs resume the next time ShortsFlow starts.');
    expect(nativeOne.channel_id).toBeNull();
    expect(nativeTwo.channel_id).toBeNull();
  });

  it('keeps core Dashboard content available when optional activity authorization fails', async () => {
    data.videos = [attributedVideo('scheduled', 'Owned scheduled video', { accountId: 'account-1', channelRef: 'UC-1' }, 'scheduled')];
    data.activityError = { message: 'permission denied for table activity_log' };

    await mount(<Dashboard channels={channels} />);

    expect(container!.textContent).toContain('Owned scheduled video');
    expect(container!.textContent).toContain('Recent activity is temporarily unavailable.');
    expect(container!.textContent).not.toContain('permission denied');
    expect(data.queriedTables).toContain('videos');
    expect(data.queriedTables).toContain('activity_log');
    expect(data.queriedTables).not.toContain('schedule_queue');
  });

  it('shows real current metrics without fabricated trend or delta claims', async () => {
    data.videos = [attributedVideo('published', 'Owned published video', { accountId: 'account-1', channelRef: 'UC-1' })];

    await mount(<Dashboard channels={channels} />);

    for (const syntheticValue of ['+12.4%', '+8.1%', '+5.2%', '+3', 'vs last week', 'Views Trend']) {
      expect(container!.textContent).not.toContain(syntheticValue);
    }
    expect(container!.textContent).toContain('10');
    expect(container!.textContent).toContain('Owned published video');
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
    expect(container!.textContent).toContain('ShortsFlow must be running at the scheduled time.');
    expect(container!.textContent).toContain('overdue publications resume the next time ShortsFlow starts.');
  });
});
