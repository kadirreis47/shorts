import type { MediaAsset, MediaAssetType, MediaScene } from './types';

export interface AssetResolver {
  resolve(scenes: MediaScene[]): Promise<MediaAsset[]>;
}

export class DefaultAssetResolver implements AssetResolver {
  async resolve(scenes: MediaScene[]): Promise<MediaAsset[]> {
    return scenes.flatMap((scene) => {
      const source = scene.sourceScene.videoUrl || scene.sourceScene.imageUrl;
      if (!source) return [];

      const type: MediaAssetType = scene.sourceScene.videoUrl ? 'video' : 'image';
      const asset: MediaAsset = {
        id: createId('asset'),
        type,
        source,
        durationMs: type === 'video' ? scene.durationMs : undefined,
        metadata: {
          sceneId: scene.id,
          visualPrompt: scene.visualPrompt,
          keywords: scene.keywords,
          visualMode: scene.sourceScene.visualMode ?? null,
        },
      };

      scene.assetIds.push(asset.id);
      return [asset];
    });
  }
}

export function createAssetResolver(): AssetResolver {
  return new DefaultAssetResolver();
}

function createId(prefix: string): string {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}
