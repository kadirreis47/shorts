import type { CameraMotion, MediaAssetType, SceneRole, TransitionType } from '@/core/media';

export type DirectorScoreDimension =
  | 'hook'
  | 'clarity'
  | 'emotion'
  | 'pacing'
  | 'visualPotential'
  | 'motion'
  | 'retention'
  | 'continuity';

export type DirectorRecommendationCategory =
  | 'hook'
  | 'clarity'
  | 'pacing'
  | 'visual'
  | 'motion'
  | 'retention'
  | 'continuity'
  | 'cta';

export type DirectorRecommendationPriority = 'low' | 'medium' | 'high' | 'critical';

export interface DirectorSceneInput {
  readonly id: string;
  readonly index: number;
  readonly role: SceneRole;
  readonly text: string;
  readonly visualPrompt: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly durationMs: number;
  readonly intensity: number;
  readonly cameraMotion: CameraMotion;
  readonly transition: TransitionType;
  readonly assetTypes: readonly MediaAssetType[];
  readonly assetIds?: readonly string[];
  readonly firstVisualChangeMs: number | null;
  readonly firstCutMs?: number | null;
  readonly firstSubtitleMs?: number | null;
  readonly firstAudioCueMs?: number | null;
  readonly audioSignals?: readonly ('music' | 'sfx' | 'voice')[];
}

export type DirectorEmotion =
  | 'neutral' | 'curiosity' | 'excitement' | 'tension' | 'urgency'
  | 'surprise' | 'sadness' | 'inspiration' | 'trust' | 'fear' | 'joy';

export interface DirectorEmotionAnalysis {
  readonly sceneId: string;
  readonly primaryEmotion: DirectorEmotion;
  readonly secondaryEmotion: DirectorEmotion;
  readonly emotionIntensity: number;
  readonly emotionalClarity: number;
  readonly emotionTransitionQuality: number;
  readonly evidence: readonly string[];
  readonly confidence: number;
  readonly recommendations: readonly DirectorRecommendation[];
}

export interface DirectorClarityAnalysis {
  readonly sceneId: string;
  readonly clarityScore: number;
  readonly informationDensity: number;
  readonly speechPaceScore: number;
  readonly estimatedWordsPerMinute: number;
  readonly overloadRisk: number;
  readonly evidence: readonly string[];
  readonly recommendations: readonly DirectorRecommendation[];
}

export interface DirectorContinuityAnalysis {
  readonly continuityScore: number;
  readonly narrativeFlowScore: number;
  readonly visualContinuityScore: number;
  readonly transitionQualityScore: number;
  readonly discontinuitySceneIds: readonly string[];
  readonly evidence: readonly string[];
  readonly recommendations: readonly DirectorRecommendation[];
}

export interface DirectorHookIntelligence {
  readonly sceneId: string | null;
  readonly copyScore: number;
  readonly curiosityScore: number;
  readonly urgencyScore: number;
  readonly visualInterruptScore: number;
  readonly specificityScore: number;
  readonly credibilityScore: number;
  readonly firstThreeSecondsScore: number;
  readonly overallHookScore: number;
  readonly antiPatterns: readonly string[];
  readonly evidence: readonly string[];
  readonly recommendations: readonly DirectorRecommendation[];
}

export type DirectorRankTier = 'elite' | 'strong' | 'average' | 'weak' | 'critical';
export interface DirectorSceneRank {
  readonly sceneId: string;
  readonly absoluteRank: number;
  readonly percentile: number;
  readonly rankTier: DirectorRankTier;
  readonly replacementPriority: number;
  readonly strongestDimensions: readonly DirectorScoreDimension[];
  readonly weakestDimensions: readonly DirectorScoreDimension[];
  readonly confidence: number;
}
export interface DirectorSceneRanking {
  readonly scenes: readonly DirectorSceneRank[];
  readonly strongestSceneIds: readonly string[];
  readonly weakestSceneIds: readonly string[];
  readonly replaceCandidates: readonly string[];
  readonly shortenCandidates: readonly string[];
  readonly splitCandidates: readonly string[];
  readonly reorderCandidates: readonly string[];
}

export type RetentionRiskLevel = 'low' | 'medium' | 'high' | 'critical';
export interface RetentionRiskSegment {
  readonly startMs: number;
  readonly endMs: number;
  readonly sceneIds: readonly string[];
  readonly riskScore: number;
  readonly riskLevel: RetentionRiskLevel;
  readonly causes: readonly string[];
  readonly evidence: readonly string[];
  readonly recommendedInterventions: readonly string[];
}

export type EditDecisionAction =
  | 'keep' | 'shorten' | 'split' | 'reorder' | 'replace-asset' | 'add-broll'
  | 'increase-motion' | 'reduce-motion' | 'change-transition' | 'rewrite-hook'
  | 'simplify-copy' | 'add-pattern-interrupt' | 'move-cta' | 'remove-scene';
export interface EditDecisionPlanItem {
  readonly id: string;
  readonly sceneId: string | null;
  readonly action: EditDecisionAction;
  readonly priority: DirectorRecommendationPriority;
  readonly reason: string;
  readonly evidence: readonly string[];
  readonly expectedScoreImpact: number;
  readonly estimatedDurationDeltaMs: number;
  readonly dependencies: readonly string[];
  readonly conflicts: readonly string[];
  readonly confidence: number;
  readonly automaticallyApplicable: boolean;
}
export interface EditDecisionPlan { readonly decisions: readonly EditDecisionPlanItem[]; }

export interface DirectorReportMoment {
  readonly sceneId: string;
  readonly score: number;
  readonly summary: string;
}

export interface DirectorInput {
  readonly projectId: string;
  readonly createdAt: string;
  readonly durationMs: number;
  readonly scenes: readonly DirectorSceneInput[];
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface DirectorDimensionScore {
  readonly dimension: DirectorScoreDimension;
  readonly score: number;
  readonly confidence: number;
  readonly reasons: readonly string[];
}

export interface DirectorRecommendation {
  readonly id: string;
  readonly sceneId: string | null;
  readonly category: DirectorRecommendationCategory;
  readonly priority: DirectorRecommendationPriority;
  readonly title: string;
  readonly description: string;
  readonly expectedImpact: string;
  readonly suggestedAction: string;
  readonly sourceAnalyzer: string;
  readonly confidence: number;
}

export interface DirectorDecision {
  readonly sceneId: string | null;
  readonly action: 'keep' | 'cut' | 'shorten' | 'split' | 'enhance' | 'reorder';
  readonly reason: string;
  readonly confidence: number;
}

export interface DirectorSceneScore {
  readonly sceneId: string;
  readonly sceneIndex: number;
  readonly dimensions: Readonly<Record<DirectorScoreDimension, DirectorDimensionScore>>;
  readonly overall: number;
  readonly strengths: readonly DirectorScoreDimension[];
  readonly weaknesses: readonly DirectorScoreDimension[];
  readonly recommendations: readonly DirectorRecommendation[];
  readonly confidence: number;
  readonly evidence: readonly string[];
}

export interface DirectorAnalyzerDiagnostic {
  readonly analyzerId: string;
  readonly status: 'completed' | 'failed';
  readonly message: string;
  readonly affectedSceneIds: readonly string[];
}

export interface DirectorReport {
  readonly projectId: string;
  readonly generatedAt: string;
  readonly manifestBindingVersion: '1.0' | null;
  readonly analyzedManifestFingerprint: string | null;
  readonly manifestFingerprintVersion: number | null;
  readonly overallScore: number;
  readonly hookScore: number;
  readonly pacingScore: number;
  readonly visualScore: number;
  readonly retentionScore: number;
  readonly sceneScores: readonly DirectorSceneScore[];
  readonly weakestSceneIds: readonly string[];
  readonly strongestSceneIds: readonly string[];
  readonly highPriorityRecommendations: readonly DirectorRecommendation[];
  readonly decisions: readonly DirectorDecision[];
  readonly analyzerDiagnostics: readonly DirectorAnalyzerDiagnostic[];
  readonly deterministicVersion: string;
  readonly reportVersion: '2.0';
  readonly executiveSummary: string;
  readonly dimensionScores: Readonly<Record<DirectorScoreDimension, number>>;
  readonly hookIntelligence: DirectorHookIntelligence;
  readonly emotionalArc: readonly DirectorEmotionAnalysis[];
  readonly clarityAnalysis: readonly DirectorClarityAnalysis[];
  readonly pacingAnalysis: { readonly score: number; readonly slowSceneIds: readonly string[] };
  readonly visualAnalysis: { readonly score: number; readonly lowPotentialSceneIds: readonly string[] };
  readonly continuityAnalysis: DirectorContinuityAnalysis;
  readonly retentionRiskMap: readonly RetentionRiskSegment[];
  readonly sceneRanking: DirectorSceneRanking;
  readonly editDecisionPlan: EditDecisionPlan;
  readonly strongestMoments: readonly DirectorReportMoment[];
  readonly weakestMoments: readonly DirectorReportMoment[];
  readonly criticalIssues: readonly string[];
  readonly quickWins: readonly DirectorRecommendation[];
  readonly highImpactRecommendations: readonly DirectorRecommendation[];
}

export interface DirectorAnalyzerSceneResult {
  readonly sceneId: string;
  readonly dimensions: readonly DirectorDimensionScore[];
  readonly evidence: readonly string[];
}

export interface DirectorAnalyzerResult {
  readonly analyzerId: string;
  readonly sceneResults: readonly DirectorAnalyzerSceneResult[];
  readonly recommendations: readonly DirectorRecommendation[];
}

export interface DirectorContext {
  readonly signal: AbortSignal;
  readonly scores: ReadonlyMap<string, ReadonlyMap<DirectorScoreDimension, number>>;
}

export interface DirectorAnalyzer {
  readonly id: string;
  analyze(input: DirectorInput, context: DirectorContext): Promise<DirectorAnalyzerResult>;
}

export type DirectorScoreWeights = Readonly<Record<DirectorScoreDimension, number>>;

export interface DirectorAnalysisOptions {
  readonly signal?: AbortSignal;
  readonly onAnalyzerCompleted?: (diagnostic: DirectorAnalyzerDiagnostic) => void | Promise<void>;
}

export interface DirectorEngineOptions {
  readonly analyzers?: readonly DirectorAnalyzer[];
  readonly weights?: Partial<DirectorScoreWeights>;
  readonly weakSceneThreshold?: number;
  readonly strongSceneThreshold?: number;
  readonly deterministicVersion?: string;
}

export interface DirectorEngine {
  analyze(input: DirectorInput, options?: DirectorAnalysisOptions): Promise<DirectorReport>;
}
