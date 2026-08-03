import { average, throwIfDirectorAborted } from './analyzerUtils';
import {
  DIRECTOR_SCORE_DIMENSIONS,
  deduplicateRecommendations,
  dimensionScore,
  normalizeScore,
  normalizeWeights,
} from './scoring';
import {
  createHookAnalyzer,
  createPaceAnalyzer,
  createRetentionHeuristicAnalyzer,
  createVisualPotentialAnalyzer,
} from './analyzers';
import type {
  DirectorAnalyzerDiagnostic,
  DirectorDecision,
  DirectorDimensionScore,
  DirectorEngine,
  DirectorEngineOptions,
  DirectorInput,
  DirectorRecommendation,
  DirectorSceneInput,
  DirectorSceneScore,
  DirectorScoreDimension,
} from './types';

export const DIRECTOR_DETERMINISTIC_VERSION = 'director-heuristic-1.0.0';

export function createDirectorEngine(options: DirectorEngineOptions = {}): DirectorEngine {
  const analyzers = options.analyzers ?? [
    createHookAnalyzer(),
    createPaceAnalyzer(),
    createVisualPotentialAnalyzer(),
    createRetentionHeuristicAnalyzer(),
  ];
  const weights = normalizeWeights(options.weights);
  const weakThreshold = normalizeScore(options.weakSceneThreshold ?? 48);
  const strongThreshold = normalizeScore(options.strongSceneThreshold ?? 76);
  const deterministicVersion = options.deterministicVersion ?? DIRECTOR_DETERMINISTIC_VERSION;

  return {
    async analyze(input, analysisOptions = {}) {
      const controller = new AbortController();
      const signal = analysisOptions.signal ?? controller.signal;
      throwIfDirectorAborted(signal);
      const accumulators = new Map<string, SceneAccumulator>(
        input.scenes.map((scene) => [scene.id, createBaseAccumulator(scene, input.scenes)]),
      );
      const diagnostics: DirectorAnalyzerDiagnostic[] = [];
      const recommendations: DirectorRecommendation[] = [];

      for (const analyzer of analyzers) {
        throwIfDirectorAborted(signal);
        let diagnostic: DirectorAnalyzerDiagnostic;
        try {
          const result = await analyzer.analyze(input, {
            signal,
            scores: currentScores(accumulators),
          });
          for (const sceneResult of result.sceneResults) {
            const accumulator = accumulators.get(sceneResult.sceneId);
            if (!accumulator) continue;
            for (const dimension of sceneResult.dimensions) {
              accumulator.dimensions.set(dimension.dimension, [dimension]);
            }
            accumulator.evidence.push(...sceneResult.evidence);
          }
          recommendations.push(...result.recommendations);
          diagnostic = {
            analyzerId: analyzer.id,
            status: 'completed',
            message: 'Analyzer completed successfully.',
            affectedSceneIds: result.sceneResults.map((item) => item.sceneId).sort(),
          };
        } catch (error) {
          if (isAbortError(error) || signal.aborted) throw error;
          diagnostic = {
            analyzerId: analyzer.id,
            status: 'failed',
            message: error instanceof Error ? error.message : 'Analyzer failed with an unknown error.',
            affectedSceneIds: [],
          };
        }
        diagnostics.push(diagnostic);
        await analysisOptions.onAnalyzerCompleted?.(diagnostic);
      }

      throwIfDirectorAborted(signal);
      const uniqueRecommendations = deduplicateRecommendations(recommendations);
      const sceneScores = input.scenes.map((scene) => buildSceneScore(
        scene,
        accumulators.get(scene.id) ?? createBaseAccumulator(scene, input.scenes),
        uniqueRecommendations,
        weights,
      ));
      const ranked = [...sceneScores].sort((left, right) =>
        left.overall - right.overall || left.sceneIndex - right.sceneIndex);
      const weakestSceneIds = ranked.filter((scene) => scene.overall <= weakThreshold)
        .slice(0, 3).map((scene) => scene.sceneId);
      const strongestSceneIds = [...ranked].reverse().filter((scene) => scene.overall >= strongThreshold)
        .slice(0, 3).map((scene) => scene.sceneId);

      return {
        projectId: input.projectId,
        generatedAt: input.createdAt,
        overallScore: normalizeScore(average(sceneScores.map((scene) => scene.overall), 0)),
        hookScore: aggregateDimension(sceneScores, 'hook'),
        pacingScore: aggregateDimension(sceneScores, 'pacing'),
        visualScore: aggregateDimension(sceneScores, 'visualPotential'),
        retentionScore: aggregateDimension(sceneScores, 'retention'),
        sceneScores,
        weakestSceneIds,
        strongestSceneIds,
        highPriorityRecommendations: uniqueRecommendations.filter((item) =>
          item.priority === 'critical' || item.priority === 'high'),
        decisions: createDecisions(sceneScores),
        analyzerDiagnostics: diagnostics,
        deterministicVersion,
      };
    },
  };
}

interface SceneAccumulator {
  dimensions: Map<DirectorScoreDimension, DirectorDimensionScore[]>;
  evidence: string[];
}

function createBaseAccumulator(scene: DirectorSceneInput, scenes: readonly DirectorSceneInput[]): SceneAccumulator {
  const previous = scenes[scene.index - 1];
  const textWords = scene.text.trim().split(/\s+/).filter(Boolean).length;
  const clarity = textWords >= 4 && textWords <= 28 ? 78 : textWords > 45 ? 42 : 62;
  const emotion = 42 + scene.intensity * 45 + (/[!?]/.test(scene.text) ? 8 : 0);
  const continuity = previous
    ? 75 - (previous.visualPrompt === scene.visualPrompt ? 12 : 0) - (Math.abs(previous.intensity - scene.intensity) > 0.7 ? 10 : 0)
    : 80;
  const base: Record<DirectorScoreDimension, DirectorDimensionScore> = {
    hook: dimensionScore('hook', scene.role === 'hook' ? 45 : 60, 45, ['Base role heuristic.']),
    clarity: dimensionScore('clarity', clarity, 72, ['Text-length clarity heuristic.']),
    emotion: dimensionScore('emotion', emotion, 68, ['Intensity and punctuation heuristic.']),
    pacing: dimensionScore('pacing', 55, 40, ['Awaiting pace analyzer.']),
    visualPotential: dimensionScore('visualPotential', 50, 40, ['Awaiting visual analyzer.']),
    motion: dimensionScore('motion', 50, 40, ['Awaiting motion analysis.']),
    retention: dimensionScore('retention', 50, 35, ['Awaiting retention heuristic.']),
    continuity: dimensionScore('continuity', continuity, 65, ['Adjacent-scene continuity heuristic.']),
  };
  return {
    dimensions: new Map(DIRECTOR_SCORE_DIMENSIONS.map((dimension) => [dimension, [base[dimension]]])),
    evidence: [],
  };
}

function currentScores(accumulators: ReadonlyMap<string, SceneAccumulator>) {
  return new Map([...accumulators].map(([sceneId, accumulator]) => [
    sceneId,
    new Map(DIRECTOR_SCORE_DIMENSIONS.map((dimension) => [
      dimension,
      normalizeScore(average(accumulator.dimensions.get(dimension)?.map((item) => item.score) ?? [])),
    ])),
  ]));
}

function buildSceneScore(
  scene: DirectorSceneInput,
  accumulator: SceneAccumulator,
  recommendations: readonly DirectorRecommendation[],
  weights: Readonly<Record<DirectorScoreDimension, number>>,
): DirectorSceneScore {
  const dimensions = Object.fromEntries(DIRECTOR_SCORE_DIMENSIONS.map((dimension) => {
    const values = accumulator.dimensions.get(dimension) ?? [];
    return [dimension, dimensionScore(
      dimension,
      average(values.map((item) => item.score)),
      average(values.map((item) => item.confidence)),
      values.flatMap((item) => item.reasons),
    )];
  })) as Record<DirectorScoreDimension, DirectorDimensionScore>;
  const overall = normalizeScore(DIRECTOR_SCORE_DIMENSIONS.reduce(
    (total, dimension) => total + dimensions[dimension].score * weights[dimension], 0));
  const sceneRecommendations = recommendations.filter((item) => item.sceneId === scene.id);
  return {
    sceneId: scene.id,
    sceneIndex: scene.index,
    dimensions,
    overall,
    strengths: DIRECTOR_SCORE_DIMENSIONS.filter((dimension) => dimensions[dimension].score >= 75),
    weaknesses: DIRECTOR_SCORE_DIMENSIONS.filter((dimension) => dimensions[dimension].score < 50),
    recommendations: sceneRecommendations,
    confidence: normalizeScore(average(DIRECTOR_SCORE_DIMENSIONS.map((dimension) => dimensions[dimension].confidence))),
    evidence: [...new Set([...accumulator.evidence, ...DIRECTOR_SCORE_DIMENSIONS.flatMap(
      (dimension) => dimensions[dimension].reasons)])].sort(),
  };
}

function aggregateDimension(sceneScores: readonly DirectorSceneScore[], dimension: DirectorScoreDimension): number {
  return normalizeScore(average(sceneScores.map((scene) => scene.dimensions[dimension].score), 0));
}

function createDecisions(sceneScores: readonly DirectorSceneScore[]): DirectorDecision[] {
  return sceneScores.map((scene) => {
    const pacing = scene.dimensions.pacing.score;
    const visual = scene.dimensions.visualPotential.score;
    const action: DirectorDecision['action'] = pacing < 35 ? 'split' : pacing < 50 ? 'shorten' : visual < 50 ? 'enhance' : 'keep';
    return {
      sceneId: scene.sceneId,
      action,
      reason: action === 'keep' ? 'Scene meets the current heuristic quality thresholds.' : `Lowest actionable dimensions: pacing ${pacing}, visual ${visual}.`,
      confidence: scene.confidence,
    };
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}
