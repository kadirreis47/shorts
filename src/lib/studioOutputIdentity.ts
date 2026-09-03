import { toDurableScenes } from './mediaStorage';
import { resolveEffectiveSceneComposition, type SceneCompositionDefaults } from '@/core/media/sceneComposition';
import type { Scene, SceneCompositionOverride } from './types';

/** Removes advisory/private presentation metadata before calculating Studio output freshness. */
export function canonicalStudioOutputScenes(scenes: readonly Scene[]): Array<Omit<Scene, 'sceneId'>> {
  return toDurableScenes(scenes).map(({
    imageProvenance: _imageProvenance,
    videoProvenance: _videoProvenance,
    sceneId: _sceneId,
    ...scene
  }) => scene);
}

/** Output-semantic composition input used by Studio artifact freshness. */
export function canonicalStudioCompositionOutput(
  scenes: readonly Scene[],
  defaults: SceneCompositionDefaults,
): {
  scenes: Array<Omit<Scene, 'sceneId' | 'compositionOverride'>>;
  sceneComposition: Array<Required<SceneCompositionOverride>>;
} {
  const canonicalScenes = canonicalStudioOutputScenes(scenes);
  return {
    scenes: canonicalScenes.map(({ compositionOverride: _ignored, ...scene }) => scene),
    sceneComposition: canonicalScenes.map((scene, sceneIndex) =>
      resolveEffectiveSceneComposition(defaults, scene.compositionOverride, sceneIndex)),
  };
}
