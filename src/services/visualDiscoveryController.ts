import {
  discoverVisualCandidates,
  isSceneVisualBindingCurrent,
  isVisualQueryPlanCurrent,
  type SceneVisualBrief,
  type VisualDiscoveryProvider,
  type VisualDiscoveryShortlist,
  type VisualIntelligencePlanningState,
} from '@/core/visual-intelligence';
import type { Scene } from '@/lib/types';

export interface VisualDiscoveryLease {
  readonly ownerRevision: string;
  readonly projectId: string;
  readonly scenes: readonly Scene[];
  readonly planning?: VisualIntelligencePlanningState;
  readonly adjacentShortlists?: readonly VisualDiscoveryShortlist[];
}

export function createVisualDiscoveryController(input: {
  readLease: () => VisualDiscoveryLease;
  writeShortlist: (shortlist: VisualDiscoveryShortlist) => void;
  provider: VisualDiscoveryProvider;
}): { discover(sceneId: string): Promise<boolean> } {
  let generation = 0;
  return {
    async discover(sceneId) {
      const lease = input.readLease(); const requestId = ++generation;
      const brief = lease.planning?.briefs.find((item) => item.sceneBinding.sceneId === sceneId);
      const plan = lease.planning?.queryPlans.find((item) => item.sceneBinding.sceneId === sceneId);
      if (!brief || !plan || !isCurrent(brief, plan, lease.scenes)) return false;
      const shortlist = await discoverVisualCandidates({ brief, queryPlan: plan, provider: input.provider, adjacentShortlists: lease.adjacentShortlists });
      // A transient provider-wide failure must not erase a useful prior shortlist.
      if (shortlist.status === 'empty' && shortlist.failedQueryCount > 0) return false;
      const current = input.readLease();
      if (requestId !== generation || current.ownerRevision !== lease.ownerRevision || current.projectId !== lease.projectId || !isCurrent(brief, plan, current.scenes)) return false;
      input.writeShortlist(shortlist);
      return true;
    },
  };
}

function isCurrent(brief: SceneVisualBrief, plan: NonNullable<VisualIntelligencePlanningState['queryPlans']>[number], scenes: readonly Scene[]): boolean {
  return isSceneVisualBindingCurrent(brief.sceneBinding, scenes) && isVisualQueryPlanCurrent(plan, brief, scenes);
}
