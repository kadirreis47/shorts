import type { AssetProvider } from '../assetProviderTypes';
import type { MediaScene } from '../types';
import { isCanonicalPrivateMediaIdentity, privateStorageSource } from '../storageIdentity';

export function createSourceSceneProvider(sceneMap: ReadonlyMap<string, MediaScene>): AssetProvider {
  return {
    id: 'source-scene',
    priority: 100,
    capabilities: new Set(['local', 'image', 'video']),
    // Results read sceneMap by query.sceneId, so query-scoped cache entries are never safe.
    cacheable: false,
    isAvailable: () => true,
    async search(query) {
      const scene = sceneMap.get(query.sceneId);
      if (!scene) return [];
      const isVideo = Boolean(scene.sourceScene.videoUrl || scene.sourceScene.videoStorage);
      const storageIdentity = isVideo ? scene.sourceScene.videoStorage : scene.sourceScene.imageStorage;
      if (storageIdentity && !isCanonicalPrivateMediaIdentity(storageIdentity)) return [];
      const source = storageIdentity
        ? privateStorageSource(storageIdentity)
        : scene.sourceScene.videoUrl || scene.sourceScene.imageUrl;
      if (!source) return [];
      return [{
        id: `${query.sceneId}-source`,
        providerId: 'source-scene',
        type: isVideo ? 'video' : 'image',
        source,
        durationMs: isVideo ? scene.durationMs : undefined,
        title: scene.visualPrompt,
        relevance: 1,
        license: 'user-provided-or-upstream',
        metadata: {
          sceneId: scene.id,
          visualMode: scene.sourceScene.visualMode ?? null,
          ...(storageIdentity ? {
            storageBucket: storageIdentity.bucket,
            storageObjectPath: storageIdentity.objectPath,
          } : {}),
          ...((scene.sourceScene.imageStorage ? scene.sourceScene.imageProvenance : scene.sourceScene.videoProvenance) ? { providerProvenance: scene.sourceScene.imageStorage ? scene.sourceScene.imageProvenance : scene.sourceScene.videoProvenance } : {}),
        },
      }];
    },
  };
}
