import type { PublishPlatform } from '@/core/publishing';

export type AnalyticsPlatform = PublishPlatform | 'x';
export type AnalyticsAdapterStatus = 'implemented' | 'planned-only' | 'unsupported' | 'authentication-required';
export type AnalyticsWindow = '1h' | '6h' | '24h' | '48h' | '7d' | '30d' | 'lifetime';
export type AnalyticsFreshness = 'fresh' | 'stale' | 'delayed' | 'unknown';
export type MetricAvailability = 'available' | 'unavailable' | 'unsupported' | 'not-ready' | 'permission-missing' | 'invalid';
export type AnalyticsMetricName = 'views' | 'impressions' | 'reach' | 'likes' | 'comments' | 'shares' | 'saves' | 'watchTime' | 'averageWatchTime' | 'averagePercentageViewed' | 'completionRate' | 'engagementRate' | 'followersGained' | 'profileVisits' | 'clicks';
export type MetricUnit = 'count' | 'seconds' | 'percentage' | 'ratio';
export type LearningLevel = 'low' | 'medium' | 'high';
export type Trajectory = 'rising' | 'stable' | 'slowing' | 'unknown';
export type PerformanceDimensionName = 'reach' | 'engagement' | 'retention' | 'conversion-growth' | 'velocity';

export interface AnalyticsRevision { version: 1; normalizationPolicy: string; scoringPolicy: string; confidencePolicy: string; retentionPolicy: string; createdAt: string; }
export interface PublishedContentBinding { projectId: string; variantId: string | null; artifactFingerprint: string; publishJobId: string; publishReceiptId: string; platform: AnalyticsPlatform; accountId: string; accountRef: string; channelRef: string | null; remotePublicationId: string; publishedAt: string; }
export interface AnalyticsSource { platform: AnalyticsPlatform; adapterId: string; fetchedAt: string; observedAt: string | null; rawMetricId: string | null; normalizedMetric: AnalyticsMetricName; estimated: boolean; quality: LearningLevel; }
export interface AnalyticsMetric { name: AnalyticsMetricName; value: number | null; unit: MetricUnit; availability: MetricAvailability; source: AnalyticsSource; window: AnalyticsWindow; formula?: { id: string; version: string; expression: string }; }
export interface AnalyticsObservation { id: string; bindingId: string; metric: AnalyticsMetric; observedAt: string; fetchedAt: string; requestId: string; }
export interface AnalyticsMetricSeries { bindingId: string; metric: AnalyticsMetricName; window: AnalyticsWindow; observations: readonly AnalyticsObservation[]; trajectory: Trajectory; }
export interface AnalyticsDiagnostic { code: 'missing-retention' | 'incomplete-window' | 'stale-metrics' | 'platform-discrepancy' | 'insufficient-sample' | 'outlier-heavy-cohort' | 'permission-limited' | 'malformed-metric' | 'binding-mismatch' | 'rate-limited'; severity: 'info' | 'warning' | 'error'; message: string; metric?: AnalyticsMetricName; }
export interface AnalyticsSnapshot { id: string; binding: Readonly<PublishedContentBinding>; collectedAt: string; observedAt: string | null; freshness: AnalyticsFreshness; metrics: readonly AnalyticsMetric[]; diagnostics: readonly AnalyticsDiagnostic[]; revision: AnalyticsRevision; requestId: string; }
export interface AnalyticsCapability { platform: AnalyticsPlatform; adapterStatus: AnalyticsAdapterStatus; authenticated: boolean; supportedMetrics: readonly AnalyticsMetricName[]; supportsSeries: boolean; reason: string; version: string; }

export interface PerformanceBaseline { status: 'ready' | 'insufficient-data' | 'window-mismatch'; metric: AnalyticsMetricName; platform: AnalyticsPlatform; accountId: string; channelRef: string | null; window: AnalyticsWindow; sampleSize: number; median: number | null; p25: number | null; p75: number | null; outlierCount: number; }
export interface PerformanceComparison { metric: AnalyticsMetricName; status: 'comparable' | 'insufficient-data' | 'window-mismatch' | 'unavailable'; value: number | null; baseline: PerformanceBaseline; deltaPercent: number | null; }
export interface PerformanceDimension { name: PerformanceDimensionName; score: number | null; confidence: number; unavailableMetrics: readonly AnalyticsMetricName[]; evidence: readonly string[]; }
export interface PerformanceScore { overall: number | null; dimensions: readonly PerformanceDimension[]; confidence: number; baselineStatus: PerformanceBaseline['status']; evidence: readonly string[]; version: string; }
export interface ContentPerformance { bindingId: string; score: PerformanceScore; comparisons: readonly PerformanceComparison[]; trajectory: Trajectory; generatedAt: string; }
export interface InsightEvidence { metric: AnalyticsMetricName; value: number | null; baselineValue: number | null; sampleSize: number; window: AnalyticsWindow; sourceSnapshotIds: readonly string[]; }
export interface PerformanceInsight { id: string; bindingId: string; relation: 'associated-with' | 'correlated-with' | 'outperformed-in-observed-sample'; message: string; evidence: readonly InsightEvidence[]; confidence: LearningConfidence; limitations: readonly string[]; generatedAt: string; }
export interface AnalyticsAttribution { bindingId: string; features: Readonly<Record<string, string | number | boolean | null>>; extractedAt: string; sourceFingerprint: string; }
export interface LearningConfidence { level: LearningLevel; score: number; policyVersion: string; factors: Readonly<Record<string, number>>; }
export interface LearningSignal { id: string; feature: string; cohort: string; sampleSize: number; effect: number; relation: 'associated-with' | 'correlated-with' | 'outperformed-in-observed-sample'; confidence: LearningConfidence; evidence: readonly InsightEvidence[]; window: AnalyticsWindow; limitations: readonly string[]; outlierCount: number; }
export interface LearningProfile { id: string; channelBinding: Pick<PublishedContentBinding, 'platform' | 'accountId' | 'accountRef' | 'channelRef'>; sampleSize: number; observationWindow: AnalyticsWindow; status: 'ready' | 'cold-start'; strongestSignals: readonly LearningSignal[]; weakSignals: readonly LearningSignal[]; unknowns: readonly string[]; confidence: LearningConfidence; version: string; generatedAt: string; }
export interface RecommendationEvidence { signalId: string; relation: LearningSignal['relation']; sampleSize: number; effect: number; limitations: readonly string[]; }
export interface Recommendation { id: string; channelBinding: LearningProfile['channelBinding']; recommendation: string; reason: string; expectedDirection: 'test-for-improvement' | 'test-for-reduction' | 'explore'; confidence: LearningConfidence; evidence: readonly RecommendationEvidence[]; limitations: readonly string[]; autoApplyStatus: 'planned-only'; generatedAt: string; }
export interface MetricNormalization { rawMetricId: string; canonicalMetric: AnalyticsMetricName; unit: MetricUnit; availability: MetricAvailability; value: number | null; reason?: string; }
export interface AnalyticsCollectionResult { collectionId: string; snapshots: readonly AnalyticsSnapshot[]; status: 'completed' | 'partial' | 'failed' | 'rate-limited'; diagnostics: readonly AnalyticsDiagnostic[]; }
export interface AnalyticsAdapterResponse { metrics: readonly { rawMetricId: string; value: unknown; unit?: MetricUnit; availability?: MetricAvailability; observedAt?: string | null; estimated?: boolean; }[]; diagnostics?: readonly AnalyticsDiagnostic[]; }
export interface AnalyticsPlatformAdapter { readonly platform: AnalyticsPlatform; capability(): AnalyticsCapability; collect(binding: PublishedContentBinding, options: { window: AnalyticsWindow; signal: AbortSignal }): Promise<AnalyticsAdapterResponse>; }
export interface AnalyticsPlatformAdapterRegistry { get(platform: AnalyticsPlatform): AnalyticsPlatformAdapter; list(): readonly AnalyticsPlatformAdapter[]; }
export interface AnalyticsPersistenceState { version: 1; snapshots: readonly AnalyticsSnapshot[]; attributions: readonly AnalyticsAttribution[]; profiles: readonly LearningProfile[]; insights: readonly PerformanceInsight[]; recommendations: readonly Recommendation[]; refreshes: Readonly<Record<string, { latestRequestId: string; fetchedAt: string; cooldownUntil: string | null }>>; }
