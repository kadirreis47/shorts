import { compileStudioProductionRecipeV1, normalizeStudioProductionRecipeV1, type MediaEngine } from '@/core/media';
import type { Scene, Video } from '@/lib/types';
import { captureValidatedMediaOwnerContext } from '@/lib/mediaStorage';
import { materializeCanonicalSceneIds } from '@/lib/sceneIdentity';
import { resolveOwnedImageDisplayGeometry } from '@/lib/api';

export async function buildAIExportStudioMediaProject(
  video: Pick<Video, 'id' | 'title' | 'scenes' | 'narration_mode'>,
  mediaEngine: MediaEngine,
  resolveGeometry: typeof resolveOwnedImageDisplayGeometry = resolveOwnedImageDisplayGeometry,
) {
  if (video.narration_mode !== 'silent') throw new Error('This legacy video needs canonical narration recovery before verified export.');
  const canonicalScenes = materializeCanonicalSceneIds(video.scenes);
  const geometryByMedia = new Map<string, Awaited<ReturnType<typeof resolveOwnedImageDisplayGeometry>>>();
  const resolvedScenes: Scene[] = [];
  for (const scene of canonicalScenes) {
    if (scene.imageUrl && !scene.imageStorage && !scene.videoUrl && !scene.videoStorage) {
      throw new Error('External images must be promoted to private media before verified export.');
    }
    if (!scene.imageStorage || scene.videoStorage) { resolvedScenes.push({ ...scene, imageDisplayGeometry: undefined }); continue; }
    let geometry = geometryByMedia.get(scene.imageStorage.objectPath);
    if (!geometry) {
      geometry = await resolveGeometry(scene.imageStorage);
      geometryByMedia.set(scene.imageStorage.objectPath, geometry);
    }
    resolvedScenes.push({ ...scene, imageDisplayGeometry: geometry });
  }
  const recipe = normalizeStudioProductionRecipeV1({
    projectId: `rendered-video-${video.id}`,
    title: video.title,
    scenes: resolvedScenes,
    captionStyle: 'classic', transitionStyle: 'none', motionStyle: 'static', showSubtitles: false,
    captionTextColor: '#ffffff', captionHighlightColor: '#facc15', voiceoverMode: 'none', narration: null,
    musicId: '', musicVolume: 0, beatSync: false, watermarkText: '', watermarkPosition: 'bottom-right',
    visualMode: 'auto', selectedStyleId: '', characterProfileId: '', useBroll: false,
    characterName: '', characterAppearance: '', characterArtStyle: '',
  }, captureValidatedMediaOwnerContext());
  return mediaEngine.buildProject(compileStudioProductionRecipeV1(recipe));
}
