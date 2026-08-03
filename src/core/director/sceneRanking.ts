import { normalizeScore } from './scoring';
import type { DirectorSceneRanking, DirectorSceneScore, DirectorScoreDimension } from './types';

export function rankDirectorScenes(scores: readonly DirectorSceneScore[]): DirectorSceneRanking {
  const sorted = [...scores].sort((a, b) => b.overall - a.overall || a.sceneIndex - b.sceneIndex || a.sceneId.localeCompare(b.sceneId));
  const scenes = sorted.map((scene, index) => ({
    sceneId: scene.sceneId,
    absoluteRank: index + 1,
    percentile: normalizeScore(scores.length === 1 ? 100 : (scores.length - index - 1) / (scores.length - 1) * 100),
    rankTier: tier(scene.overall),
    replacementPriority: normalizeScore(100 - scene.overall),
    strongestDimensions: pickDimensions(scene, true),
    weakestDimensions: pickDimensions(scene, false),
    confidence: scene.confidence,
  }));
  const weak = scenes.filter((scene) => scene.rankTier === 'weak' || scene.rankTier === 'critical');
  return {
    scenes,
    strongestSceneIds: scenes.slice(0, 3).map((scene) => scene.sceneId),
    weakestSceneIds: [...scenes].reverse().slice(0, 3).map((scene) => scene.sceneId),
    replaceCandidates: weak.filter((scene) => scene.weakestDimensions.includes('visualPotential')).map((scene) => scene.sceneId),
    shortenCandidates: weak.filter((scene) => scene.weakestDimensions.includes('pacing')).map((scene) => scene.sceneId),
    splitCandidates: scores.filter((scene) => scene.dimensions.pacing.score < 35).map((scene) => scene.sceneId),
    reorderCandidates: weak.filter((scene) => scene.weakestDimensions.includes('continuity')).map((scene) => scene.sceneId),
  };
}

function tier(score: number): 'elite' | 'strong' | 'average' | 'weak' | 'critical' {
  return score >= 85 ? 'elite' : score >= 72 ? 'strong' : score >= 55 ? 'average' : score >= 38 ? 'weak' : 'critical';
}
function pickDimensions(scene: DirectorSceneScore, strongest: boolean): DirectorScoreDimension[] {
  return Object.values(scene.dimensions).sort((a, b) => strongest ? b.score - a.score : a.score - b.score)
    .slice(0, 2).map((item) => item.dimension);
}
