import type { AnalyticsAdapterOptions, YouTubeAnalyticsClient } from '@/core/analytics/adapters';
import { usePublishingStore } from '@/store/publishingStore';

export function currentYouTubeAnalyticsAdapterOptions(): AnalyticsAdapterOptions {
  const bridge = typeof window === 'undefined' ? undefined : window.electronAPI?.youtube;
  const youtubeClient: YouTubeAnalyticsClient | undefined = bridge?.collectAnalytics ? { collectAnalytics: bridge.collectAnalytics } : undefined;
  return {
    youtubeClient,
    credentialRefFor: (binding) => usePublishingStore.getState().accounts.find((account) => account.id === binding.accountId && account.platform === 'youtube' && account.channelRef === binding.channelRef)?.credentialRef ?? null,
  };
}
