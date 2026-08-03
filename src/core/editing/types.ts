import type { DirectorReport, DirectorRecommendationPriority } from '@/core/director';
import type { AudioTimeline, MediaScene, RenderManifest, SubtitleTimeline, TransitionType } from '@/core/media';

export type EditOperationType =
  | 'trim-start' | 'trim-end' | 'shorten' | 'split' | 'reorder' | 'remove' | 'duplicate'
  | 'replace-asset' | 'add-broll' | 'increase-motion' | 'reduce-motion' | 'change-transition'
  | 'insert-pattern-interrupt' | 'move-cta' | 'adjust-subtitle-timing' | 'adjust-audio-cue'
  | 'normalize-scene-duration' | 'keep';
export type EditOperationStatus = 'proposed' | 'disabled' | 'applied' | 'skipped' | 'rejected';
export type EditOperationTarget = { readonly sceneId: string | null; readonly range?: { readonly startMs: number; readonly endMs: number } };
export type EditRequestedBy = 'director' | 'editing-engine' | 'user';
export interface EditOperation {
  readonly id: string; readonly sourceDecisionId: string | null; readonly projectId: string;
  readonly sceneId: string | null; readonly type: EditOperationType; readonly priority: DirectorRecommendationPriority;
  readonly reason: string; readonly evidence: readonly string[]; readonly expectedImpact: number;
  readonly confidence: number; readonly automaticallyApplicable: boolean; readonly requestedBy: EditRequestedBy;
  readonly parameters: Readonly<Record<string, string | number | boolean | readonly string[] | null>>;
  readonly dependencies: readonly string[]; readonly conflicts: readonly string[]; readonly status: EditOperationStatus; readonly createdAt: string;
}
export interface EditOperationConflict { readonly id: string; readonly operationIds: readonly string[]; readonly sceneId: string | null; readonly severity: 'warning' | 'critical'; readonly reason: string; readonly resolved: boolean; }
export interface EditPlanDiagnostics { readonly unsupportedDecisionIds: readonly string[]; readonly warnings: readonly string[]; readonly conflicts: readonly EditOperationConflict[]; }
export interface EditPlanSummary { readonly operationCount: number; readonly automaticCount: number; readonly manualCount: number; readonly disabledCount: number; readonly estimatedDurationDeltaMs: number; readonly estimatedScoreImpact: number; }
export interface EditPlan { readonly id: string; readonly version: '1.0'; readonly projectId: string; readonly sourceReportGeneratedAt: string; readonly sourceRevisionId: string; readonly createdAt: string; readonly operations: readonly EditOperation[]; readonly summary: EditPlanSummary; readonly diagnostics: EditPlanDiagnostics; }
export interface TimelineSnapshot { readonly projectId: string; readonly revisionId: string; readonly manifestFingerprint: string; readonly fingerprintVersion: number; readonly parentRevisionId: string | null; readonly createdAt: string; readonly manifest: RenderManifest; }
export interface TimelineRevision { readonly id: string; readonly projectId: string; readonly parentRevisionId: string | null; readonly createdAt: string; readonly operationIds: readonly string[]; readonly snapshot: TimelineSnapshot; }
export interface SceneChangeSummary { readonly sceneId: string; readonly changes: readonly string[]; readonly beforeStartMs: number | null; readonly afterStartMs: number | null; readonly beforeDurationMs: number | null; readonly afterDurationMs: number | null; }
export interface EditPreview { readonly id: string; readonly projectId: string; readonly planId: string; readonly sourceRevisionId: string; readonly createdAt: string; readonly originalDurationMs: number; readonly proposedDurationMs: number; readonly durationDeltaMs: number; readonly affectedSceneCount: number; readonly operationCount: number; readonly warnings: readonly string[]; readonly conflicts: readonly EditOperationConflict[]; readonly beforeSceneOrder: readonly string[]; readonly afterSceneOrder: readonly string[]; readonly sceneChanges: readonly SceneChangeSummary[]; readonly scoreImpactEstimate: number; readonly renderInvalidationEstimate: number; readonly reusableSegmentCountEstimate: number; readonly rerenderSceneIds: readonly string[]; readonly proposedSnapshot: TimelineSnapshot; }
export interface EditApplyResult { readonly projectId: string; readonly appliedOperationIds: readonly string[]; readonly skippedOperationIds: readonly string[]; readonly previousRevision: TimelineRevision; readonly revision: TimelineRevision; readonly durationDeltaMs: number; }
export interface EditingSceneInput { readonly scene: MediaScene; readonly subtitles: SubtitleTimeline; readonly audio: AudioTimeline; }
export interface EditingProjectInput { readonly projectId: string; readonly manifest: RenderManifest; readonly directorReport: DirectorReport; readonly revisionId?: string; }
export interface EditingContext { readonly signal: AbortSignal; readonly now: string; }
export interface EditingEngineOptions { readonly minimumSceneDurationMs?: number; readonly maximumTrimPercent?: number; readonly historyLimit?: number; readonly automaticConfidenceThreshold?: number; }
export interface EditingEngine { compile(input: EditingProjectInput, signal?: AbortSignal): EditPlan; preview(plan: EditPlan, snapshot: TimelineSnapshot, signal?: AbortSignal): EditPreview; apply(plan: EditPlan, preview: EditPreview, snapshot: TimelineSnapshot, approvedOperationIds?: readonly string[]): EditApplyResult; }
export interface TrimProposal { readonly originalStartMs: number; readonly originalEndMs: number; readonly proposedStartMs: number; readonly proposedEndMs: number; readonly removedDurationMs: number; readonly safetyMarginMs: number; readonly blockingReasons: readonly string[]; readonly confidence: number; }
export interface SplitProposal { readonly sceneId: string; readonly splitAtMs: number | null; readonly childSceneIds: readonly string[]; readonly blockingReasons: readonly string[]; readonly confidence: number; }
export interface BrollPlan { readonly targetSceneId: string; readonly startMs: number; readonly endMs: number; readonly intent: string; readonly searchQuery: string; readonly preferredAssetTypes: readonly ('video' | 'image' | 'broll')[]; readonly motionRecommendation: string; readonly visualStyle: string; readonly avoidTerms: readonly string[]; readonly mode: 'overlay' | 'replacement'; readonly confidence: number; readonly expectedImpact: number; }
export interface TransitionPlan { readonly fromSceneId: string; readonly toSceneId: string; readonly type: TransitionType; readonly durationMs: number; readonly confidence: number; }
