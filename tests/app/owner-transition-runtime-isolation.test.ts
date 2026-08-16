import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  invalidateApplicationBootstrap,
  resetApplicationDependencies,
  detachPersistenceOwner,
  resetExportRuntimeForOwnerTransition,
  resetPublishingRuntimeForOwnerTransition,
} = vi.hoisted(() => ({
  invalidateApplicationBootstrap: vi.fn(),
  resetApplicationDependencies: vi.fn(),
  detachPersistenceOwner: vi.fn(),
  resetExportRuntimeForOwnerTransition: vi.fn(),
  resetPublishingRuntimeForOwnerTransition: vi.fn(),
}));

vi.mock('@/app/bootstrap', () => ({ invalidateApplicationBootstrap }));
vi.mock('@/app/registerDependencies', () => ({ resetApplicationDependencies }));
vi.mock('@/persistence/persistenceManager', () => ({ detachPersistenceOwner }));
vi.mock('@/services/exportIntelligenceController', () => ({ resetExportRuntimeForOwnerTransition }));
vi.mock('@/services/publishingController', () => ({ resetPublishingRuntimeForOwnerTransition }));

import { transitionPrivateOwner } from '@/app/ownerTransition';

describe('private owner runtime isolation', () => {
  beforeEach(() => {
    transitionPrivateOwner(null);
    vi.clearAllMocks();
  });

  it('disposes process-global application dependencies when the validated owner changes', () => {
    transitionPrivateOwner('owner-a');
    vi.clearAllMocks();

    const result = transitionPrivateOwner('owner-b');

    expect(result.changed).toBe(true);
    expect(invalidateApplicationBootstrap).toHaveBeenCalledTimes(1);
    expect(resetApplicationDependencies).toHaveBeenCalledTimes(1);
    expect(detachPersistenceOwner).toHaveBeenCalledTimes(1);
    expect(resetExportRuntimeForOwnerTransition).toHaveBeenCalledTimes(1);
    expect(resetPublishingRuntimeForOwnerTransition).toHaveBeenCalledTimes(1);
  });

  it('keeps application runtimes intact for a same-owner token refresh', () => {
    transitionPrivateOwner('owner-a');
    vi.clearAllMocks();

    const result = transitionPrivateOwner('owner-a');

    expect(result.changed).toBe(false);
    expect(invalidateApplicationBootstrap).not.toHaveBeenCalled();
    expect(resetApplicationDependencies).not.toHaveBeenCalled();
    expect(detachPersistenceOwner).not.toHaveBeenCalled();
    expect(resetExportRuntimeForOwnerTransition).not.toHaveBeenCalled();
    expect(resetPublishingRuntimeForOwnerTransition).not.toHaveBeenCalled();
  });
});
