import { stableId } from '@/core/editing/utils';
import { freshnessOf } from './series';
import type { AnalyticsAdapterResponse, AnalyticsDiagnostic, AnalyticsMetric, AnalyticsMetricName, AnalyticsSnapshot, AnalyticsSource, MetricAvailability, MetricNormalization, MetricUnit, PublishedContentBinding } from './types';

const definitions: Record<AnalyticsMetricName, MetricUnit> = { views: 'count', impressions: 'count', reach: 'count', likes: 'count', comments: 'count', shares: 'count', saves: 'count', watchTime: 'seconds', averageWatchTime: 'seconds', averagePercentageViewed: 'percentage', completionRate: 'percentage', engagementRate: 'percentage', followersGained: 'count', profileVisits: 'count', clicks: 'count' };
const aliases: Record<string, AnalyticsMetricName> = { views: 'views', view_count: 'views', impressions: 'impressions', reach: 'reach', likes: 'likes', like_count: 'likes', comments: 'comments', comment_count: 'comments', shares: 'shares', saves: 'saves', watch_time: 'watchTime', watchtime: 'watchTime', average_watch_time: 'averageWatchTime', average_percentage_viewed: 'averagePercentageViewed', completion_rate: 'completionRate', engagement_rate: 'engagementRate', followers_gained: 'followersGained', profile_visits: 'profileVisits', clicks: 'clicks' };
export const ANALYTICS_REVISION = { version: 1 as const, normalizationPolicy: 'analytics-normalization-v1', scoringPolicy: 'performance-scoring-v1', confidencePolicy: 'learning-confidence-v1', retentionPolicy: 'analytics-retention-v1' };
export function normalizeRawMetric(rawMetricId: string, rawValue: unknown, unit?: MetricUnit, availability: MetricAvailability = 'available'): MetricNormalization {
  const canonicalMetric = aliases[rawMetricId.trim().toLowerCase()];
  if (!canonicalMetric) return { rawMetricId, canonicalMetric: 'views', unit: unit ?? 'count', availability: 'unsupported', value: null, reason: 'Unknown platform metric.' };
  const canonicalUnit = definitions[canonicalMetric];
  if (availability !== 'available') return { rawMetricId, canonicalMetric, unit: canonicalUnit, availability, value: null };
  const numeric = typeof rawValue === 'number' ? rawValue : typeof rawValue === 'string' && rawValue.trim() !== '' ? Number(rawValue) : NaN;
  if (!Number.isFinite(numeric) || numeric < 0) return { rawMetricId, canonicalMetric, unit: canonicalUnit, availability: 'invalid', value: null, reason: 'Metric must be a finite non-negative number.' };
  const bounded = canonicalUnit === 'percentage' ? Math.min(100, numeric) : numeric;
  return { rawMetricId, canonicalMetric, unit: canonicalUnit, availability, value: bounded };
}
export function normalizeAnalyticsResponse(input: { binding: PublishedContentBinding; response: AnalyticsAdapterResponse; window: AnalyticsMetric['window']; requestId: string; adapterId: string; now?: string }): AnalyticsSnapshot {
  const collectedAt = input.now ?? new Date().toISOString(); const diagnostics: AnalyticsDiagnostic[] = [...(input.response.diagnostics ?? [])];
  const metrics = input.response.metrics.flatMap((raw) => {
    if (!aliases[raw.rawMetricId.trim().toLowerCase()]) { diagnostics.push({ code: 'malformed-metric', severity: 'warning', message: `Ignored unsupported ${raw.rawMetricId} metric.` }); return []; }
    const normalized = normalizeRawMetric(raw.rawMetricId, raw.value, raw.unit, raw.availability); const observedAt = raw.observedAt && Number.isFinite(Date.parse(raw.observedAt)) ? raw.observedAt : null; const source: AnalyticsSource = { platform: input.binding.platform, adapterId: input.adapterId, fetchedAt: collectedAt, observedAt, rawMetricId: raw.rawMetricId, normalizedMetric: normalized.canonicalMetric, estimated: raw.estimated ?? false, quality: normalized.availability === 'available' ? 'high' : 'low' };
    if (normalized.availability === 'invalid') diagnostics.push({ code: 'malformed-metric', severity: 'warning', metric: normalized.canonicalMetric, message: `Rejected malformed ${raw.rawMetricId} metric.` });
    if (raw.observedAt && observedAt === null) diagnostics.push({ code: 'malformed-metric', severity: 'warning', metric: normalized.canonicalMetric, message: `Ignored malformed observedAt for ${raw.rawMetricId}.` });
    return [{ name: normalized.canonicalMetric, value: normalized.value, unit: normalized.unit, availability: normalized.availability, source, window: input.window } satisfies AnalyticsMetric];
  });
  if (!metrics.some((metric) => metric.name === 'averagePercentageViewed' && metric.availability === 'available')) diagnostics.push({ code: 'missing-retention', severity: 'info', metric: 'averagePercentageViewed', message: 'Retention is unavailable; performance confidence is reduced.' });
  const observedAt = metrics.filter((metric) => metric.availability === 'available').map((metric) => metric.source.observedAt).filter((value): value is string => Boolean(value)).sort().at(0) ?? null;
  const bindingIdentity = JSON.stringify([input.binding.projectId, input.binding.variantId, input.binding.artifactFingerprint, input.binding.publishJobId, input.binding.publishReceiptId, input.binding.platform, input.binding.accountId, input.binding.accountRef, input.binding.channelRef, input.binding.remotePublicationId, input.binding.publishedAt]);
  return { id: stableId('analytics-snapshot', `${bindingIdentity}:${input.window}:${collectedAt}:${input.requestId}`), binding: { ...input.binding }, collectedAt, observedAt, freshness: freshnessOf({ collectedAt, observedAt }), metrics, diagnostics, revision: { ...ANALYTICS_REVISION, createdAt: collectedAt }, requestId: input.requestId };
}
