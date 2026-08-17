import type { RenderManifest } from '@/core/media';

export const CANONICAL_TRANSITION_EXECUTION_VERSION = 1;

export interface CanonicalTransitionCompositionPlan {
  readonly filters: readonly string[];
  readonly outputLabel: string;
  readonly durationMs: number;
  readonly requiresVisualComposition: boolean;
}

/**
 * Shared final-composition policy. Scene streams stay clean and full-length;
 * only this plan consumes canonical overlap timing. This keeps transition-only
 * edits out of segment bytes while making full and cache-assisted output equal.
 */
export function buildCanonicalTransitionCompositionPlan(
  manifest: RenderManifest,
  sceneLabels: readonly string[],
): CanonicalTransitionCompositionPlan {
  assertCanonicalTransitionTimeline(manifest);
  if (sceneLabels.length !== manifest.timeline.scenes.length || sceneLabels.length === 0) {
    throw new Error('Canonical transition composition requires every scene stream.');
  }

  const scenes = manifest.timeline.scenes;
  const filters: string[] = [];
  let outputLabel = sceneLabels[0];
  let outputDurationMs = scenes[0].durationMs;

  for (let index = 1; index < scenes.length; index += 1) {
    const scene = scenes[index];
    const overlapMs = overlapOf(scene);
    const nextLabel = sceneLabels[index];
    const label = `transition${index}`;
    if (transitionTypeOf(scene) === 'crossfade' && overlapMs > 0) {
      const offsetMs = outputDurationMs - overlapMs;
      filters.push(`[${outputLabel}][${nextLabel}]xfade=transition=fade:duration=${seconds(overlapMs)}:offset=${seconds(offsetMs)}[${label}]`);
      outputDurationMs += scene.durationMs - overlapMs;
    } else {
      let leftLabel = outputLabel;
      if (overlapMs > 0) {
        const trimmedLabel = `trim${index}`;
        const trimmedDurationMs = outputDurationMs - overlapMs;
        filters.push(`[${outputLabel}]trim=duration=${seconds(trimmedDurationMs)},setpts=PTS-STARTPTS[${trimmedLabel}]`);
        leftLabel = trimmedLabel;
        outputDurationMs = trimmedDurationMs;
      }
      filters.push(`[${leftLabel}][${nextLabel}]concat=n=2:v=1:a=0[${label}]`);
      outputDurationMs += scene.durationMs;
    }
    outputLabel = label;
  }

  if (Math.round(outputDurationMs) !== Math.round(manifest.durationMs)) {
    throw new Error('Canonical transition composition duration does not match manifest duration.');
  }
  return { filters, outputLabel, durationMs: Math.round(outputDurationMs), requiresVisualComposition: filters.length > 0 };
}

export function assertCanonicalTransitionTimeline(manifest: RenderManifest): void {
  let totalDurationMs = 0;
  const scenes = manifest.timeline.scenes;
  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index];
    const overlap = overlapOf(scene);
    const previous = scenes[index - 1];
    const transitionType = transitionTypeOf(scene);
    const transitionDurationMs = transitionDurationOf(scene);
    const crossfade = transitionType === 'crossfade';
    if (!Number.isFinite(scene.durationMs) || scene.durationMs <= 0 ||
      !Number.isFinite(overlap) || overlap < 0 ||
      (index === 0 && overlap !== 0) ||
      (overlap > 0 && !previous) ||
      (previous && overlap > previous.durationMs) || overlap > scene.durationMs ||
      (crossfade && (transitionDurationMs <= 0 || overlap > transitionDurationMs))) {
      throw new Error('Canonical timeline contains an invalid transition overlap.');
    }
    totalDurationMs += scene.durationMs - overlap;
  }
  if (Math.round(totalDurationMs) !== Math.round(manifest.durationMs)) {
    throw new Error('Canonical timeline duration does not match transition execution duration.');
  }
}

function seconds(valueMs: number): string { return (valueMs / 1000).toFixed(3); }

function overlapOf(scene: RenderManifest['timeline']['scenes'][number]): number {
  return Number.isFinite(scene.overlapBeforeMs) ? scene.overlapBeforeMs : 0;
}

function transitionTypeOf(scene: RenderManifest['timeline']['scenes'][number]): 'cut' | 'crossfade' | 'legacy' {
  const value = scene.transition?.type;
  return value === 'crossfade' ? 'crossfade' : value === 'cut' || value === undefined ? 'cut' : 'legacy';
}

function transitionDurationOf(scene: RenderManifest['timeline']['scenes'][number]): number {
  return Number.isFinite(scene.transition?.durationMs) ? scene.transition.durationMs : 0;
}
