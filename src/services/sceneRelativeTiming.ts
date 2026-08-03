export interface TimelineInterval {
  readonly startMs: number;
  readonly endMs?: number;
}

export interface SceneBoundary {
  readonly startMs: number;
  readonly endMs: number;
}

export function toSceneRelativeOffset(interval: TimelineInterval, scene: SceneBoundary): number | null {
  const endMs = interval.endMs;
  const intersects = endMs === undefined
    ? interval.startMs >= scene.startMs && interval.startMs < scene.endMs
    : interval.startMs < scene.endMs && endMs > scene.startMs;
  if (!intersects) return null;
  return Math.max(0, Math.min(scene.endMs, Math.max(scene.startMs, interval.startMs)) - scene.startMs);
}

export function earliestSceneRelativeOffset(
  intervals: readonly TimelineInterval[],
  scene: SceneBoundary,
): number | null {
  return intervals.reduce<number | null>((earliest, interval) => {
    const offset = toSceneRelativeOffset(interval, scene);
    return offset === null ? earliest : Math.min(earliest ?? offset, offset);
  }, null);
}
