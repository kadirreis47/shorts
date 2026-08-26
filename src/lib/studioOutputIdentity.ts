import { toDurableScenes } from './mediaStorage';
import type { Scene } from './types';

/** Removes advisory/private presentation metadata before calculating Studio output freshness. */
export function canonicalStudioOutputScenes(scenes: readonly Scene[]): Scene[] {
  return toDurableScenes(scenes).map(({
    imageProvenance: _imageProvenance,
    videoProvenance: _videoProvenance,
    visualPlanningId: _visualPlanningId,
    ...scene
  }) => scene);
}
