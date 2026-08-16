import type { MediaAsset, MediaScene, RenderManifest } from '@/core/media';
import { getSceneVisualOperations } from '@/core/visual-production/visualState';
import type { RenderPreset } from './types';
import { canonicalMediaAssetSource } from '@/core/media/storageIdentity';

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
      source: canonicalMediaAssetSource(asset),
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
      wordIds: cue.wordIds,
      emphasisWordIds: cue.emphasisWordIds,
      lineCount: cue.lineCount,
    }));

  const videoClips = manifest.timeline.tracks
    .filter((track) => track.type === 'video')
    .flatMap((track) => track.clips)
    .filter((clip) => clip.sceneId === scene.id)
    .map((clip) => { const { visualProduction: _visualProduction, ...metadata } = clip.metadata; return { id: clip.id, assetId: clip.assetId ?? null, startMs: clip.startMs, endMs: clip.endMs, offsetMs: clip.offsetMs, metadata }; });

  const visualProduction = getSceneVisualOperations(manifest, scene.id);

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
    videoClips,
    visualProduction,
    subtitleCues,
    subtitleStyle: manifest.subtitles.style,
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
