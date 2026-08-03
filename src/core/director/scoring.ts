import type {
  DirectorDimensionScore,
  DirectorRecommendation,
  DirectorRecommendationPriority,
  DirectorScoreDimension,
  DirectorScoreWeights,
} from './types';

export const DEFAULT_DIRECTOR_WEIGHTS: DirectorScoreWeights = Object.freeze({
  hook: 0.18,
  clarity: 0.12,
  emotion: 0.1,
  pacing: 0.16,
  visualPotential: 0.12,
  motion: 0.08,
  retention: 0.18,
  continuity: 0.06,
});

export const DIRECTOR_SCORE_DIMENSIONS: readonly DirectorScoreDimension[] = Object.freeze([
  'hook', 'clarity', 'emotion', 'pacing', 'visualPotential', 'motion', 'retention', 'continuity',
]);

export function normalizeScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.min(100, Math.max(0, value)) * 100) / 100;
}

export function dimensionScore(
  dimension: DirectorScoreDimension,
  score: number,
  confidence: number,
  reasons: readonly string[],
): DirectorDimensionScore {
  return {
    dimension,
    score: normalizeScore(score),
    confidence: normalizeScore(confidence),
    reasons: [...reasons],
  };
}

export function normalizeWeights(custom: Partial<DirectorScoreWeights> = {}): DirectorScoreWeights {
  const merged = Object.fromEntries(
    DIRECTOR_SCORE_DIMENSIONS.map((dimension) => [
      dimension,
      Math.max(0, custom[dimension] ?? DEFAULT_DIRECTOR_WEIGHTS[dimension]),
    ]),
  ) as Record<DirectorScoreDimension, number>;
  const total = Object.values(merged).reduce((sum, weight) => sum + weight, 0);
  if (total === 0) return DEFAULT_DIRECTOR_WEIGHTS;
  return Object.freeze(Object.fromEntries(
    DIRECTOR_SCORE_DIMENSIONS.map((dimension) => [dimension, merged[dimension] / total]),
  ) as Record<DirectorScoreDimension, number>);
}

export function recommendation(input: Omit<DirectorRecommendation, 'id' | 'confidence'> & {
  confidence: number;
}): DirectorRecommendation {
  const identity = [input.sourceAnalyzer, input.sceneId ?? 'global', input.category, input.suggestedAction]
    .join('|').toLowerCase();
  return {
    ...input,
    id: `director-${stableHash(identity)}`,
    confidence: normalizeScore(input.confidence),
  };
}

export function deduplicateRecommendations(
  recommendations: readonly DirectorRecommendation[],
): DirectorRecommendation[] {
  const priorityRank: Record<DirectorRecommendationPriority, number> = {
    critical: 4, high: 3, medium: 2, low: 1,
  };
  const unique = new Map<string, DirectorRecommendation>();
  for (const item of recommendations) {
    const key = `${item.sceneId ?? 'global'}|${item.category}|${item.suggestedAction.trim().toLowerCase()}`;
    const current = unique.get(key);
    if (!current || priorityRank[item.priority] > priorityRank[current.priority] ||
      (item.priority === current.priority && item.confidence > current.confidence)) {
      unique.set(key, item);
    }
  }
  return [...unique.values()].sort((left, right) =>
    priorityRank[right.priority] - priorityRank[left.priority] ||
    (left.sceneId ?? '').localeCompare(right.sceneId ?? '') ||
    left.id.localeCompare(right.id));
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  }
  return (hash >>> 0).toString(36);
}
