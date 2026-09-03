import { describe, expect, it } from 'vitest';
import { createVisualSemanticRequestRegistry } from '@/core/visual-intelligence';

const operation = { sceneId: 'scene-a', mediaPath: 'owner/generated-images/a.png', briefFingerprint: 'brief-a' } as const;

describe('visual semantic paid-operation registry', () => {
  it('deduplicates a same-media same-intent double click only while it is in flight', () => {
    const registry = createVisualSemanticRequestRegistry();
    expect(registry.tryAcquire(operation)).toBe(true);
    expect(registry.tryAcquire(operation)).toBe(false);
    registry.release(operation);
    expect(registry.tryAcquire(operation)).toBe(true);
  });

  it('does not block a materially changed media or plan operation', () => {
    const registry = createVisualSemanticRequestRegistry();
    expect(registry.tryAcquire(operation)).toBe(true);
    expect(registry.tryAcquire({ ...operation, mediaPath: 'owner/generated-images/b.png' })).toBe(true);
    expect(registry.tryAcquire({ ...operation, briefFingerprint: 'brief-b' })).toBe(true);
  });
});
