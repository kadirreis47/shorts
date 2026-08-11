const { YouTubeCredentialError } = require('./youtube-credentials.cjs');

const ANALYTICS_URL = 'https://youtubeanalytics.googleapis.com/v2/reports';
const ANALYTICS_SCOPE = 'https://www.googleapis.com/auth/yt-analytics.readonly';
const RAW_METRICS = Object.freeze(['views', 'likes', 'comments', 'shares', 'averageViewPercentage', 'subscribersGained']);
const OUTPUT_METRICS = Object.freeze({ views: 'views', likes: 'likes', comments: 'comments', shares: 'shares', averageViewPercentage: 'average_percentage_viewed', subscribersGained: 'followers_gained' });
const HOURLY_WINDOWS = new Set(['1h', '6h']);
const WINDOWS = new Set(['1h', '6h', '24h', '48h', '7d', '30d', 'lifetime']);

class YouTubeAnalyticsError extends Error {
  constructor(code, message, { status = 500, retryable = false, retryAfterMs = null } = {}) { super(message); this.name = 'YouTubeAnalyticsError'; this.code = code; this.status = status; this.retryable = retryable; this.retryAfterMs = retryAfterMs; }
}

function utcDate(value) { return new Date(value).toISOString().slice(0, 10); }
function shiftDate(date, days) { const value = new Date(`${date}T00:00:00.000Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
function retryAfterMs(value, now = Date.now()) { if (typeof value !== 'string' || !value.trim()) return null; const seconds = Number(value); if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000); const timestamp = Date.parse(value); return Number.isFinite(timestamp) ? Math.max(0, timestamp - now) : null; }
function reportDates(window, publishedAt, now = new Date()) {
  const today = utcDate(now); const completeDay = shiftDate(today, -1);
  if (window === 'lifetime') return { startDate: utcDate(publishedAt), endDate: completeDay };
  const days = window === '24h' ? 1 : window === '48h' ? 2 : window === '7d' ? 7 : 30;
  const requestedStartDate = shiftDate(completeDay, -(days - 1)); const publishedDate = utcDate(publishedAt);
  const incomplete = Date.parse(publishedAt) > Date.parse(`${requestedStartDate}T00:00:00.000Z`);
  return { startDate: incomplete && publishedDate > requestedStartDate ? publishedDate : requestedStartDate, endDate: completeDay, incomplete };
}
function unavailableMetrics(availability, observedAt) { return RAW_METRICS.map((rawMetricId) => ({ rawMetricId: OUTPUT_METRICS[rawMetricId], value: null, availability, observedAt })); }
function diagnostic(code, severity, message) { return { code, severity, message }; }
function validRequest(input) {
  return Boolean(input) && typeof input === 'object'
    && typeof input.credentialRef === 'string' && /^youtube_[0-9a-f-]{36}$/i.test(input.credentialRef)
    && typeof input.channelRef === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(input.channelRef)
    && typeof input.remotePublicationId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(input.remotePublicationId)
    && typeof input.publishedAt === 'string' && Number.isFinite(Date.parse(input.publishedAt))
    && typeof input.window === 'string' && WINDOWS.has(input.window);
}
function providerError(response, body, now) {
  const reason = Array.isArray(body?.error?.errors) ? String(body.error.errors[0]?.reason || '') : '';
  const after = retryAfterMs(response.headers?.get?.('retry-after'), now);
  if (response.status === 401) return new YouTubeCredentialError('credential-reconnect-required', 'YouTube analytics authorization has expired or was revoked. Reconnect the account.');
  if (response.status === 403 && /quota|rateLimit/i.test(reason)) return new YouTubeAnalyticsError('youtube-analytics-rate-limited', 'YouTube analytics is temporarily rate limited. Try again later.', { status: 429, retryable: true, retryAfterMs: after });
  if (response.status === 403) return new YouTubeCredentialError('insufficient-scope', 'The connected YouTube account needs analytics permission. Reconnect the account and approve analytics access.');
  if (response.status >= 500) return new YouTubeAnalyticsError('youtube-analytics-transient', 'YouTube analytics is temporarily unavailable. Please try again.', { status: response.status, retryable: true, retryAfterMs: after });
  return new YouTubeAnalyticsError('youtube-analytics-provider-response-invalid', 'YouTube analytics returned an invalid response.', { status: response.status, retryable: false, retryAfterMs: after });
}

function createYouTubeAnalyticsService({ auth, fetchImpl = fetch, now = () => new Date() } = {}) {
  if (!auth?.resolveExecutionCredential) throw new TypeError('YouTube analytics requires the trusted credential resolver.');
  return {
    async collect(input) {
      if (!validRequest(input)) throw new YouTubeAnalyticsError('invalid-request', 'Invalid YouTube analytics request.', { status: 400 });
      const observedAt = now().toISOString();
      if (HOURLY_WINDOWS.has(input.window)) return { metrics: unavailableMetrics('unsupported', observedAt), diagnostics: [diagnostic('incomplete-window', 'info', `YouTube Analytics reports cannot provide an exact ${input.window} window. Choose a daily window instead.`)] };
      const credential = await auth.resolveExecutionCredential(input.credentialRef);
      if (credential.channelId !== input.channelRef) throw new YouTubeAnalyticsError('youtube-channel-mismatch', 'The connected YouTube account does not match this publication channel.', { status: 403 });
      if (!Array.isArray(credential.scopes) || !credential.scopes.includes(ANALYTICS_SCOPE)) throw new YouTubeCredentialError('insufficient-scope', 'The connected YouTube account needs analytics permission. Reconnect the account and approve analytics access.');
      const { startDate, endDate, incomplete = false } = reportDates(input.window, input.publishedAt, now());
      if (startDate > endDate) return { metrics: unavailableMetrics('not-ready', observedAt), diagnostics: [diagnostic('incomplete-window', 'info', 'YouTube analytics has not completed a daily reporting window for this publication yet.')] };
      const url = new URL(ANALYTICS_URL); url.searchParams.set('ids', `channel==${input.channelRef}`); url.searchParams.set('startDate', startDate); url.searchParams.set('endDate', endDate); url.searchParams.set('filters', `video==${input.remotePublicationId}`); url.searchParams.set('metrics', RAW_METRICS.join(','));
      let response; try { response = await fetchImpl(url.toString(), { headers: { Authorization: `${credential.tokenType || 'Bearer'} ${credential.accessToken}` } }); } catch { throw new YouTubeAnalyticsError('youtube-analytics-network-failure', 'Unable to reach YouTube analytics. Please try again.', { status: 503, retryable: true }); }
      let body = {}; try { body = await response.json(); } catch { if (!response.ok) throw providerError(response, body, now().getTime()); throw new YouTubeAnalyticsError('youtube-analytics-provider-response-invalid', 'YouTube analytics returned an invalid response.'); }
      if (!response.ok) throw providerError(response, body, now().getTime());
      const headers = Array.isArray(body.columnHeaders) ? body.columnHeaders : null;
      if (!headers || !headers.every((header) => typeof header?.name === 'string')) throw new YouTubeAnalyticsError('youtube-analytics-provider-response-invalid', 'YouTube analytics returned malformed report columns.');
      const rows = Array.isArray(body.rows) ? body.rows : [];
      const incompleteDiagnostics = incomplete ? [diagnostic('incomplete-window', 'info', `This ${input.window} window began before the video was published. Only post-publication data is available and it is not comparable as a complete window.`)] : [];
      if (!rows.length) {
        const availability = Date.parse(input.publishedAt) > now().getTime() - 72 * 60 * 60 * 1000 ? 'not-ready' : 'unavailable';
        return { metrics: unavailableMetrics(availability, observedAt), diagnostics: [...incompleteDiagnostics, diagnostic('incomplete-window', 'info', availability === 'not-ready' ? 'YouTube analytics is not ready for this newly published video yet.' : 'YouTube analytics has no data for this publication. It may be unavailable or private.')] };
      }
      const first = rows[0]; if (!Array.isArray(first)) throw new YouTubeAnalyticsError('youtube-analytics-provider-response-invalid', 'YouTube analytics returned malformed report rows.');
      const values = new Map(headers.map((header, index) => [header.name, first[index]]));
      const missing = RAW_METRICS.filter((metric) => !values.has(metric));
      const metrics = RAW_METRICS.map((metric) => values.has(metric) ? ({ rawMetricId: OUTPUT_METRICS[metric], value: values.get(metric), observedAt }) : ({ rawMetricId: OUTPUT_METRICS[metric], value: null, availability: 'invalid', observedAt }));
      return { metrics, diagnostics: [...incompleteDiagnostics, ...missing.map((metric) => diagnostic('malformed-metric', 'warning', `YouTube analytics omitted the ${metric} metric.`))] };
    },
  };
}

module.exports = { ANALYTICS_SCOPE, ANALYTICS_URL, RAW_METRICS, YouTubeAnalyticsError, createYouTubeAnalyticsService, reportDates, validRequest };
