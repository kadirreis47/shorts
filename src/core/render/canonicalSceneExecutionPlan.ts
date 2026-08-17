import type { MediaAsset, MediaScene, RenderManifest } from '@/core/media';
import type { RenderPreset } from './types';

/**
 * Shared execution semantics for a scene. This deliberately represents the
 * currently supported canonical baseline: hard cuts, no implicit camera
 * motion, and no visual-production operations. Recipe intent remains in the
 * manifest for future supported render slices, but cache state cannot make it
 * change pixels today.
 */
export interface CanonicalSceneExecutionPlan {
  readonly sceneId: string;
  readonly input: {
    readonly source: string | null;
    readonly kind: 'image' | 'video' | 'color';
  };
  readonly durationMs: number;
  readonly durationSeconds: string;
  readonly filters: readonly string[];
}

export function buildCanonicalSceneExecutionPlan(
  manifest: RenderManifest,
  scene: MediaScene,
  preset: RenderPreset,
): CanonicalSceneExecutionPlan {
  const asset = scene.assetIds
    .map((assetId) => manifest.assets.find((candidate) => candidate.id === assetId))
    .find((candidate): candidate is MediaAsset => Boolean(candidate));
  const durationMs = effectiveSceneDurationMs(manifest, scene);
  const fps = preset.frameRate ?? manifest.render.fps;
  const width = manifest.render.width;
  const height = manifest.render.height;
  const kind = asset?.source
    ? (asset.type === 'image' || asset.type === 'ai_image' ? 'image' : 'video')
    : 'color';

  return {
    sceneId: scene.id,
    input: { source: asset?.source || null, kind },
    durationMs,
    durationSeconds: (durationMs / 1000).toFixed(3),
    filters: [
      `scale=${width}:${height}:force_original_aspect_ratio=increase`,
      `crop=${width}:${height}`,
      `fps=${fps}`,
      `format=${preset.pixelFormat ?? 'yuv420p'}`,
      `trim=duration=${(durationMs / 1000).toFixed(3)}`,
      'setpts=PTS-STARTPTS',
    ],
  };
}

export function assertCanonicalHardCutTimeline(manifest: RenderManifest): void {
  let totalDurationMs = 0;
  const scenes = manifest.timeline.scenes;
  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index];
    const next = scenes[index + 1];
    const overlap = next?.overlapBeforeMs ?? 0;
    if (!Number.isFinite(scene.durationMs) || scene.durationMs <= 0 ||
      !Number.isFinite(overlap) || overlap < 0 || overlap > scene.durationMs ||
      (next !== undefined && overlap > next.durationMs)) {
      throw new Error('Canonical timeline contains an invalid hard-cut overlap.');
    }
    totalDurationMs += scene.durationMs - overlap;
  }
  if (Math.round(totalDurationMs) !== Math.round(manifest.durationMs)) {
    throw new Error('Canonical timeline duration does not match hard-cut execution duration.');
  }
}

/**
 * The canonical timeline may retain transition overlap intent even though
 * Slice 4 does not implement cross-scene transitions. Hard-cut execution
 * removes the outgoing overlap from each non-final scene, preserving the
 * canonical timeline duration without silently trimming the final scene.
 */
export function effectiveSceneDurationMs(
  manifest: RenderManifest,
  scene: MediaScene,
): number {
  const scenePosition = manifest.timeline.scenes.findIndex((candidate) => candidate.id === scene.id);
  const next = scenePosition >= 0 ? manifest.timeline.scenes[scenePosition + 1] : undefined;
  const overlap = next?.overlapBeforeMs ?? 0;
  return Math.round(scene.durationMs - overlap);
}

export function canonicalSceneColor(index: number): string {
  return ['0x0f172a', '0x111827', '0x1e293b', '0x172554', '0x312e81'][index % 5];
}
