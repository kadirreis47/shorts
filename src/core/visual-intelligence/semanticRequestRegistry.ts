import { VISUAL_SEMANTIC_ANALYSIS_CONTRACT_VERSION } from './visualSemanticAnalysis';

export interface VisualSemanticOperationIdentity {
  readonly sceneId: string;
  readonly mediaPath: string;
  readonly briefFingerprint: string;
}

function operationKey(identity: VisualSemanticOperationIdentity): string {
  return [
    VISUAL_SEMANTIC_ANALYSIS_CONTRACT_VERSION,
    identity.sceneId,
    identity.mediaPath,
    identity.briefFingerprint,
  ].join('\u0000');
}

/** Session-only guard for a provider-charged operation; completed results are never cached. */
export function createVisualSemanticRequestRegistry() {
  const active = new Set<string>();
  return Object.freeze({
    tryAcquire(identity: VisualSemanticOperationIdentity): boolean {
      const key = operationKey(identity);
      if (active.has(key)) return false;
      active.add(key);
      return true;
    },
    release(identity: VisualSemanticOperationIdentity): void {
      active.delete(operationKey(identity));
    },
  });
}
