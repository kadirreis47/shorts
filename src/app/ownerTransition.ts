import { invalidateApplicationBootstrap } from '@/app/bootstrap';
import { resetApplicationDependencies } from '@/app/registerDependencies';
import { detachPersistenceOwner } from '@/persistence/persistenceManager';
import { resetExportRuntimeForOwnerTransition } from '@/services/exportIntelligenceController';
import { resetPublishingRuntimeForOwnerTransition } from '@/services/publishingController';
import { advanceValidatedOwnerGeneration, getValidatedOwnerGeneration } from '@/auth/identity';

let activeOwnerId: string | null = null;

export function transitionPrivateOwner(nextOwnerId: string | null): { changed: boolean; generation: number } {
  if (activeOwnerId === nextOwnerId) return { changed: false, generation: getValidatedOwnerGeneration() };
  activeOwnerId = nextOwnerId;
  const generation = advanceValidatedOwnerGeneration();
  invalidateApplicationBootstrap();
  resetApplicationDependencies();
  detachPersistenceOwner();
  resetExportRuntimeForOwnerTransition();
  resetPublishingRuntimeForOwnerTransition();
  return { changed: true, generation };
}

export function privateOwnerGeneration() { return getValidatedOwnerGeneration(); }
