import type { MediaAsset, MediaScene, RenderManifest } from '@/core/media';
import type { RenderPreset } from './types';

export async function createSceneFingerprint(
  scene: MediaScene,
  manifest: RenderManifest,
  preset: RenderPreset,
): Promise<string> {
  const assets = scene.assetIds
    .map((assetId) => manifest.assets.find((asset) => asset.id === assetId))
    .filter((asset): asset is MediaAsset => Boolean(asset))
    .map((asset) => ({
      id: asset.id,
      type: asset.type,
      source: asset.source,
      durationMs: asset.durationMs ?? null,
      mimeType: asset.mimeType ?? null,
      metadata: asset.metadata,
    }));

  const subtitleCues = manifest.subtitles.cues
    .filter(
      (cue) =>
        cue.startMs < scene.endMs &&
        cue.endMs > scene.startMs,
    )
    .map((cue) => ({
      startMs: Math.max(0, cue.startMs - scene.startMs),
      endMs: Math.max(0, cue.endMs - scene.startMs),
      text: cue.text,
      words: cue.words,
    }));

  const payload = stableStringify({
    scene: {
      id: scene.id,
      index: scene.index,
      role: scene.role,
      text: scene.text,
      visualPrompt: scene.visualPrompt,
      startMs: scene.startMs,
      endMs: scene.endMs,
      durationMs: scene.durationMs,
      assetIds: scene.assetIds,
      cameraMotion: scene.cameraMotion,
      transition: scene.transition,
      subtitleText: scene.subtitleText,
      intensity: scene.intensity,
    },
    assets,
    subtitleCues,
    render: manifest.render,
    preset,
  });

  return hash(payload);
}

async function hash(value: string): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const bytes = new TextEncoder().encode(value);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map((part) => part.toString(16).padStart(2, '0'))
      .join('');
  }

  let first = 2166136261;
  let second = 2246822519;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ code, 3266489917);
  }

  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0)
    .toString(16)
    .padStart(8, '0')}`;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortValue(nested)]),
    );
  }
  return value;
}
