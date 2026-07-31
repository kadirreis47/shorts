import type { AssetProvider } from '../assetProviderTypes';
import type { MediaScene } from '../types';

export function createSourceSceneProvider(sceneMap: ReadonlyMap<string, MediaScene>): AssetProvider {
  return {
    id: 'source-scene',
    priority: 100,
    capabilities: new Set(['local', 'image', 'video']),
    isAvailable: () => true,
    async search(query) {
      const scene = sceneMap.get(query.sceneId);
      if (!scene) return [];
      const source = scene.sourceScene.videoUrl || scene.sourceScene.imageUrl;
      if (!source) return [];
      const isVideo = Boolean(scene.sourceScene.videoUrl);
      return [{
        id: `${query.sceneId}-source`,
        providerId: 'source-scene',
        type: isVideo ? 'video' : 'image',
        source,
        durationMs: isVideo ? scene.durationMs : undefined,
        title: scene.visualPrompt,
        relevance: 1,
        license: 'user-provided-or-upstream',
        metadata: { sceneId: scene.id, visualMode: scene.sourceScene.visualMode ?? null },
      }];
    },
  };
}
