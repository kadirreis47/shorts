import type { AnalyticsCapability, AnalyticsPlatform, AnalyticsPlatformAdapter, AnalyticsPlatformAdapterRegistry } from './types';

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
export function createAnalyticsAdapterRegistry(): AnalyticsPlatformAdapterRegistry { const adapters = (['youtube', 'tiktok', 'instagram', 'x'] as const).map(unavailable); return { get(platform) { const adapter = adapters.find((item) => item.platform === platform); if (!adapter) throw new Error(`Unsupported analytics platform: ${platform}`); return adapter; }, list() { return adapters; } }; }

/** Test/dev only. Do not register this adapter in production registries. */
export function createDeterministicAnalyticsTestAdapter(platform: AnalyticsPlatform, metrics: AnalyticsPlatformAdapter['collect']): AnalyticsPlatformAdapter { return { platform, capability: () => ({ ...capability(platform), adapterStatus: 'implemented', authenticated: true, supportedMetrics: ['views', 'likes', 'comments', 'averagePercentageViewed'], supportsSeries: true, reason: 'Deterministic test adapter; unavailable in production.', version: 'test-only' }), collect: metrics }; }
