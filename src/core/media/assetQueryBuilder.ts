import type { AssetSearchQuery } from './assetProviderTypes';
import type { MediaAssetType, MediaProjectSettings, MediaScene } from './types';

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'over', 'under',
  'bir', 've', 'ile', 'için', 'olan', 'olarak', 'gibi', 'ama', 'daha', 'çok',
]);

export function buildAssetSearchQuery(
  scene: MediaScene,
  settings: MediaProjectSettings,
): AssetSearchQuery {
  const keywords = unique([
    ...scene.keywords,
    ...tokenize(scene.visualPrompt),
    ...tokenize(scene.text),
  ]).slice(0, 10);

  const primary = compact([scene.visualPrompt, keywords.slice(0, 5).join(' ')]).join(' ');
  const cinematic = compact([keywords.slice(0, 4).join(' '), 'cinematic vertical']).join(' ');
  const broad = keywords.slice(0, 3).join(' ');
  const preferredTypes: MediaAssetType[] = scene.sourceScene.visualMode === 'ai_cartoon' ||
    scene.sourceScene.visualMode === 'ai_anime' ||
    scene.sourceScene.visualMode === 'ai_realistic'
    ? ['ai_image', 'image', 'video']
    : ['video', 'broll', 'image'];

  return {
    sceneId: scene.id,
    text: scene.text,
    visualPrompt: scene.visualPrompt,
    keywords,
    queries: unique([primary, cinematic, broad]).filter(Boolean).slice(0, 3),
    preferredTypes,
    targetWidth: settings.resolution.width,
    targetHeight: settings.resolution.height,
    minimumDurationMs: Math.min(1_000, scene.durationMs),
    maximumDurationMs: Math.max(scene.durationMs * 2, 8_000),
  };
}

function tokenize(value: string): string[] {
  return value
    .toLocaleLowerCase('tr-TR')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function compact(items: string[]): string[] {
  return items.map((item) => item.trim()).filter(Boolean);
}
