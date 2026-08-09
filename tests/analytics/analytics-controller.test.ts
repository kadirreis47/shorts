import { afterEach, describe, expect, it } from 'vitest';
import { applicationContainer, dependencyTokens } from '@/core/di';
import { bindingId, generateLearningProfile, normalizeAnalyticsResponse, recommendationsFromProfile, type AnalyticsPersistenceState, type PublishedContentBinding } from '@/core/analytics';
import { createAnalyticsApplicationService } from '@/services/analyticsApplicationService';
import { refreshPublicationAnalytics, regenerateChannelLearning } from '@/services/analyticsController';
import type { AnalyticsApplicationService } from '@/services/analyticsApplicationService';
import { useAnalyticsStore } from '@/store/analyticsStore';

const binding = (remote: string): PublishedContentBinding => ({ projectId: 'project', variantId: 'variant', artifactFingerprint: `artifact-${remote}`, publishJobId: `job-${remote}`, publishReceiptId: `receipt-${remote}`, platform: 'youtube', accountId: 'account', accountRef: 'account', channelRef: 'channel', remotePublicationId: remote, publishedAt: '2026-08-01T10:00:00.000Z' });
const snapshot = (item: PublishedContentBinding, retention: number, collectedAt = new Date().toISOString()) => normalizeAnalyticsResponse({ binding: item, window: '24h', requestId: item.remotePublicationId, adapterId: 'test', now: collectedAt, response: { metrics: [{ rawMetricId: 'views', value: 100 }, { rawMetricId: 'average_percentage_viewed', value: retention }] } });
const viewsSnapshot = (item: PublishedContentBinding, views: number, collectedAt: string) => normalizeAnalyticsResponse({ binding: item, window: '24h', requestId: item.remotePublicationId, adapterId: 'test', now: collectedAt, response: { metrics: [{ rawMetricId: 'views', value: views }] } });

afterEach(() => { applicationContainer.reset(); useAnalyticsStore.setState(useAnalyticsStore.getInitialState(), true); });

describe('analytics Studio learning workflow', () => {
  it('persists refresh attribution before generating channel learning', async () => {
    const service: AnalyticsApplicationService = {
      capabilities: () => [],
      collect: async (item) => ({ collectionId: item.remotePublicationId, snapshots: [snapshot(item, item.remotePublicationId.startsWith('a') ? 80 : 20)], status: 'completed', diagnostics: [] }),
      getCooldown: () => null,
      refreshKey: (item) => `${item.platform}:${item.accountId}`,
      restoreCooldowns: () => undefined,
      learn: (state: AnalyticsPersistenceState, channel, window = '24h') => { const profile = generateLearningProfile(state.snapshots, state.attributions, channel, window); return { profiles: [profile], insights: [], recommendations: recommendationsFromProfile(profile) }; },
    };
    applicationContainer.registerValue(dependencyTokens.analyticsApplicationService, service);
    for (const remote of ['a1', 'a2', 'a3', 'b1', 'b2', 'b3']) await refreshPublicationAnalytics(binding(remote), '24h', { hookType: remote.startsWith('a') ? 'question' : 'statement' });
    const learning = regenerateChannelLearning({ platform: 'youtube', accountId: 'account', accountRef: 'account', channelRef: 'channel' });
    expect(useAnalyticsStore.getState().attributions).toHaveLength(6);
    expect(learning.profiles[0].strongestSignals).not.toHaveLength(0);
    expect(learning.recommendations).not.toHaveLength(0);
  });
  it('generates current insights from only the latest snapshot while retaining refresh history', () => {
    const currentBinding = binding('current');
    const old = viewsSnapshot(currentBinding, 20, '2026-08-01T11:00:00.000Z');
    const current = viewsSnapshot(currentBinding, 200, '2026-08-01T12:00:00.000Z');
    const comparisons = ['a', 'b', 'c', 'd', 'e'].map((remote, index) => viewsSnapshot(binding(remote), 100 + index, '2026-08-01T12:00:00.000Z'));
    const state: AnalyticsPersistenceState = { version: 1, snapshots: [old, current, ...comparisons], attributions: [], profiles: [], insights: [], recommendations: [], refreshes: {} };

    const learning = createAnalyticsApplicationService().learn(state, { platform: 'youtube', accountId: 'account', accountRef: 'account', channelRef: 'channel' });
    const currentInsights = learning.insights.filter((insight) => insight.bindingId === bindingId(current));

    expect(currentInsights).toHaveLength(1);
    expect(currentInsights[0].evidence[0].sourceSnapshotIds).toEqual([current.id]);
    expect(state.snapshots).toEqual(expect.arrayContaining([old, current]));
    expect(learning.profiles[0].sampleSize).toBe(6);
  });
  it('persists a 429 account cooldown through the analytics refresh state', async () => {
    const cooldownUntil = new Date(Date.now() + 20_000).toISOString();
    const service: AnalyticsApplicationService = { capabilities: () => [], collect: async () => ({ collectionId: 'limited', snapshots: [], status: 'rate-limited', diagnostics: [] }), getCooldown: () => cooldownUntil, refreshKey: (item) => `${item.platform}:${item.accountId}`, restoreCooldowns: () => undefined, learn: () => ({ profiles: [], insights: [], recommendations: [] }) };
    applicationContainer.registerValue(dependencyTokens.analyticsApplicationService, service);

    await refreshPublicationAnalytics(binding('limited'));

    expect(useAnalyticsStore.getState().refreshes['youtube:account']).toEqual(expect.objectContaining({ latestRequestId: 'limited', cooldownUntil }));
  });
  it('does not let a concurrent successful request clear a newer persisted cooldown', async () => {
    const cooldownUntil = new Date(Date.now() + 20_000).toISOString(); let resolveSuccess: () => void = () => undefined; let limited = false;
    const service: AnalyticsApplicationService = { capabilities: () => [], collect: async (item) => item.remotePublicationId === 'success' ? new Promise((resolve) => { resolveSuccess = () => resolve({ collectionId: 'success', snapshots: [], status: 'completed', diagnostics: [] }); }) : (limited = true, { collectionId: 'limited', snapshots: [], status: 'rate-limited', diagnostics: [] }), getCooldown: () => limited ? cooldownUntil : null, refreshKey: (item) => `${item.platform}:${item.accountId}`, restoreCooldowns: () => undefined, learn: () => ({ profiles: [], insights: [], recommendations: [] }) };
    applicationContainer.registerValue(dependencyTokens.analyticsApplicationService, service);
    const success = refreshPublicationAnalytics(binding('success'));
    await refreshPublicationAnalytics(binding('limited'));
    resolveSuccess(); await success;
    expect(useAnalyticsStore.getState().refreshes['youtube:account']?.cooldownUntil).toBe(cooldownUntil);
  });
  it('does not persist a cooldown for a superseded rate-limit failure', async () => {
    const service: AnalyticsApplicationService = { capabilities: () => [], collect: async () => ({ collectionId: 'superseded', snapshots: [], status: 'partial', diagnostics: [] }), getCooldown: () => null, refreshKey: (item) => `${item.platform}:${item.accountId}`, restoreCooldowns: () => undefined, learn: () => ({ profiles: [], insights: [], recommendations: [] }) };
    applicationContainer.registerValue(dependencyTokens.analyticsApplicationService, service);
    await refreshPublicationAnalytics(binding('superseded'));
    expect(useAnalyticsStore.getState().refreshes).toEqual({});
  });
});
