export type VisualMutableOperation = 'analyzing' | 'previewing' | 'applying' | 'undoing' | 'redoing';

export interface VisualOperationLease {
  readonly projectId: string;
  readonly operation: VisualMutableOperation;
  readonly token: symbol;
}

const active = new Map<string, VisualOperationLease>();

export function getActiveVisualOperation(projectId: string): VisualOperationLease | undefined { return active.get(projectId); }

export function acquireVisualOperation(projectId: string, operation: VisualMutableOperation): VisualOperationLease {
  const current = active.get(projectId);
  if (current && !(current.operation === 'previewing' && operation === 'previewing')) throw new Error(`Visual operation in progress (${current.operation}) for project ${projectId}.`);
  const lease = { projectId, operation, token: Symbol(`${projectId}:${operation}`) };
  active.set(projectId, lease);
  return lease;
}

export function releaseVisualOperation(lease: VisualOperationLease): void {
  if (active.get(lease.projectId)?.token === lease.token) active.delete(lease.projectId);
}

export function resetVisualOperationCoordinator(): void { active.clear(); }
