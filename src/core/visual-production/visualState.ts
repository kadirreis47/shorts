import type { MediaClip, RenderManifest } from '@/core/media';
import type { VisualOperationScope } from './types';

export interface StoredVisualOperation {
  readonly operationId: string;
  readonly type: string;
  readonly scope: VisualOperationScope;
  readonly parameters: Readonly<Record<string, unknown>>;
}

export function getSceneVideoClips(manifest: RenderManifest, sceneId: string): MediaClip[] {
  return manifest.timeline.tracks
    .filter((track) => track.type === 'video')
    .flatMap((track) => track.clips.filter((clip) => clip.sceneId === sceneId));
}

export function getSceneVisualOperations(manifest: RenderManifest, sceneId: string): readonly StoredVisualOperation[] {
  const stored = getSceneVideoClips(manifest, sceneId)
    .flatMap((clip) => parseVisualOperations(clip.metadata.visualProduction));
  return deduplicateSceneVisualOperations(stored, sceneId);
}

export function deduplicateSceneVisualOperations(
  operations: readonly StoredVisualOperation[],
  sceneId = 'unknown',
): readonly StoredVisualOperation[] {
  const unique = new Map<string, StoredVisualOperation>();
  const signatures = new Map<string, string>();
  for (const operation of operations) {
    const signature = canonicalOperation(operation);
    const existing = signatures.get(operation.operationId);
    if (existing !== undefined && existing !== signature) {
      throw new Error(`Conflicting visual operation payload for "${operation.operationId}" in scene "${sceneId}"; render was rejected.`);
    }
    if (existing === undefined) {
      signatures.set(operation.operationId, signature);
      unique.set(operation.operationId, operation);
    }
  }
  return [...unique.values()].sort((left, right) => left.operationId.localeCompare(right.operationId));
}

export function parseVisualOperations(value: unknown): StoredVisualOperation[] {
  if (!Array.isArray(value)) return [];
  return value.filter(record).flatMap((item) => typeof item.operationId === 'string' && typeof item.type === 'string' && (item.scope === 'scene' || item.scope === 'asset-global') && record(item.parameters)
    ? [{ operationId: item.operationId, type: item.type, scope: item.scope, parameters: item.parameters }]
    : []);
}

export function resolveVisualRerenderSceneIds(manifest: RenderManifest, directlyChangedSceneIds: readonly string[]): string[] {
  const direct = new Set(directlyChangedSceneIds);
  const scenes = manifest.timeline.scenes;
  const result = new Set(direct);
  for (const sceneId of direct) {
    const index = scenes.findIndex((scene) => scene.id === sceneId);
    if (index < 0) continue;
    const scene = scenes[index];
    const previous = scenes[index - 1];
    const next = scenes[index + 1];
    if (previous && (scene.overlapBeforeMs > 0 || previous.overlapAfterMs > 0 || scene.transition.type !== 'cut')) result.add(previous.id);
    if (next && (scene.overlapAfterMs > 0 || next.overlapBeforeMs > 0 || next.transition.type !== 'cut')) result.add(next.id);
  }
  return [...result].sort();
}

export function resolveAssetReferenceSceneIds(manifest: RenderManifest, assetIds: readonly string[]): string[] {
  const ids = new Set(assetIds);
  return manifest.timeline.scenes.filter((scene) => scene.assetIds.some((id) => ids.has(id))).map((scene) => scene.id).sort();
}

function canonicalOperation(operation: StoredVisualOperation): string {
  return JSON.stringify(sortValue({ type: operation.type, scope: operation.scope, parameters: operation.parameters }));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (record(value)) return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, nested]) => [key, sortValue(nested)]));
  return value;
}

function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
