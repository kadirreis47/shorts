import { toDurableScenes } from './mediaStorage';
import { resolveEffectiveSceneComposition, type SceneCompositionDefaults } from '@/core/media/sceneComposition';
import type { Scene, SceneCompositionOverride } from './types';
import { normalizeTrustedImageDisplayGeometry, type ImageEncodedToDisplayOrientation } from '@/core/media/imageDisplayGeometry';

export type StudioImageGeometryOutputState = Readonly<{ orientation: ImageEncodedToDisplayOrientation; contentDigest: string }> | 'unresolved-private-image' | 'non-private-image';

export function isStudioOutputRevisionCurrent(completedRevision: string | undefined, currentRevision: string): boolean {
  return completedRevision !== undefined && completedRevision === currentRevision;
}

/** Removes advisory/private presentation metadata before calculating Studio output freshness. */
export function canonicalStudioOutputScenes(scenes: readonly Scene[]): Array<Omit<Scene, 'sceneId' | 'imageDisplayGeometry'>> {
  return toDurableScenes(scenes).map(({
    imageProvenance: _imageProvenance,
    videoProvenance: _videoProvenance,
    sceneId: _sceneId,
    imageDisplayGeometry: _imageDisplayGeometry,
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
  sceneImageOrientations: StudioImageGeometryOutputState[];
} {
  const canonicalScenes = canonicalStudioOutputScenes(scenes);
  return {
    scenes: canonicalScenes.map(({ compositionOverride: _ignored, ...scene }) => scene),
    sceneComposition: canonicalScenes.map((scene, sceneIndex) =>
      resolveEffectiveSceneComposition(defaults, scene.compositionOverride, sceneIndex)),
    sceneImageOrientations: scenes.map((scene) => {
      if (!scene.imageStorage || scene.videoStorage) return 'non-private-image';
      if (scene.imageDisplayGeometry === undefined) return 'unresolved-private-image';
      try {
        const geometry = normalizeTrustedImageDisplayGeometry(scene.imageDisplayGeometry, `media:${scene.imageStorage.objectPath}`);
        return Object.freeze({ orientation: geometry.encodedToDisplay, contentDigest: geometry.contentDigest });
      } catch {
        return 'unresolved-private-image';
      }
    }),
  };
}
