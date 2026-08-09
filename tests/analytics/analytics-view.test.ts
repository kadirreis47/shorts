import { describe, expect, it } from 'vitest';
import { bindingId, normalizeAnalyticsResponse, type PerformanceInsight, type PublishedContentBinding } from '@/core/analytics';
import { insightsForSelectedPublication, snapshotForSelection } from '@/views/analyticsSelection';

const binding = (remote: string): PublishedContentBinding => ({ projectId: 'project', variantId: 'variant', artifactFingerprint: 'artifact', publishJobId: 'job', publishReceiptId: `receipt-${remote}`, platform: 'youtube', accountId: 'account', accountRef: 'account', channelRef: 'channel', remotePublicationId: remote, publishedAt: '2026-08-01T10:00:00.000Z' });
const snapshot = (remote: string, collectedAt = '2026-08-01T11:00:00.000Z') => normalizeAnalyticsResponse({ binding: binding(remote), window: '24h', requestId: remote, adapterId: 'test', now: collectedAt, response: { metrics: [{ rawMetricId: 'views', value: 1 }] } });

describe('Analytics selected-publication insights', () => {
  it('does not treat another publication’s insight as a selected result', () => {
    const selected = snapshot('selected'); const other = snapshot('other');
    const insight: PerformanceInsight = { id: 'other-insight', bindingId: bindingId(other), relation: 'outperformed-in-observed-sample', message: 'Other publication insight.', evidence: [], confidence: { level: 'low', score: 0, policyVersion: 'test', factors: {} }, limitations: [], generatedAt: '2026-08-01T11:00:00.000Z' };
    expect(insightsForSelectedPublication([insight], selected)).toEqual([]);
  });
  it('keeps an explicitly selected publication empty instead of showing another snapshot', () => {
    const existing = snapshot('existing');
    expect(snapshotForSelection([existing], bindingId({ binding: binding('missing') }))).toBeNull();
    expect(snapshotForSelection([existing], null)).toBe(existing);
  });
  it('selects the newest valid snapshot when a publication has been refreshed repeatedly', () => {
    const old = snapshot('selected', '2026-08-01T11:00:00.000Z');
    const current = snapshot('selected', '2026-08-01T12:00:00.000Z');
    const malformed = { ...snapshot('selected', '2026-08-01T13:00:00.000Z'), collectedAt: 'not-a-timestamp' };
    expect(snapshotForSelection([old, malformed, current], bindingId(current))).toBe(current);
  });
});
