import { describe, expect, it, vi } from 'vitest';
import { compareToBaseline, createYouTubeAnalyticsAdapter, normalizeAnalyticsPersistence, normalizeAnalyticsResponse, type PublishedContentBinding } from '@/core/analytics';

const binding: PublishedContentBinding = { projectId: 'project', variantId: null, artifactFingerprint: 'artifact', publishJobId: 'job', publishReceiptId: 'job:video', platform: 'youtube', accountId: 'account', accountRef: 'UC-channel', channelRef: 'UC-channel', remotePublicationId: 'video', publishedAt: '2026-08-01T10:00:00.000Z' };

describe('YouTube analytics adapter', () => {
  it('uses only an opaque account credential ref and feeds existing normalization', async () => {
    const collectAnalytics = vi.fn(async () => ({ ok: true as const, result: { metrics: [{ rawMetricId: 'views', value: 10 }, { rawMetricId: 'average_percentage_viewed', value: 75 }, { rawMetricId: 'followers_gained', value: 2 }] } }));
    const adapter = createYouTubeAnalyticsAdapter({ youtubeClient: { collectAnalytics }, credentialRefFor: () => 'youtube_11111111-1111-1111-1111-111111111111' });
    const response = await adapter.collect(binding, { window: '24h', signal: new AbortController().signal });
    expect(collectAnalytics).toHaveBeenCalledWith(expect.objectContaining({ credentialRef: 'youtube_11111111-1111-1111-1111-111111111111', channelRef: 'UC-channel', remotePublicationId: 'video', window: '24h' }));
    expect(JSON.stringify(collectAnalytics.mock.calls)).not.toContain('accessToken');
    const snapshot = normalizeAnalyticsResponse({ binding, response, window: '24h', requestId: 'request', adapterId: 'youtube' });
    expect(snapshot.metrics).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'averagePercentageViewed', value: 75 }), expect.objectContaining({ name: 'followersGained', value: 2 })]));
  });
  it('requires a current account credential without placing it in the binding', async () => {
    const adapter = createYouTubeAnalyticsAdapter({ youtubeClient: { collectAnalytics: vi.fn() }, credentialRefFor: () => null });
    await expect(adapter.collect(binding, { window: '24h', signal: new AbortController().signal })).rejects.toMatchObject({ code: 'credential-missing' });
  });
  it('preserves incomplete-window diagnostics while excluding partial data from comparisons', () => {
    const incomplete = normalizeAnalyticsResponse({ binding, window: '7d', requestId: 'partial', adapterId: 'youtube', response: { metrics: [{ rawMetricId: 'views', value: 10 }], diagnostics: [{ code: 'incomplete-window', severity: 'info', message: 'Only post-publication data is available.' }] } });
    const complete = Array.from({ length: 5 }, (_, index) => normalizeAnalyticsResponse({ binding: { ...binding, publishJobId: `job-${index}`, publishReceiptId: `job-${index}:video-${index}`, remotePublicationId: `video-${index}` }, window: '7d', requestId: `complete-${index}`, adapterId: 'youtube', response: { metrics: [{ rawMetricId: 'views', value: 100 + index }] } }));
    expect(normalizeAnalyticsPersistence({ snapshots: [incomplete] }).snapshots[0].diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'incomplete-window' })]));
    expect(compareToBaseline(incomplete, complete, 'views', '7d').status).toBe('unavailable');
  });
});
