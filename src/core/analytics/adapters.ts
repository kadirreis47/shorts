import type { AnalyticsAdapterResponse, AnalyticsCapability, AnalyticsPlatform, AnalyticsPlatformAdapter, AnalyticsPlatformAdapterRegistry, AnalyticsWindow, PublishedContentBinding } from './types';

export interface YouTubeAnalyticsRequest { credentialRef: string; channelRef: string; remotePublicationId: string; publishedAt: string; window: AnalyticsWindow; }
export interface YouTubeAnalyticsClient { collectAnalytics(request: YouTubeAnalyticsRequest): Promise<{ ok: true; result: AnalyticsAdapterResponse } | { ok: false; error: { code: string; message: string; retryable: boolean; status: number; retryAfterMs: number | null } }>; }
export interface AnalyticsAdapterOptions { youtubeClient?: YouTubeAnalyticsClient; credentialRefFor?: (binding: PublishedContentBinding) => string | null; }

const capability = (platform: AnalyticsPlatform): AnalyticsCapability => ({
  platform,
  adapterStatus: platform === 'youtube' ? 'authentication-required' : platform === 'x' ? 'unsupported' : 'planned-only',
  authenticated: false,
  supportedMetrics: [],
  supportsSeries: false,
  reason: platform === 'youtube' ? 'Official YouTube Analytics OAuth integration is not configured in this repository.' : platform === 'x' ? 'X analytics is not part of the current product scope.' : `Official ${platform} analytics integration is planned but not implemented.`,
  version: '2026.1',
});
function unavailable(platform: AnalyticsPlatform): AnalyticsPlatformAdapter { return { platform, capability: () => capability(platform), async collect() { throw Object.assign(new Error(capability(platform).reason), { code: 'analytics-capability-unavailable', retryable: false }); } }; }
export function createYouTubeAnalyticsAdapter(options: AnalyticsAdapterOptions = {}): AnalyticsPlatformAdapter {
  const ready = Boolean(options.youtubeClient && options.credentialRefFor);
  return { platform: 'youtube', capability: () => ({ platform: 'youtube', adapterStatus: ready ? 'implemented' : 'authentication-required', authenticated: ready, supportedMetrics: ['views', 'likes', 'comments', 'shares', 'averagePercentageViewed', 'followersGained'], supportsSeries: true, reason: ready ? 'Official YouTube Analytics collection is available for connected accounts.' : 'YouTube Analytics requires the trusted Electron desktop connection.', version: '2026.2' }), async collect(binding, request) {
    if (!options.youtubeClient || !options.credentialRefFor) throw Object.assign(new Error('YouTube analytics requires the Electron trusted execution boundary.'), { code: 'youtube-desktop-required', status: 503, retryable: false });
    const credentialRef = options.credentialRefFor(binding); if (!credentialRef) throw Object.assign(new Error('The publishing account credential is unavailable. Reconnect the account before refreshing analytics.'), { code: 'credential-missing', status: 401, retryable: false });
    const result = await options.youtubeClient.collectAnalytics({ credentialRef, channelRef: binding.channelRef ?? '', remotePublicationId: binding.remotePublicationId, publishedAt: binding.publishedAt, window: request.window });
    if (!result.ok) throw Object.assign(new Error(result.error.message), result.error);
    return result.result;
  } };
}
export function createAnalyticsAdapterRegistry(options: AnalyticsAdapterOptions = {}): AnalyticsPlatformAdapterRegistry { const adapters: AnalyticsPlatformAdapter[] = [createYouTubeAnalyticsAdapter(options), unavailable('tiktok'), unavailable('instagram'), unavailable('x')]; return { get(platform) { const adapter = adapters.find((item) => item.platform === platform); if (!adapter) throw new Error(`Unsupported analytics platform: ${platform}`); return adapter; }, list() { return adapters; } }; }

/** Test/dev only. Do not register this adapter in production registries. */
export function createDeterministicAnalyticsTestAdapter(platform: AnalyticsPlatform, metrics: AnalyticsPlatformAdapter['collect']): AnalyticsPlatformAdapter { return { platform, capability: () => ({ ...capability(platform), adapterStatus: 'implemented', authenticated: true, supportedMetrics: ['views', 'likes', 'comments', 'averagePercentageViewed'], supportsSeries: true, reason: 'Deterministic test adapter; unavailable in production.', version: 'test-only' }), collect: metrics }; }
