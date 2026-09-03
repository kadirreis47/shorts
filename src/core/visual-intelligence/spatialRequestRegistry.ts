import { VISUAL_SPATIAL_ANALYSIS_CONTRACT_VERSION } from './visualSpatialAnalysis';
import type { VisualSpatialEvidenceBinding } from './spatial';

function operationKey(identity: VisualSpatialEvidenceBinding): string {
  return [VISUAL_SPATIAL_ANALYSIS_CONTRACT_VERSION, identity.projectId, identity.sceneId, identity.sceneIndex, identity.scope, identity.mediaIdentity].join('\u0000');
}

/** Session-only guard for a provider-charged operation; completed evidence is never cached. */
export function createVisualSpatialRequestRegistry() {
  const active = new Set<string>();
  return Object.freeze({
    tryAcquire(identity: VisualSpatialEvidenceBinding): boolean { const key = operationKey(identity); if (active.has(key)) return false; active.add(key); return true; },
    release(identity: VisualSpatialEvidenceBinding): void { active.delete(operationKey(identity)); },
  });
}
