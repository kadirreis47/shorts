import type { RenderManifest } from '@/core/media';

export type PlatformId = 'youtube-shorts' | 'tiktok' | 'instagram-reels' | 'generic-short-video';
export type PlatformOperationType =
  | 'change-aspect-ratio' | 'change-resolution' | 'change-frame-rate' | 'adjust-safe-area'
  | 'reposition-subtitles' | 'resize-subtitles' | 'change-caption-profile' | 'adjust-hook-duration'
  | 'shorten-video' | 'adjust-scene-pacing' | 'adjust-cta-position' | 'normalize-audio-profile'
  | 'adjust-music-level' | 'adjust-final-loudness' | 'change-render-preset' | 'adjust-thumbnail-frame'
  | 'add-platform-metadata-plan' | 'change-export-container' | 'change-video-codec' | 'change-audio-codec'
  | 'change-bitrate-profile' | 'change-color-space' | 'keep';
export type PlatformOperationStatus = 'proposed' | 'approved' | 'applied' | 'planned-only' | 'skipped' | 'rejected';
export interface PlatformProfileVersion { version: string; sourcePolicyVersion: string; updatedAt: string; }
export interface NormalizedInsets { top: number; right: number; bottom: number; left: number; }
export interface PlatformProfile extends PlatformProfileVersion {
  id: PlatformId; displayName: string; aspectRatios: readonly string[]; preferredAspectRatio: string;
  supportedResolutions: readonly { width: number; height: number }[]; preferredResolution: { width: number; height: number };
  frameRateRange: { min: number; max: number }; preferredFrameRates: readonly number[];
  durationPolicy: { minMs: number; maxMs: number; preferredMaxMs: number };
  safeAreaInsets: NormalizedInsets; subtitleSafeArea: NormalizedInsets;
  subtitleProfile: { maxLines: number; maxCharsPerLine: number; position: 'top' | 'bottom'; fontScale: number; style: string };
  hookGuidance: { maxMs: number; minDensity: number }; pacingGuidance: { minSceneMs: number; maxSceneMs: number };
  ctaGuidance: { preferredStartRatio: number; preferredEndRatio: number };
  loudnessProfile: { integratedLufs: number; truePeakDbtp: number; channels: 1 | 2; sampleRate: number };
  bitrateProfile: { videoKbps: number; audioKbps: number; gopFrames: number };
  codecCapabilities: readonly string[]; containerCapabilities: readonly string[]; colorSpaceCapabilities: readonly string[];
  thumbnailFrameGuidance: { preferredRatio: number }; metadataGuidance: { required: readonly string[] };
  warnings: readonly string[];
}
export interface PlatformCapability { type: PlatformOperationType; status: 'implemented' | 'planned-only'; reason: string; }
export interface PlatformOperation {
  id: string; projectId: string; targetPlatform: PlatformId; sourceManifestFingerprint: string; sourceManifestFingerprintVersion: number;
  type: PlatformOperationType; scope: 'manifest' | 'timeline' | 'subtitle' | 'audio' | 'visual' | 'export'; priority: number;
  reason: string; evidence: readonly string[]; parameters: Readonly<Record<string, string | number | boolean>>;
  expectedImpact: string; confidence: number; automaticallyApplicable: boolean; capability: PlatformCapability;
  dependencies: readonly string[]; conflicts: readonly string[]; status: PlatformOperationStatus; createdAt: string;
}
export interface PlatformScore { value: number; evidence: readonly string[]; blockingIssues: readonly string[]; warnings: readonly string[]; quickWins: readonly string[]; }
export interface PlatformReadinessReport { platformId: PlatformId; profileVersion: string; formatFit: PlatformScore; durationFit: PlatformScore; safeAreaFit: PlatformScore; subtitleFit: PlatformScore; audioFit: PlatformScore; visualFit: PlatformScore; hookFit: PlatformScore; pacingFit: PlatformScore; exportCompatibility: PlatformScore; overall: number; }
export interface PlatformOptimizationPlan { id: string; projectId: string; platformId: PlatformId; profile: PlatformProfile; sourceManifestFingerprint: string; sourceManifestFingerprintVersion: number; operations: readonly PlatformOperation[]; readiness: PlatformReadinessReport; variant: { targetWidth: number; targetHeight: number; targetAspectRatio: string; scalingMode: 'scale' | 'crop' | 'pad'; safeAreaInsets: NormalizedInsets; manualReviewRequired: boolean; }; warnings: readonly string[]; createdAt: string; }
export interface PlatformOptimizationPreview { id: string; planId: string; planFingerprint: string; projectId: string; platformId: PlatformId; profileVersion: string; sourceManifestFingerprint: string; sourceManifestFingerprintVersion: number; canonicalApprovedOperationIds: readonly string[]; approvalSignature: string; effectiveOperationSignature: string; plan: PlatformOptimizationPlan; before: PlatformReadinessReport; after: PlatformReadinessReport; appliedOperationIds: readonly string[]; plannedOperationIds: readonly string[]; affectedScenes: readonly string[]; reusableScenes: readonly string[]; cacheReuseEstimate: number; manualApprovalRequired: readonly string[]; createdAt: string; }
export interface PlatformVariantSnapshot { variantId: string; projectId: string; platformId: PlatformId; profileVersion: string; sourceManifestFingerprint: string; manifest: RenderManifest; appliedOperationIds: readonly string[]; revisionId: string; createdAt: string; }
export interface PlatformOptimizationInput { manifest: RenderManifest; platformId: PlatformId; profileOverride?: Partial<PlatformProfile>; now?: string; }
export interface PlatformOptimizationEngine { analyze(input: PlatformOptimizationInput, signal?: AbortSignal): PlatformOptimizationPlan; preview(plan: PlatformOptimizationPlan, manifest: RenderManifest, approvedOperationIds?: readonly string[], signal?: AbortSignal): PlatformOptimizationPreview; apply(plan: PlatformOptimizationPlan, preview: PlatformOptimizationPreview, manifest: RenderManifest, approvedOperationIds?: readonly string[]): { snapshot: PlatformVariantSnapshot; appliedOperations: readonly PlatformOperation[]; skippedOperations: readonly PlatformOperation[] }; }
