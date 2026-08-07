export type VisualMutableOperation = 'analyzing' | 'previewing' | 'applying' | 'undoing' | 'redoing' | 'subtitle-analyzing' | 'subtitle-previewing' | 'subtitle-applying' | 'subtitle-undoing' | 'subtitle-redoing' | 'audio-previewing' | 'editing-previewing';

export interface VisualOperationLease {
  readonly projectId: string;
  readonly operation: VisualMutableOperation;
  readonly token: symbol;
  readonly onSupersede?: () => void;
}

const active = new Map<string, VisualOperationLease>();

export function getActiveVisualOperation(projectId: string): VisualOperationLease | undefined { return active.get(projectId); }

export function isPreviewOperation(operation: VisualMutableOperation): boolean {
  return operation === 'previewing' || operation === 'subtitle-previewing' || operation === 'audio-previewing' || operation === 'editing-previewing';
}

export function acquireVisualOperation(projectId: string, operation: VisualMutableOperation, onSupersede?: () => void): VisualOperationLease {
  const current = active.get(projectId);
  if (current && !(isPreviewOperation(current.operation) && isPreviewOperation(operation))) throw new Error(`Visual operation in progress (${current.operation}) for project ${projectId}.`);
  if (current) current.onSupersede?.();
  const lease = { projectId, operation, token: Symbol(`${projectId}:${operation}`), onSupersede };
  active.set(projectId, lease);
  return lease;
}

export function releaseVisualOperation(lease: VisualOperationLease): void {
  if (active.get(lease.projectId)?.token === lease.token) active.delete(lease.projectId);
}

export function resetVisualOperationCoordinator(): void { active.clear(); }
