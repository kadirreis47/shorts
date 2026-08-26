import { planVisualQueries } from '@/lib/api';
import {
  isSceneVisualBindingCurrent,
  isVisualQueryPlanCurrent,
  normalizeVisualIntelligencePlanningState,
  type SceneVisualBrief,
  type VisualIntelligencePlanningState,
  type VisualQueryPlan,
} from '@/core/visual-intelligence';
import type { Scene } from '@/lib/types';
import type { VisualQueryPlannerRequest } from '../../supabase/functions/_shared/visual-query-planner';

export interface VisualPlannerLease {
  readonly ownerRevision: string;
  readonly projectId: string;
  readonly scenes: readonly Scene[];
  readonly planning?: VisualIntelligencePlanningState;
}

export interface VisualPlannerController {
  request(request: VisualQueryPlannerRequest): Promise<boolean>;
}

/**
 * Small non-UI integration point for a later Studio action. A completion is
 * installed only if its owner/project/scene bindings are still current and it
 * remains the newest request.
 */
export function createVisualQueryPlannerController(input: {
  readLease: () => VisualPlannerLease;
  writePlanning: (planning: VisualIntelligencePlanningState) => void;
  request?: (request: VisualQueryPlannerRequest) => ReturnType<typeof planVisualQueries>;
}): VisualPlannerController {
  let generation = 0;
  return {
    async request(request) {
      const lease = input.readLease();
      const requestId = ++generation;
      const result = await (input.request ?? planVisualQueries)(request);
      if (requestId !== generation) return false;
      const current = input.readLease();
      if (current.ownerRevision !== lease.ownerRevision || current.projectId !== lease.projectId) return false;
      const planning = normalizeVisualIntelligencePlanningState(result.planning);
      if (!planning || !isPlanningCurrent(planning, request, current.scenes)) return false;
      input.writePlanning(mergeVisualIntelligencePlanning(current.planning, planning));
      return true;
    },
  };
}

function isPlanningCurrent(
  planning: VisualIntelligencePlanningState,
  request: VisualQueryPlannerRequest,
  scenes: readonly Scene[],
): boolean {
  if (planning.briefs.length !== request.scenes.length || planning.queryPlans.length !== request.scenes.length) return false;
  const plansById = new Map(planning.queryPlans.map((plan) => [plan.sceneBinding.sceneId, plan]));
  return request.scenes.every((requested) => {
    const brief = planning.briefs.find((item) => sameBinding(item, requested.sceneBinding));
    const plan = plansById.get(requested.sceneBinding.sceneId);
    return Boolean(brief && plan
      && sameBinding(plan, requested.sceneBinding)
      && isSceneVisualBindingCurrent(requested.sceneBinding, scenes)
      && isVisualQueryPlanCurrent(plan, brief, scenes));
  });
}

/** Replaces only returned scene bindings; other current plans survive a one-scene refresh. */
export function mergeVisualIntelligencePlanning(
  current: VisualIntelligencePlanningState | undefined,
  incoming: VisualIntelligencePlanningState,
): VisualIntelligencePlanningState {
  const replaced = new Set(incoming.briefs.map((brief) => brief.sceneBinding.sceneId));
  return normalizeVisualIntelligencePlanningState({
    version: 1,
    briefs: [...(current?.briefs ?? []).filter((brief) => !replaced.has(brief.sceneBinding.sceneId)), ...incoming.briefs],
    queryPlans: [...(current?.queryPlans ?? []).filter((plan) => !replaced.has(plan.sceneBinding.sceneId)), ...incoming.queryPlans],
  })!;
}

function sameBinding(
  value: Pick<SceneVisualBrief | VisualQueryPlan, 'sceneBinding'>,
  expected: VisualQueryPlannerRequest['scenes'][number]['sceneBinding'],
): boolean {
  const binding = value.sceneBinding;
  return binding.sceneId === expected.sceneId
    && binding.sceneIndex === expected.sceneIndex
    && binding.sceneTextFingerprint === expected.sceneTextFingerprint;
}
