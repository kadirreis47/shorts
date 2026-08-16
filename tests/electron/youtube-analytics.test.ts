import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { ANALYTICS_SCOPE, YouTubeAnalyticsError, createYouTubeAnalyticsService } = require('../../electron/youtube-analytics-service.cjs') as any;
const ref = 'youtube_11111111-1111-1111-1111-111111111111';
const request = { credentialRef: ref, channelRef: 'UC-channel', remotePublicationId: 'video_123', publishedAt: '2026-08-01T10:00:00.000Z', window: '24h' as const };
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => ({ ok: status >= 200 && status < 300, status, headers: { get: (key: string) => headers[key.toLowerCase()] ?? null }, json: async () => body });
const auth = (scopes = [ANALYTICS_SCOPE], channelId = 'UC-channel') => ({ resolveExecutionCredential: vi.fn(async () => ({ accessToken: 'access-secret', refreshToken: 'refresh-secret', tokenType: 'Bearer', scopes, channelId })) });
const report = { columnHeaders: ['views', 'likes', 'comments', 'shares', 'averageViewPercentage', 'subscribersGained'].map((name) => ({ name })), rows: [[100, 7, 3, 2, 81.5, 4]] };

describe('native YouTube analytics collector', () => {
  it('queries the fixed Analytics reports endpoint and returns only canonical raw metrics', async () => {
    const fetchImpl = vi.fn(async (_url: string) => json(report)); const service = createYouTubeAnalyticsService({ auth: auth(), fetchImpl, now: () => new Date('2026-08-10T12:00:00.000Z') });
    const result = await service.collect(request);
    const url = new URL(fetchImpl.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe('https://youtubeanalytics.googleapis.com/v2/reports');
    expect(url.searchParams.get('ids')).toBe('channel==UC-channel'); expect(url.searchParams.get('filters')).toBe('video==video_123'); expect(url.searchParams.get('metrics')).toContain('averageViewPercentage');
    expect(result.metrics).toEqual(expect.arrayContaining([expect.objectContaining({ rawMetricId: 'views', value: 100 }), expect.objectContaining({ rawMetricId: 'average_percentage_viewed', value: 81.5 }), expect.objectContaining({ rawMetricId: 'followers_gained', value: 4 })]));
    expect(JSON.stringify(result)).not.toContain('access-secret'); expect(JSON.stringify(result)).not.toContain('refresh-secret');
  });
  it('does not fabricate unsupported hourly windows', async () => {
    const credential = auth(); const fetchImpl = vi.fn(); const service = createYouTubeAnalyticsService({ auth: credential, fetchImpl });
    const result = await service.collect({ ...request, window: '1h' });
    expect(result.metrics.every((metric: any) => metric.availability === 'unsupported')).toBe(true); expect(result.diagnostics[0].code).toBe('incomplete-window'); expect(credential.resolveExecutionCredential).toHaveBeenCalledWith(ref, undefined); expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('returns not-ready rather than zero when a recent report has no rows', async () => {
    const service = createYouTubeAnalyticsService({ auth: auth(), fetchImpl: async () => json({ columnHeaders: report.columnHeaders }), now: () => new Date('2026-08-10T12:00:00.000Z') });
    const result = await service.collect({ ...request, publishedAt: '2026-08-09T12:00:00.000Z' });
    expect(result.metrics.every((metric: any) => metric.availability === 'not-ready' && metric.value === null)).toBe(true);
  });
  it.each([
    ['7d', '2026-08-08T12:00:00.000Z', '2026-08-08'],
    ['30d', '2026-08-05T12:00:00.000Z', '2026-08-05'],
  ] as const)('clamps a young %s publication and marks the selected window incomplete', async (window, publishedAt, expectedStart) => {
    const fetchImpl = vi.fn(async (_url: string) => json(report)); const service = createYouTubeAnalyticsService({ auth: auth(), fetchImpl, now: () => new Date('2026-08-10T12:00:00.000Z') });
    const result = await service.collect({ ...request, window, publishedAt }); const url = new URL(fetchImpl.mock.calls[0][0]);
    expect(url.searchParams.get('startDate')).toBe(expectedStart); expect(result.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'incomplete-window' })])); expect(result.metrics.find((metric: any) => metric.rawMetricId === 'views')).toMatchObject({ value: 100 });
  });
  it('keeps an older publication complete and leaves lifetime unchanged', async () => {
    const fetchImpl = vi.fn(async (_url: string) => json(report)); const service = createYouTubeAnalyticsService({ auth: auth(), fetchImpl, now: () => new Date('2026-08-10T12:00:00.000Z') });
    const complete = await service.collect({ ...request, window: '7d' }); expect(complete.diagnostics.some((item: any) => item.code === 'incomplete-window')).toBe(false); expect(new URL(fetchImpl.mock.calls[0][0]).searchParams.get('startDate')).toBe('2026-08-03');
    const lifetime = await service.collect({ ...request, window: 'lifetime', publishedAt: '2026-08-08T12:00:00.000Z' }); expect(lifetime.diagnostics.some((item: any) => item.code === 'incomplete-window')).toBe(false); expect(new URL(fetchImpl.mock.calls[1][0]).searchParams.get('startDate')).toBe('2026-08-08');
  });
  it('does not label a same-day publication as a complete 24h period', async () => {
    const fetchImpl = vi.fn(async (_url: string) => json(report)); const service = createYouTubeAnalyticsService({ auth: auth(), fetchImpl, now: () => new Date('2026-08-10T12:00:00.000Z') });
    const result = await service.collect({ ...request, publishedAt: '2026-08-09T20:00:00.000Z' });
    expect(result.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'incomplete-window' })])); expect(result.metrics.every((metric: any) => metric.value !== 0)).toBe(true);
  });
  it.each([
    [401, { error: { message: 'revoked' } }, 'credential-reconnect-required'],
    [403, { error: { errors: [{ reason: 'insufficientPermissions' }] } }, 'insufficient-scope'],
    [403, { error: { errors: [{ reason: 'quotaExceeded' }] } }, 'youtube-analytics-rate-limited'],
    [500, { error: { message: 'temporary' } }, 'youtube-analytics-transient'],
  ])('maps provider status %s to a sanitized analytics error', async (status, body, code) => {
    const service = createYouTubeAnalyticsService({ auth: auth(), fetchImpl: async () => json(body, status, { 'retry-after': '12' }) });
    await expect(service.collect(request)).rejects.toMatchObject({ code });
  });
  it('requires explicit analytics consent and rejects malformed provider reports', async () => {
    await expect(createYouTubeAnalyticsService({ auth: auth(['https://www.googleapis.com/auth/youtube.readonly']) }).collect(request)).rejects.toMatchObject({ code: 'insufficient-scope' });
    await expect(createYouTubeAnalyticsService({ auth: auth(), fetchImpl: async () => json({ rows: [[]] }) }).collect(request)).rejects.toBeInstanceOf(YouTubeAnalyticsError);
  });
  it('rejects a credential reference bound to another YouTube channel', async () => {
    await expect(createYouTubeAnalyticsService({ auth: auth([ANALYTICS_SCOPE], 'UC-other') }).collect(request)).rejects.toMatchObject({ code: 'youtube-channel-mismatch' });
  });
});
