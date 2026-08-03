import type { DirectorContext, DirectorInput, DirectorScoreDimension } from './types';

export function throwIfDirectorAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  throw new DOMException('Director analysis was cancelled.', 'AbortError');
}

export function average(values: readonly number[], fallback = 50): number {
  return values.length === 0 ? fallback : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function variation(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const mean = average(values, 0);
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2), 0));
}

export function contextScore(
  context: DirectorContext,
  sceneId: string,
  dimension: DirectorScoreDimension,
  fallback = 50,
): number {
  return context.scores.get(sceneId)?.get(dimension) ?? fallback;
}

export function sceneById(input: DirectorInput, sceneId: string) {
  return input.scenes.find((scene) => scene.id === sceneId);
}
