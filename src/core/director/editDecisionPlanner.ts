import { normalizeScore } from './scoring';
import type { DirectorHookIntelligence, DirectorInput, DirectorSceneRanking, DirectorSceneScore, EditDecisionAction, EditDecisionPlan, EditDecisionPlanItem } from './types';

export function createEditDecisionPlan(input: DirectorInput, scores: readonly DirectorSceneScore[], ranking: DirectorSceneRanking,
  hook: DirectorHookIntelligence): EditDecisionPlan {
  const candidates: EditDecisionPlanItem[] = [];
  if (hook.overallHookScore < 60 && hook.sceneId) candidates.push(decision(hook.sceneId, 'rewrite-hook', 'critical', 'Hook score is below target.', hook.evidence, 14, 0, false));
  for (const score of scores) {
    const scene = input.scenes.find((item) => item.id === score.sceneId);
    if (!scene) continue;
    if (score.dimensions.pacing.score < 35) candidates.push(decision(scene.id, 'split', 'high', 'Scene pacing is critically low.', score.evidence, 10, -500, false));
    else if (score.dimensions.pacing.score < 52) candidates.push(decision(scene.id, 'shorten', 'medium', 'Scene pacing is below target.', score.evidence, 7, -Math.round(scene.durationMs * 0.25), true));
    if (score.dimensions.visualPotential.score < 45) candidates.push(decision(scene.id, 'add-broll', 'high', 'Visual potential is low.', score.evidence, 9, 0, false));
    if (score.dimensions.motion.score < 45) candidates.push(decision(scene.id, 'increase-motion', 'medium', 'Motion score is low.', score.evidence, 6, 0, true));
    if (score.dimensions.clarity.score < 45) candidates.push(decision(scene.id, 'simplify-copy', 'high', 'Clarity score is low.', score.evidence, 11, -300, false));
    if (ranking.reorderCandidates.includes(scene.id)) candidates.push(decision(scene.id, 'reorder', 'medium', 'Continuity suggests a different scene order.', score.evidence, 6, 0, false));
  }
  return { decisions: resolveDecisionConflicts(candidates) };
}

export function resolveDecisionConflicts(items: readonly EditDecisionPlanItem[]): EditDecisionPlanItem[] {
  const unique = new Map<string, EditDecisionPlanItem>();
  items.forEach((item) => unique.set(`${item.sceneId}|${item.action}`, item));
  const values = [...unique.values()];
  return values.map((item) => {
    const conflicts = values.filter((other) => other.sceneId === item.sceneId && conflictsWith(item.action, other.action)).map((other) => other.id).sort();
    return { ...item, conflicts };
  }).sort((a, b) => priority(b.priority) - priority(a.priority) || (a.sceneId ?? '').localeCompare(b.sceneId ?? '') || a.action.localeCompare(b.action));
}

function decision(sceneId: string | null, action: EditDecisionAction, priorityValue: EditDecisionPlanItem['priority'], reason: string,
  evidence: readonly string[], impact: number, delta: number, automatic: boolean): EditDecisionPlanItem {
  const id = `edit-${hash(`${sceneId}|${action}`)}`;
  return { id, sceneId, action, priority: priorityValue, reason, evidence: [...evidence].slice(0, 5), expectedScoreImpact: normalizeScore(impact),
    estimatedDurationDeltaMs: delta, dependencies: [], conflicts: [], confidence: 82, automaticallyApplicable: automatic };
}
function conflictsWith(a: EditDecisionAction, b: EditDecisionAction): boolean {
  return a !== b && ((a === 'remove-scene' && ['shorten', 'split', 'reorder'].includes(b)) ||
    (b === 'remove-scene' && ['shorten', 'split', 'reorder'].includes(a)) ||
    (a === 'increase-motion' && b === 'reduce-motion') || (a === 'reduce-motion' && b === 'increase-motion'));
}
function priority(value: EditDecisionPlanItem['priority']): number { return { critical: 4, high: 3, medium: 2, low: 1 }[value]; }
function hash(value: string): string { let result = 2166136261; for (const character of value) result = Math.imul(result ^ character.charCodeAt(0), 16777619); return (result >>> 0).toString(36); }
