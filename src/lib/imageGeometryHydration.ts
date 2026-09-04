import { normalizeTrustedImageDisplayGeometry, type TrustedImageDisplayGeometryV1 } from '@/core/media/imageDisplayGeometry';
import type { MediaStorageObject, Scene } from './types';

export interface ImageGeometryHydrationResult {
  readonly scenes: Scene[];
  readonly failedMedia: readonly string[];
}

/** Sequential and media-deduplicated so one lifecycle action cannot burst the protected quota. */
export async function hydrateTrustedImageGeometry(
  scenes: readonly Scene[],
  resolve: (media: MediaStorageObject) => Promise<TrustedImageDisplayGeometryV1>,
  options: { readonly force?: boolean } = {},
): Promise<ImageGeometryHydrationResult> {
  const cache = new Map<string, TrustedImageDisplayGeometryV1>();
  const failed = new Set<string>();
  const hydrated: Scene[] = [];
  for (const scene of scenes) {
    if (!scene.imageStorage || scene.videoStorage) {
      hydrated.push({ ...scene, imageDisplayGeometry: undefined });
      continue;
    }
    const mediaIdentity = `media:${scene.imageStorage.objectPath}`;
    if (!options.force && scene.imageDisplayGeometry) {
      try {
        const trusted = normalizeTrustedImageDisplayGeometry(scene.imageDisplayGeometry, mediaIdentity);
        hydrated.push({ ...scene, imageDisplayGeometry: trusted });
        cache.set(scene.imageStorage.objectPath, trusted);
        continue;
      } catch { /* Expired or malformed authority is unresolved and retried below. */ }
    }
    if (failed.has(scene.imageStorage.objectPath)) {
      hydrated.push({ ...scene, imageDisplayGeometry: undefined });
      continue;
    }
    try {
      let geometry = cache.get(scene.imageStorage.objectPath);
      if (!geometry) {
        geometry = await resolve(scene.imageStorage);
        geometry = normalizeTrustedImageDisplayGeometry(geometry, mediaIdentity);
        cache.set(scene.imageStorage.objectPath, geometry);
      }
      hydrated.push({ ...scene, imageDisplayGeometry: geometry });
    } catch {
      failed.add(scene.imageStorage.objectPath);
      hydrated.push({ ...scene, imageDisplayGeometry: undefined });
    }
  }
  return Object.freeze({ scenes: hydrated, failedMedia: Object.freeze([...failed]) });
}

/**
 * Attaches only to the same durable media incarnation. Scene order and unrelated
 * user edits may change while the request is pending without misassociation.
 */
export function mergeImageGeometryHydration(
  current: readonly Scene[],
  requested: readonly Scene[],
  hydrated: readonly Scene[],
): Scene[] {
  const results = new Map<string, Scene>();
  requested.forEach((scene, index) => {
    const result = hydrated[index];
    if (result && result.sceneId === scene.sceneId) results.set(scene.sceneId, result);
  });
  return current.map((scene) => {
    const original = requested.find((candidate) => candidate.sceneId === scene.sceneId);
    const result = results.get(scene.sceneId);
    if (!original || !result || !scene.imageStorage || scene.videoStorage
      || original.imageStorage?.objectPath !== scene.imageStorage.objectPath
      || result.imageStorage?.objectPath !== scene.imageStorage.objectPath) return scene;
    return { ...scene, imageDisplayGeometry: result.imageDisplayGeometry };
  });
}

export function commitImageGeometryHydration(input: {
  readonly expectedProjectId: string;
  readonly currentProjectId: string;
  readonly expectedEpoch: number;
  readonly currentEpoch: number;
  readonly current: readonly Scene[];
  readonly requested: readonly Scene[];
  readonly hydrated: readonly Scene[];
}): Scene[] {
  if (input.expectedProjectId !== input.currentProjectId || input.expectedEpoch !== input.currentEpoch) return [...input.current];
  return mergeImageGeometryHydration(input.current, input.requested, input.hydrated);
}
