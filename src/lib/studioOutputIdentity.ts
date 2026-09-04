import { toDurableScenes } from './mediaStorage';
import { resolveEffectiveSceneComposition, type SceneCompositionDefaults } from '@/core/media/sceneComposition';
import type { Scene, SceneCompositionOverride } from './types';
import { normalizeTrustedImageDisplayGeometry, type ImageEncodedToDisplayOrientation } from '@/core/media/imageDisplayGeometry';
import { normalizeImageFraming, normalizeImageFramingBinding } from '@/core/media/imageFraming';

export type StudioImageGeometryOutputState = Readonly<{
  orientation: ImageEncodedToDisplayOrientation;
  contentDigest: string;
  encodedDimensions: Readonly<{ width: number; height: number }>;
  displayDimensions: Readonly<{ width: number; height: number }>;
}> | 'unresolved-private-image' | 'non-private-image';

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
    imageFraming: rawImageFraming,
    imageFramingBinding: rawImageFramingBinding,
    ...scene
  }) => {
    const imageFraming = rawImageFraming === undefined ? undefined : normalizeImageFraming(rawImageFraming);
    if (imageFraming && (!scene.imageStorage || scene.videoStorage || scene.videoUrl)) {
      throw new Error('Canonical image framing requires a private image scene.');
    }
    if (imageFraming) {
      if (rawImageFramingBinding === undefined) throw new Error('Canonical image framing requires an immutable geometry binding.');
      normalizeImageFramingBinding(rawImageFramingBinding, `media:${scene.imageStorage!.objectPath}`);
    } else if (rawImageFramingBinding !== undefined) {
      throw new Error('Image framing binding requires canonical image framing.');
    }
    return { ...scene, ...(imageFraming ? { imageFraming } : {}) };
  });
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
        return Object.freeze({
          orientation: geometry.encodedToDisplay,
          contentDigest: geometry.contentDigest,
          encodedDimensions: geometry.encodedDimensions,
          displayDimensions: geometry.displayDimensions,
        });
      } catch {
        return 'unresolved-private-image';
      }
    }),
  };
}
