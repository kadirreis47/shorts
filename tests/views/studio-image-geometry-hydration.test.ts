import { describe, expect, it, vi } from 'vitest';
import { commitImageGeometryHydration, hydrateTrustedImageGeometry } from '@/lib/imageGeometryHydration';
import { canonicalStudioCompositionOutput } from '@/lib/studioOutputIdentity';
import { imageFramingBindingFromHistoricalGeometry, type ImageEncodedToDisplayOrientation, type TrustedImageDisplayGeometryV1 } from '@/core/media';
import { normalizeStudioDraft, type StudioDraft } from '@/lib/studioDraft';
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
    const framing = { version: 1 as const, mode: 'focal-cover' as const, anchor: { x: 0.2, y: 0.8 } };
    const current = [{ ...requested[1], text: 'edited B' }, {
      ...requested[0], text: 'edited A', imageFraming: framing,
      imageFramingBinding: imageFramingBindingFromHistoricalGeometry(hydration.scenes[0].imageDisplayGeometry),
    }];
    const committed = commit({ requested, hydrated: hydration.scenes, current });
    expect(committed.map((item) => [item.sceneId, item.text, item.imageDisplayGeometry?.encodedToDisplay])).toEqual([
      ['scene-b', 'edited B', 'rotate-180'], ['scene-a', 'edited A', 'transpose'],
    ]);
    expect(committed[1].imageFraming).toEqual(framing);
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

  it('preserves framing across capability rotation only while digest, orientation, and dimensions remain exact', async () => {
    const framing = { version: 1 as const, mode: 'focal-cover' as const, anchor: { x: 0.2, y: 0.8 } };
    const originalGeometry = expired(trusted(imageA, 'identity'));
    const original = framedScene('scene-a', imageA, originalGeometry, framing);
    const rotatedAuthority = await hydrateTrustedImageGeometry([original], async () => ({
      ...trusted(imageA, 'identity'),
      executionAuthority: { version: 1, reference: `idga1_${'B'.repeat(43)}`, expiresAt: '2099-02-01T00:00:00.000Z' },
    }));
    expect(rotatedAuthority.scenes[0].imageFraming).toEqual(framing);
    const freshOriginal = { ...original, imageDisplayGeometry: trusted(imageA, 'identity') };
    expect(canonicalStudioCompositionOutput([freshOriginal], defaults)).toEqual(
      canonicalStudioCompositionOutput([rotatedAuthority.scenes[0]], defaults),
    );

    const changedBytes = await hydrateTrustedImageGeometry([original], async () => ({
      ...trusted(imageA, 'identity'), contentDigest: 'b'.repeat(64),
    }));
    expect(changedBytes.scenes[0].imageFraming).toBeUndefined();
    expect(commit({ requested: [original], hydrated: changedBytes.scenes, current: [original] })[0].imageFraming).toBeUndefined();
    expect(commit({
      requested: [original],
      hydrated: changedBytes.scenes,
      current: [{ ...original, imageFraming: { version: 1, mode: 'focal-cover', anchor: { x: 0.8, y: 0.2 } } }],
    })[0].imageFraming).toBeUndefined();
    const unframedOriginal = { ...original, imageFraming: undefined };
    const changedWhileEditing = await hydrateTrustedImageGeometry([unframedOriginal], async () => ({
      ...trusted(imageA, 'identity'), contentDigest: 'b'.repeat(64),
    }));
    expect(commit({
      requested: [unframedOriginal],
      hydrated: changedWhileEditing.scenes,
      current: [{
        ...unframedOriginal,
        imageFraming: framing,
        imageFramingBinding: imageFramingBindingFromHistoricalGeometry(originalGeometry),
      }],
    })[0].imageFraming).toBeUndefined();

    const changedOrientation = await hydrateTrustedImageGeometry([original], async () => trusted(imageA, 'rotate-180'));
    expect(changedOrientation.scenes[0].imageFraming).toBeUndefined();

    const changedDimensions = await hydrateTrustedImageGeometry([original], async () => ({
      ...trusted(imageA, 'identity'), encodedDimensions: { width: 4, height: 2 }, displayDimensions: { width: 4, height: 2 },
    }));
    expect(changedDimensions.scenes[0].imageFraming).toBeUndefined();

    const changedIdentity = { ...original, imageStorage: { bucket: 'media' as const, objectPath: imageB }, imageDisplayGeometry: undefined } as Scene;
    const refreshedIdentity = await hydrateTrustedImageGeometry([changedIdentity], async () => trusted(imageB, 'identity'));
    expect(refreshedIdentity.scenes[0].imageFraming).toBeUndefined();

    const malformedPrevious = {
      ...original,
      imageFramingBinding: { ...original.imageFramingBinding!, displayDimensions: { width: 99, height: 2 } },
    } as Scene;
    const refreshedMalformed = await hydrateTrustedImageGeometry([malformedPrevious], async () => trusted(imageA, 'identity'));
    expect(refreshedMalformed.scenes[0].imageFraming).toBeUndefined();
  });

  it('retains a non-authorizing framing binding across repeated failures and later preserves only identical geometry', async () => {
    const framing = { version: 1 as const, mode: 'focal-cover' as const, anchor: { x: 0.2, y: 0.8 } };
    const original = framedScene('scene-a', imageA, expired(trusted(imageA, 'identity')), framing);
    const fail = async (input: readonly Scene[]) => hydrateTrustedImageGeometry(input, async () => { throw new Error('offline'); }, { force: true });

    const firstHydration = await fail([original]);
    const first = commit({ requested: [original], hydrated: firstHydration.scenes, current: [original] });
    expect(first[0]).toMatchObject({ imageFraming: framing, imageFramingBinding: original.imageFramingBinding });
    expect(first[0].imageDisplayGeometry).toBeUndefined();
    const secondHydration = await fail(first);
    const second = commit({ requested: first, hydrated: secondHydration.scenes, current: first });
    const thirdHydration = await fail(second);
    const third = commit({ requested: second, hydrated: thirdHydration.scenes, current: second });
    expect(third[0]).toMatchObject({ imageFraming: framing, imageFramingBinding: original.imageFramingBinding });
    expect(third[0].imageDisplayGeometry).toBeUndefined();

    const identicalHydration = await hydrateTrustedImageGeometry(third, async () => trusted(imageA, 'identity'), { force: true });
    const identical = commit({ requested: third, hydrated: identicalHydration.scenes, current: third });
    expect(identical[0]).toMatchObject({ imageFraming: framing, imageFramingBinding: original.imageFramingBinding });
    expect(identical[0].imageDisplayGeometry).toBeDefined();
    expect(identicalHydration.failedMedia).toEqual([]);
  });

  it.each([
    ['digest', (value: TrustedImageDisplayGeometryV1) => ({ ...value, contentDigest: 'b'.repeat(64) })],
    ['orientation', (_value: TrustedImageDisplayGeometryV1) => trusted(imageA, 'rotate-180')],
    ['dimensions', (value: TrustedImageDisplayGeometryV1) => ({ ...value, encodedDimensions: { width: 4, height: 2 }, displayDimensions: { width: 4, height: 2 } })],
  ] as const)('clears framing after failure when a later refresh changes %s', async (_label, change) => {
    const framing = { version: 1 as const, mode: 'focal-cover' as const, anchor: { x: 0.2, y: 0.8 } };
    const original = framedScene('scene-a', imageA, expired(trusted(imageA, 'identity')), framing);
    const failedHydration = await hydrateTrustedImageGeometry([original], async () => { throw new Error('offline'); }, { force: true });
    const failed = commit({ requested: [original], hydrated: failedHydration.scenes, current: [original] });
    const changedHydration = await hydrateTrustedImageGeometry(failed, async () => change(trusted(imageA, 'identity')), { force: true });
    const changed = commit({ requested: failed, hydrated: changedHydration.scenes, current: failed });
    expect(changed[0].imageFraming).toBeUndefined();
    expect(changed[0].imageFramingBinding).toBeUndefined();
    expect(changed[0].imageDisplayGeometry).toBeDefined();
  });

  it('clears framing after failure when a later refresh changes media identity', async () => {
    const framing = { version: 1 as const, mode: 'focal-cover' as const, anchor: { x: 0.2, y: 0.8 } };
    const original = framedScene('scene-a', imageA, expired(trusted(imageA, 'identity')), framing);
    const failedHydration = await hydrateTrustedImageGeometry([original], async () => { throw new Error('offline'); }, { force: true });
    const failed = commit({ requested: [original], hydrated: failedHydration.scenes, current: [original] });
    const replaced = [{ ...failed[0], imageStorage: { bucket: 'media' as const, objectPath: imageB } }];
    const changed = await hydrateTrustedImageGeometry(replaced, async () => trusted(imageB, 'identity'), { force: true });
    expect(changed.scenes[0].imageFraming).toBeUndefined();
    expect(changed.scenes[0].imageFramingBinding).toBeUndefined();
  });

  it('persists immutable binding across restart while stripping live authority, then proves identity on refresh', async () => {
    const framing = { version: 1 as const, mode: 'focal-cover' as const, anchor: { x: 0.2, y: 0.8 } };
    const original = framedScene('scene-a', imageA, trusted(imageA, 'identity'), framing);
    const persisted = normalizeStudioDraft(draft([original])).scenes[0];
    expect(persisted.imageDisplayGeometry).toBeUndefined();
    expect(persisted).toMatchObject({ imageFraming: framing, imageFramingBinding: original.imageFramingBinding });

    const identical = await hydrateTrustedImageGeometry([persisted], async () => trusted(imageA, 'identity'));
    expect(identical.scenes[0]).toMatchObject({ imageFraming: framing, imageFramingBinding: original.imageFramingBinding });
    expect(identical.scenes[0].imageDisplayGeometry).toBeDefined();

  });

  it.each([
    ['digest', imageA, (path: string) => ({ ...trusted(path, 'identity'), contentDigest: 'b'.repeat(64) })],
    ['orientation', imageA, (path: string) => trusted(path, 'rotate-180')],
    ['dimensions', imageA, (path: string) => ({ ...trusted(path, 'identity'), encodedDimensions: { width: 4, height: 2 }, displayDimensions: { width: 4, height: 2 } })],
    ['media identity', imageB, (path: string) => trusted(path, 'identity')],
  ] as const)('clears restart-persisted framing before attaching changed %s geometry', async (_label, objectPath, resolve) => {
    const framing = { version: 1 as const, mode: 'focal-cover' as const, anchor: { x: 0.2, y: 0.8 } };
    const original = framedScene('scene-a', imageA, trusted(imageA, 'identity'), framing);
    const persisted = normalizeStudioDraft(draft([original])).scenes[0];
    const restarted = objectPath === imageA
      ? persisted
      : { ...persisted, imageStorage: { bucket: 'media' as const, objectPath } };
    const changed = await hydrateTrustedImageGeometry([restarted], async () => resolve(objectPath));
    expect(changed.scenes[0].imageFraming).toBeUndefined();
    expect(changed.scenes[0].imageFramingBinding).toBeUndefined();
    expect(changed.scenes[0].imageDisplayGeometry).toBeDefined();
  });

  it('fails malformed or missing historical binding closed after live metadata has been stripped', async () => {
    const framing = { version: 1 as const, mode: 'focal-cover' as const, anchor: { x: 0.2, y: 0.8 } };
    const malformed = {
      ...scene('scene-a', imageA), framing,
      imageFraming: framing,
      imageFramingBinding: { version: 1, mediaIdentity: `media:${imageA}`, contentDigest: 'bad' },
    } as unknown as Scene;
    const refreshed = await hydrateTrustedImageGeometry([malformed], async () => trusted(imageA, 'identity'));
    expect(refreshed.scenes[0].imageFraming).toBeUndefined();
    expect(refreshed.scenes[0].imageFramingBinding).toBeUndefined();
    const missing = await hydrateTrustedImageGeometry([{ ...malformed, imageFramingBinding: undefined }], async () => trusted(imageA, 'identity'));
    expect(missing.scenes[0].imageFraming).toBeUndefined();
  });

  it('distinguishes proven identity from missing or expired authority in artifact freshness', () => {
    const proven = scene('scene-a', imageA, trusted(imageA, 'identity'));
    const missing = { ...proven, imageDisplayGeometry: undefined };
    const expired = scene('scene-a', imageA, { ...trusted(imageA, 'identity'), executionAuthority: { version: 1, reference: `idga1_${'A'.repeat(43)}`, expiresAt: '2020-01-01T00:00:00.000Z' } });
    expect(canonicalStudioCompositionOutput([proven], defaults).sceneImageOrientations).toEqual([{
      orientation: 'identity', contentDigest: 'a'.repeat(64),
      encodedDimensions: { width: 3, height: 2 }, displayDimensions: { width: 3, height: 2 },
    }]);
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

function framedScene(
  sceneId: string,
  objectPath: string,
  geometry: TrustedImageDisplayGeometryV1,
  imageFraming: NonNullable<Scene['imageFraming']>,
): Scene {
  return {
    ...scene(sceneId, objectPath, geometry),
    imageFraming,
    imageFramingBinding: imageFramingBindingFromHistoricalGeometry(geometry, `media:${objectPath}`),
  };
}

function draft(scenes: Scene[]): StudioDraft {
  return {
    version: 1, projectId: 'project', savedAt: '2026-09-04T00:00:00.000Z', step: 'render', channelId: '', topic: '', niche: '', tone: '', duration: 3,
    title: '', hook: '', script: '', cta: '', scenes, captionStyle: 'classic', transitionStyle: 'none', motionStyle: 'static', useBroll: false,
    musicId: '', musicVolume: 0, visualMode: 'auto', selectedStyleId: '', characterName: '', characterAppearance: '', characterArtStyle: '', characterProfileId: '',
    watermarkText: '', watermarkPosition: 'bottom-right', showSubtitles: false, captionTextColor: '', captionHighlightColor: '', beatSync: false,
    voiceoverMode: 'none', selectedVoice: '', targetLanguage: 'en',
  };
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

function expired(geometry: TrustedImageDisplayGeometryV1): TrustedImageDisplayGeometryV1 {
  return {
    ...geometry,
    executionAuthority: { ...geometry.executionAuthority, expiresAt: '2020-01-01T00:00:00.000Z' },
  };
}
