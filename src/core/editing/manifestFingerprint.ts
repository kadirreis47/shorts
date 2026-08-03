import type { RenderManifest } from '@/core/media';
import { stableId } from './utils';

/** Increment when canonical fingerprint semantics change. Older snapshots are stale. */
export const MANIFEST_FINGERPRINT_VERSION = 2;

/**
 * Fingerprints all editable RenderManifest state. Top-level creation time and the
 * derived validation report are intentionally excluded: neither changes rendered
 * content, and validation is independently bound to the resulting fingerprint.
 */
export function createManifestRevisionId(manifest: RenderManifest): string {
  const editableManifest = Object.fromEntries(
    Object.entries(manifest).filter(([key]) => key !== 'createdAt' && key !== 'validation'),
  );
  return stableId(`manifest-v${MANIFEST_FINGERPRINT_VERSION}`, canonicalSerialize(editableManifest));
}

export function canonicalSerialize(value: unknown): string {
  return serialize(value, new WeakSet<object>());
}

function serialize(value: unknown, ancestors: WeakSet<object>): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : 'null';
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') return 'null';
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (ancestors.has(value)) throw new TypeError('Cannot fingerprint a cyclic manifest value.');
  ancestors.add(value);
  try {
    if (Array.isArray(value)) return `[${value.map((item) => serialize(item, ancestors)).join(',')}]`;
    if (value instanceof Map) {
      const entries = [...value.entries()].map(([key, item]) => [serialize(key, ancestors), serialize(item, ancestors)] as const)
        .sort(([left], [right]) => left.localeCompare(right));
      return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${item}`).join(',')}}`;
    }
    if (value instanceof Set) return `[${[...value].map((item) => serialize(item, ancestors)).sort().join(',')}]`;
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record).sort().flatMap((key) => {
      const item = record[key];
      return typeof item === 'undefined' || typeof item === 'function' || typeof item === 'symbol'
        ? []
        : [`${JSON.stringify(key)}:${serialize(item, ancestors)}`];
    });
    return `{${entries.join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}
