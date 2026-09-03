import type { Scene, SceneCompositionOverride } from '@/lib/types';

export type SceneCompositionDefaults = Readonly<Required<SceneCompositionOverride>>;
export interface SceneCompositionTarget { readonly sceneId: string; readonly sceneIndex: number; }

export type SceneCompositionMutationResult =
  | { readonly status: 'updated'; readonly scenes: readonly Scene[] }
  | { readonly status: 'no-op'; readonly scenes: readonly Scene[] }
  | { readonly status: 'invalid-scene'; readonly scenes: readonly Scene[] };

/**
 * Narrow canonical-state mutation helper for future explicit UI actions.
 * It changes only an optional scene override; draft persistence and Studio
 * revision already derive from this canonical Scene collection.
 */
export function setSceneCompositionOverride(
  scenes: readonly Scene[],
  target: SceneCompositionTarget,
  patch: SceneCompositionOverride,
  defaults: SceneCompositionDefaults,
): SceneCompositionMutationResult {
  const sceneIndex = target.sceneIndex;
  if (!Number.isSafeInteger(sceneIndex) || sceneIndex < 0 || sceneIndex >= scenes.length) return { status: 'invalid-scene', scenes };
  if (scenes[sceneIndex].sceneId !== target.sceneId) return { status: 'invalid-scene', scenes };
  const current = scenes[sceneIndex].compositionOverride;
  const normalizedCurrent = current === undefined ? undefined : normalizeSceneCompositionOverride(current, defaults, sceneIndex);
  const nextOverride = normalizeSceneCompositionOverride({ ...normalizedCurrent, ...parseOverride(patch) }, defaults, sceneIndex);
  if (sameOverride(current, nextOverride)) return { status: 'no-op', scenes };
  const next = scenes.map((scene, index) => index === sceneIndex ? withOverride(scene, nextOverride) : scene);
  return { status: 'updated', scenes: next };
}

export function clearSceneCompositionOverride(
  scenes: readonly Scene[],
  target: SceneCompositionTarget,
  field?: keyof SceneCompositionOverride,
): SceneCompositionMutationResult {
  const sceneIndex = target.sceneIndex;
  if (!Number.isSafeInteger(sceneIndex) || sceneIndex < 0 || sceneIndex >= scenes.length) return { status: 'invalid-scene', scenes };
  if (scenes[sceneIndex].sceneId !== target.sceneId) return { status: 'invalid-scene', scenes };
  const current = scenes[sceneIndex].compositionOverride;
  if (!current) return { status: 'no-op', scenes };
  if (field !== undefined && field !== 'motion' && field !== 'transition') throw new Error('Scene composition override field is invalid.');
  const validated = parseOverride(current);
  const nextOverride = field ? removeField(validated, field) : undefined;
  if (sameOverride(current, nextOverride)) return { status: 'no-op', scenes };
  const next = scenes.map((scene, index) => index === sceneIndex ? withOverride(scene, nextOverride) : scene);
  return { status: 'updated', scenes: next };
}

/**
 * Canonical override storage is deviation-only: an override equal to the
 * current project default means inheritance and is removed. Scene zero has no
 * incoming boundary, so its transition is never canonical state.
 */
export function normalizeSceneCompositionOverride(
  value: unknown,
  defaults: SceneCompositionDefaults,
  sceneIndex: number,
): SceneCompositionOverride | undefined {
  if (!Number.isSafeInteger(sceneIndex) || sceneIndex < 0) throw new Error('Scene composition index is invalid.');
  const next = parseOverride(value);
  if (next.motion === defaults.motion) delete next.motion;
  if (sceneIndex === 0 || next.transition === defaults.transition) delete next.transition;
  return Object.keys(next).length ? next : undefined;
}

/** The sole inheritance rule for effective scene motion and incoming transition. */
export function resolveEffectiveSceneComposition(
  defaults: SceneCompositionDefaults,
  override: SceneCompositionOverride | undefined,
  sceneIndex: number,
): Required<SceneCompositionOverride> {
  if (!Number.isSafeInteger(sceneIndex) || sceneIndex < 0) throw new Error('Scene composition index is invalid.');
  const normalized = override === undefined
    ? undefined
    : normalizeSceneCompositionOverride(override, defaults, sceneIndex);
  return {
    motion: normalized?.motion ?? defaults.motion,
    transition: sceneIndex === 0 ? 'none' : normalized?.transition ?? defaults.transition,
  };
}

function parseOverride(value: unknown): SceneCompositionOverride {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Scene composition override is invalid.');
  const input = value as Record<string, unknown>;
  const keys = Object.keys(input);
  if (keys.length === 0 || keys.some((key) => key !== 'motion' && key !== 'transition')) throw new Error('Scene composition override is invalid.');
  const result: SceneCompositionOverride = {};
  if (Object.prototype.hasOwnProperty.call(input, 'motion')) {
    if (!['kenburns', 'pan', 'zoom_in', 'zoom_out', 'static'].includes(input.motion as string)) throw new Error('Scene composition motion is invalid.');
    result.motion = input.motion as SceneCompositionOverride['motion'];
  }
  if (Object.prototype.hasOwnProperty.call(input, 'transition')) {
    if (!['crossfade', 'none'].includes(input.transition as string)) throw new Error('Scene composition transition is invalid.');
    result.transition = input.transition as SceneCompositionOverride['transition'];
  }
  return result;
}

function removeField(current: SceneCompositionOverride, field: keyof SceneCompositionOverride): SceneCompositionOverride | undefined {
  const next = { ...current };
  delete next[field];
  return Object.keys(next).length ? next : undefined;
}

function sameOverride(left: SceneCompositionOverride | undefined, right: SceneCompositionOverride | undefined): boolean {
  return left?.motion === right?.motion && left?.transition === right?.transition;
}

function withOverride(scene: Scene, override: SceneCompositionOverride | undefined): Scene {
  const { compositionOverride: _ignored, ...rest } = scene;
  return override ? { ...rest, compositionOverride: override } : rest;
}
