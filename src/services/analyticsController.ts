import { applicationContainer, dependencyTokens } from '@/core/di';
import { bindingId, extractAnalyticsAttribution, type AnalyticsWindow, type PublishedContentBinding } from '@/core/analytics';
import { useAnalyticsStore } from '@/store/analyticsStore';
import type { AnalyticsApplicationService } from './analyticsApplicationService';

const service = (): AnalyticsApplicationService => applicationContainer.resolve(dependencyTokens.analyticsApplicationService);
export async function refreshPublicationAnalytics(binding: PublishedContentBinding, window: AnalyticsWindow = '24h', attributionSource: Readonly<Record<string, unknown>> = {}) { const applicationService = service(); const store = useAnalyticsStore.getState(); applicationService.restoreCooldowns(store.refreshes); const result = await applicationService.collect(binding, window); const cooldownUntil = applicationService.getCooldown(binding); if (cooldownUntil) store.setRefresh(applicationService.refreshKey(binding), { latestRequestId: result.collectionId, fetchedAt: new Date().toISOString(), cooldownUntil }); for (const snapshot of result.snapshots) store.setSnapshot(snapshot); store.setAttribution(extractAnalyticsAttribution(binding, attributionSource)); return result; }
export function regenerateChannelLearning(channel: { platform: PublishedContentBinding['platform']; accountId: string; accountRef: string; channelRef: string | null }, window: AnalyticsWindow = '24h') { const learning = service().learn(useAnalyticsStore.getState(), channel, window); useAnalyticsStore.getState().setLearning(learning); return learning; }
export { bindingId };
