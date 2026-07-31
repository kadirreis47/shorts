import type { AssetCandidate, AssetSearchQuery } from './assetProviderTypes';

interface CacheEntry {
  expiresAt: number;
  candidates: AssetCandidate[];
}

export interface AssetSearchCache {
  get(providerId: string, query: AssetSearchQuery): AssetCandidate[] | null;
  set(providerId: string, query: AssetSearchQuery, candidates: AssetCandidate[]): void;
  clear(): void;
}

export function createAssetSearchCache(ttlMs = 5 * 60_000): AssetSearchCache {
  const entries = new Map<string, CacheEntry>();

  return {
    get(providerId, query) {
      const key = createKey(providerId, query);
      const entry = entries.get(key);
      if (!entry) return null;
      if (entry.expiresAt <= Date.now()) {
        entries.delete(key);
        return null;
      }
      return entry.candidates.map((candidate) => ({ ...candidate }));
    },
    set(providerId, query, candidates) {
      entries.set(createKey(providerId, query), {
        expiresAt: Date.now() + ttlMs,
        candidates: candidates.map((candidate) => ({ ...candidate })),
      });
    },
    clear() {
      entries.clear();
    },
  };
}

function createKey(providerId: string, query: AssetSearchQuery): string {
  return `${providerId}:${query.preferredTypes.join(',')}:${query.queries.join('|')}`.toLocaleLowerCase();
}
