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
  readonly firstVisualChangeMs: number | null;
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
