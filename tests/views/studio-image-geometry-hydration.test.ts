import { describe, expect, it, vi } from 'vitest';
import { commitImageGeometryHydration, hydrateTrustedImageGeometry } from '@/lib/imageGeometryHydration';
import { canonicalStudioCompositionOutput } from '@/lib/studioOutputIdentity';
import type { ImageEncodedToDisplayOrientation, TrustedImageDisplayGeometryV1 } from '@/core/media';
import type { Scene } from '@/lib/types';

const owner = '00000000-0000-4000-8000-000000000001';
const imageA = `${owner}/generated-images/00000000-0000-4000-8000-00000000000a.jpg`;
const imageB = `${owner}/generated-images/00000000-0000-4000-8000-00000000000b.jpg`;
const defaults = { motion: 'static', transition: 'none' } as const;

describe('Studio trusted image geometry hydration lifecycle', () => {
  it('A: ignores project A completion after switching to project B', async () => {
    const requested = [scene('scene-a', imageA)];
    const hydration = await hydrateTrustedImageGeometry(requested, async () => trusted(imageA, 'rotate-90-cw'));
    const current = [scene('scene-b', imageB)];
    expect(commit({ requested, hydrated: hydration.scenes, current, expectedProjectId: 'A', currentProjectId: 'B' })).toEqual(current);
  });

  it('B/C/E/F: never attaches to changed media, removed scenes, reused indexes, or video replacements', async () => {
    const requested = [scene('scene-a', imageA)];
    const hydration = await hydrateTrustedImageGeometry(requested, async () => trusted(imageA, 'transverse'));
    expect(commit({ requested, hydrated: hydration.scenes, current: [scene('scene-a', imageB)] })[0].imageDisplayGeometry).toBeUndefined();
    expect(commit({ requested, hydrated: hydration.scenes, current: [] })).toEqual([]);
    expect(commit({ requested, hydrated: hydration.scenes, current: [scene('scene-replaced', imageA)] })[0].imageDisplayGeometry).toBeUndefined();
    const video = { ...scene('scene-a', imageA), imageStorage: undefined, videoStorage: { bucket: 'media' as const, objectPath: `${owner}/videos/00000000-0000-4000-8000-000000000001.mp4` } };
    expect(commit({ requested, hydrated: hydration.scenes, current: [video] })[0].imageDisplayGeometry).toBeUndefined();
  });

  it('D/G: follows stable scene/media identity across reorder while preserving concurrent edits', async () => {
    const requested = [scene('scene-a', imageA), scene('scene-b', imageB)];
    const hydration = await hydrateTrustedImageGeometry(requested, async (media) => trusted(media.objectPath, media.objectPath === imageA ? 'transpose' : 'rotate-180'));
    const current = [{ ...requested[1], text: 'edited B' }, { ...requested[0], text: 'edited A' }];
    const committed = commit({ requested, hydrated: hydration.scenes, current });
    expect(committed.map((item) => [item.sceneId, item.text, item.imageDisplayGeometry?.encodedToDisplay])).toEqual([
      ['scene-b', 'edited B', 'rotate-180'], ['scene-a', 'edited A', 'transpose'],
    ]);
  });

  it('H: resolves the same durable media once for multiple scenes', async () => {
    const resolve = vi.fn(async () => trusted(imageA, 'identity'));
    const result = await hydrateTrustedImageGeometry([scene('scene-a', imageA), scene('scene-b', imageA)], resolve);
    expect(resolve).toHaveBeenCalledTimes(1);
    const reference = result.scenes[0].imageDisplayGeometry && 'executionAuthority' in result.scenes[0].imageDisplayGeometry
      ? result.scenes[0].imageDisplayGeometry.executionAuthority.reference : null;
    expect(result.scenes.every((item) => item.imageDisplayGeometry && 'executionAuthority' in item.imageDisplayGeometry
      && item.imageDisplayGeometry.executionAuthority.reference === reference)).toBe(true);
  });

  it('I: a failed request remains unresolved and an explicit later lifecycle retry can succeed', async () => {
    const requested = [scene('scene-a', imageA)];
    const fail = await hydrateTrustedImageGeometry(requested, vi.fn(async () => { throw new Error('transient'); }));
    expect(fail.failedMedia).toEqual([imageA]);
    expect(fail.scenes[0].imageDisplayGeometry).toBeUndefined();
    const retry = await hydrateTrustedImageGeometry(fail.scenes, async () => trusted(imageA, 'identity'));
    expect(retry.failedMedia).toEqual([]);
    expect(retry.scenes[0].imageDisplayGeometry?.encodedToDisplay).toBe('identity');
  });

  it('bounds a shared-media failure to one request per explicit hydration pass', async () => {
    const resolve = vi.fn(async () => { throw new Error('transient'); });
    const result = await hydrateTrustedImageGeometry([scene('scene-a', imageA), scene('scene-b', imageA)], resolve);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(result.failedMedia).toEqual([imageA]);
    expect(result.scenes.every((item) => item.imageDisplayGeometry === undefined)).toBe(true);
  });

  it('J: repeated hydration reuses a still-current authority without another quota call', async () => {
    const resolve = vi.fn(async () => trusted(imageA, 'identity'));
    const first = await hydrateTrustedImageGeometry([scene('scene-a', imageA)], resolve);
    const second = await hydrateTrustedImageGeometry(first.scenes, resolve);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(second.scenes[0].imageDisplayGeometry).toEqual(first.scenes[0].imageDisplayGeometry);
  });

  it('distinguishes proven identity from missing or expired authority in artifact freshness', () => {
    const proven = scene('scene-a', imageA, trusted(imageA, 'identity'));
    const missing = { ...proven, imageDisplayGeometry: undefined };
    const expired = scene('scene-a', imageA, { ...trusted(imageA, 'identity'), executionAuthority: { version: 1, reference: `idga1_${'A'.repeat(43)}`, expiresAt: '2020-01-01T00:00:00.000Z' } });
    expect(canonicalStudioCompositionOutput([proven], defaults).sceneImageOrientations).toEqual([{ orientation: 'identity', contentDigest: 'a'.repeat(64) }]);
    expect(canonicalStudioCompositionOutput([missing], defaults).sceneImageOrientations).toEqual(['unresolved-private-image']);
    expect(canonicalStudioCompositionOutput([expired], defaults).sceneImageOrientations).toEqual(['unresolved-private-image']);
    expect(canonicalStudioCompositionOutput([proven], defaults)).not.toEqual(canonicalStudioCompositionOutput([missing], defaults));
  });
});

function commit(input: {
  requested: Scene[]; hydrated: Scene[]; current: Scene[];
  expectedProjectId?: string; currentProjectId?: string;
}) {
  return commitImageGeometryHydration({
    expectedProjectId: input.expectedProjectId ?? 'project', currentProjectId: input.currentProjectId ?? 'project',
    expectedEpoch: 1, currentEpoch: 1, current: input.current, requested: input.requested, hydrated: input.hydrated,
  });
}

function scene(sceneId: string, objectPath: string, geometry?: TrustedImageDisplayGeometryV1): Scene {
  return { sceneId, text: sceneId, duration: 3, visual: 'visual', imageStorage: { bucket: 'media', objectPath }, ...(geometry ? { imageDisplayGeometry: geometry } : {}) };
}

function trusted(objectPath: string, orientation: ImageEncodedToDisplayOrientation): TrustedImageDisplayGeometryV1 {
  const swap = ['transpose', 'rotate-90-cw', 'transverse', 'rotate-90-ccw'].includes(orientation);
  return {
    version: 1, mediaIdentity: `media:${objectPath}`, encodedDimensions: { width: 3, height: 2 },
    displayDimensions: swap ? { width: 2, height: 3 } : { width: 3, height: 2 }, encodedToDisplay: orientation,
    contentDigest: 'a'.repeat(64),
    executionAuthority: { version: 1, reference: `idga1_${'A'.repeat(43)}`, expiresAt: '2099-01-01T00:00:00.000Z' },
  };
}
