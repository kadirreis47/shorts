import { StrictMode } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Video } from '@/lib/types';
import { I18nProvider } from '@/lib/i18n';

type Outcome = { data: unknown[]; error: unknown };
type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void; reject: (reason?: unknown) => void };

const requests = vi.hoisted(() => ({ videos: [] as Deferred<Outcome>[], activity: [] as Deferred<Outcome>[] }));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: 'videos' | 'activity_log') => ({
      select: () => ({
        order: () => table === 'videos'
          ? requests.videos.shift()!.promise
          : { limit: () => requests.activity.shift()!.promise },
      }),
    }),
  },
}));

import { Dashboard } from '@/views/Dashboard';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const channels = [{ id: 'channel-1', name: 'Channel', handle: null, niche: null, avatar_color: '#112233', status: 'active', subscriber_count: 0, video_count: 0, source: 'legacy-channel' as const, platform: null, publishingAccountId: null, channelRef: null, legacyChannelId: 'channel-1' }];

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  return { promise, resolve, reject };
}

function video(title: string): Video {
  const now = new Date().toISOString();
  return { id: title, title, channel_id: 'channel-1', status: 'published', tags: [], views: 0, likes: 0, comments: 0, duration_seconds: 1, scheduled_at: null, published_at: now, created_at: now } as unknown as Video;
}

function activity(message: string) {
  return { id: message, channel_id: 'channel-1', video_id: null, message, created_at: new Date().toISOString() };
}

describe('Dashboard request freshness', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    container?.remove();
    root = null;
    container = null;
    requests.videos = [];
    requests.activity = [];
  });

  async function mount() {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => { root?.render(<I18nProvider><StrictMode><Dashboard channels={channels} /></StrictMode></I18nProvider>); });
  }

  function prepareOverlappingRequests() {
    const firstVideos = deferred<Outcome>();
    const firstActivity = deferred<Outcome>();
    const secondVideos = deferred<Outcome>();
    const secondActivity = deferred<Outcome>();
    requests.videos.push(firstVideos, secondVideos);
    requests.activity.push(firstActivity, secondActivity);
    return { firstVideos, firstActivity, secondVideos, secondActivity };
  }

  it('keeps the newest core result when an older request resolves afterward', async () => {
    const request = prepareOverlappingRequests();
    await mount();
    await act(async () => { request.secondVideos.resolve({ data: [video('Newer video')], error: null }); request.secondActivity.resolve({ data: [activity('Newer activity')], error: null }); });
    await act(async () => { request.firstVideos.resolve({ data: [video('Older video')], error: null }); request.firstActivity.resolve({ data: [activity('Older activity')], error: null }); });
    expect(container!.textContent).toContain('Newer video');
    expect(container!.textContent).not.toContain('Older video');
  });

  it('does not let a stale core failure replace a newer successful Dashboard', async () => {
    const request = prepareOverlappingRequests();
    await mount();
    await act(async () => { request.secondVideos.resolve({ data: [video('Current video')], error: null }); request.secondActivity.resolve({ data: [], error: null }); });
    await act(async () => { request.firstVideos.reject(new Error('timed out')); request.firstActivity.resolve({ data: [], error: null }); });
    expect(container!.textContent).toContain('Current video');
    expect(container!.textContent).not.toContain('Dashboard data could not be loaded.');
  });

  it('keeps newer activity data when an older activity request resolves afterward', async () => {
    const request = prepareOverlappingRequests();
    await mount();
    await act(async () => { request.secondVideos.resolve({ data: [], error: null }); request.secondActivity.resolve({ data: [activity('Current activity')], error: null }); });
    await act(async () => { request.firstVideos.resolve({ data: [], error: null }); request.firstActivity.resolve({ data: [activity('Stale activity')], error: null }); });
    expect(container!.textContent).toContain('Current activity');
    expect(container!.textContent).not.toContain('Stale activity');
  });

  it('does not show a stale optional activity error after newer activity succeeds', async () => {
    const request = prepareOverlappingRequests();
    await mount();
    await act(async () => { request.secondVideos.resolve({ data: [], error: null }); request.secondActivity.resolve({ data: [activity('Current activity')], error: null }); });
    await act(async () => { request.firstVideos.resolve({ data: [], error: null }); request.firstActivity.reject(new Error('timed out')); });
    expect(container!.textContent).toContain('Current activity');
    expect(container!.textContent).not.toContain('Recent activity is temporarily unavailable.');
  });

  it('ignores pending request completions after unmount', async () => {
    const request = prepareOverlappingRequests();
    await mount();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await act(async () => root?.unmount());
    root = null;
    await act(async () => { request.firstVideos.resolve({ data: [video('After unmount')], error: null }); request.firstActivity.resolve({ data: [], error: null }); request.secondVideos.resolve({ data: [video('After unmount')], error: null }); request.secondActivity.resolve({ data: [], error: null }); });
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
