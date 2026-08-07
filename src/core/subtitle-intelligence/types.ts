import type { TimelineRevision, TimelineSnapshot } from '@/core/editing';
import type { RenderManifest, SubtitleAnimation, SubtitleCue } from '@/core/media';

export type SubtitleMetric = 'timing' | 'typography' | 'readability' | 'density' | 'highlight' | 'animation' | 'safeArea';
export type SubtitleOperationType = 'split-subtitle' | 'merge-subtitle' | 'resize' | 'reposition' | 'restyle' | 'highlight-keyword' | 'timing-adjust' | 'animation' | 'stroke' | 'shadow' | 'line-spacing';
export type SubtitleOperationSupport = 'implemented' | 'planned-only' | 'unsupported';
export type SubtitleOperationStatus = 'applied' | 'planned-only' | 'skipped' | 'rejected';
export type CaptionStyleProfile = 'shorts' | 'tiktok' | 'reels' | 'documentary' | 'podcast' | 'cinematic' | 'minimal';
export type SubtitlePlannedAnimation = SubtitleAnimation | 'fade' | 'slide' | 'scale' | 'word-reveal';

export interface SubtitleCapability { type: SubtitleOperationType; support: SubtitleOperationSupport; renderEffect: boolean; diagnostic: string; supportedAnimations?: readonly SubtitlePlannedAnimation[]; }
export interface SubtitleEvidence { rule: string; value: number | string | boolean; threshold: string; explanation: string; }
export interface SubtitleCueAnalysis { cueId: string; sceneId: string; timing: number; typography: number; readability: number; density: number; safeArea: number; wordsPerMinute: number; screenCoverage: number; risks: readonly string[]; evidence: readonly SubtitleEvidence[]; }
export interface KeywordHighlight { cueId: string; wordId: string; text: string; category: 'number' | 'money' | 'percentage' | 'date' | 'question' | 'exclamation' | 'cta' | 'important'; score: number; reason: string; }
export interface SubtitleScores { overall: number; timing: number; typography: number; readability: number; density: number; highlight: number; animation: number; safeArea: number; }
export interface SubtitleOperation { id: string; cueId?: string; sceneId?: string; type: SubtitleOperationType; support: SubtitleOperationSupport; metric: SubtitleMetric; reason: string; parameters: Readonly<Record<string, string | number | boolean>>; expectedImpact: number; status: 'proposed' | 'disabled'; }
export interface SubtitleOperationResult { operationId: string; type: SubtitleOperationType; support: SubtitleOperationSupport; status: SubtitleOperationStatus; diagnostic: string; affectedCueIds: readonly string[]; }
export interface SubtitleIntelligencePlan { id: string; version: '1.0'; projectId: string; sourceRevisionId: string; sourceManifestFingerprint: string; createdAt: string; profile: CaptionStyleProfile; scores: SubtitleScores; cues: readonly SubtitleCueAnalysis[]; highlights: readonly KeywordHighlight[]; operations: readonly SubtitleOperation[]; }
export interface SubtitleIntelligencePreview { id: string; projectId: string; planId: string; sourceRevisionId: string; sourceManifestFingerprint: string; approvalSignature: string; approvedOperationIds: readonly string[]; operationResults: readonly SubtitleOperationResult[]; estimatedScore: number; affectedCueIds: readonly string[]; rerenderSceneIds: readonly string[]; warnings: readonly string[]; proposedSnapshot: TimelineSnapshot; }
export interface SubtitleIntelligenceResult { projectId: string; appliedOperationIds: readonly string[]; skippedOperationIds: readonly string[]; operationResults: readonly SubtitleOperationResult[]; previousRevision: TimelineRevision; revision: TimelineRevision; }
export interface SubtitleIntelligenceEngine { analyze(input: { manifest: RenderManifest; snapshot: TimelineSnapshot; profile?: CaptionStyleProfile }, signal?: AbortSignal): SubtitleIntelligencePlan; preview(plan: SubtitleIntelligencePlan, snapshot: TimelineSnapshot, approvedIds: readonly string[], signal?: AbortSignal): SubtitleIntelligencePreview; apply(plan: SubtitleIntelligencePlan, preview: SubtitleIntelligencePreview, snapshot: TimelineSnapshot, approvedIds: readonly string[]): SubtitleIntelligenceResult; }
export interface LineBreakOptions { maxCharactersPerLine: number; maxWordsPerCue: number; maxDurationMs: number; }
export interface LineBreakResult { cues: readonly SubtitleCue[]; diagnostics: readonly string[]; }
