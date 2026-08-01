import type { RenderOutput } from './types';

export interface RenderCacheEntry {
  fingerprint: string;
  projectId: string;
  adapterId: string;
  output: RenderOutput;
  createdAt: string;
  lastAccessedAt: string;
  hitCount: number;
  savedRenderMs: number;
}

export interface RenderCacheStats {
  entries: number;
  hits: number;
  misses: number;
  invalidEntries: number;
  savedRenderMs: number;
}

export interface RenderCache {
  get(
    fingerprint: string,
    outputExists?: (uri: string) => Promise<boolean>,
  ): Promise<RenderCacheEntry | null>;
  put(entry: Omit<RenderCacheEntry, 'createdAt' | 'lastAccessedAt' | 'hitCount'>): void;
  remove(fingerprint: string): void;
  clear(): void;
  stats(): RenderCacheStats;
}

interface PersistedRenderCache {
  entries: RenderCacheEntry[];
  stats: RenderCacheStats;
}

const STORAGE_KEY = 'shortsflow.render-cache.v1';
const MAX_ENTRIES = 50;

export function createRenderCache(): RenderCache {
  const state = loadState();

  return {
    async get(fingerprint, outputExists) {
      const entry = state.entries.find((candidate) => candidate.fingerprint === fingerprint);
      if (!entry) {
        state.stats.misses += 1;
        persist(state);
        return null;
      }

      if (outputExists && !(await outputExists(entry.output.uri))) {
        state.entries = state.entries.filter(
          (candidate) => candidate.fingerprint !== fingerprint,
        );
        state.stats.invalidEntries += 1;
        state.stats.entries = state.entries.length;
        state.stats.misses += 1;
        persist(state);
        return null;
      }

      entry.hitCount += 1;
      entry.lastAccessedAt = new Date().toISOString();
      state.stats.hits += 1;
      state.stats.savedRenderMs += entry.savedRenderMs;
      persist(state);
      return cloneEntry(entry);
    },

    put(entry) {
      const now = new Date().toISOString();
      const existingIndex = state.entries.findIndex(
        (candidate) => candidate.fingerprint === entry.fingerprint,
      );
      const next: RenderCacheEntry = {
        ...entry,
        createdAt:
          existingIndex >= 0 ? state.entries[existingIndex].createdAt : now,
        lastAccessedAt: now,
        hitCount: existingIndex >= 0 ? state.entries[existingIndex].hitCount : 0,
      };

      if (existingIndex >= 0) state.entries.splice(existingIndex, 1);
      state.entries.unshift(next);
      state.entries = state.entries
        .sort(
          (left, right) =>
            Date.parse(right.lastAccessedAt) - Date.parse(left.lastAccessedAt),
        )
        .slice(0, MAX_ENTRIES);
      state.stats.entries = state.entries.length;
      persist(state);
    },

    remove(fingerprint) {
      state.entries = state.entries.filter(
        (candidate) => candidate.fingerprint !== fingerprint,
      );
      state.stats.entries = state.entries.length;
      persist(state);
    },

    clear() {
      state.entries = [];
      state.stats = createEmptyStats();
      persist(state);
    },

    stats() {
      return { ...state.stats, entries: state.entries.length };
    },
  };
}

function loadState(): PersistedRenderCache {
  if (typeof localStorage === 'undefined') {
    return { entries: [], stats: createEmptyStats() };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { entries: [], stats: createEmptyStats() };
    const parsed = JSON.parse(raw) as Partial<PersistedRenderCache>;
    const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
    return {
      entries,
      stats: {
        ...createEmptyStats(),
        ...(parsed.stats ?? {}),
        entries: entries.length,
      },
    };
  } catch {
    return { entries: [], stats: createEmptyStats() };
  }
}

function persist(state: PersistedRenderCache): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Cache persistence failure must never stop rendering.
  }
}

function createEmptyStats(): RenderCacheStats {
  return {
    entries: 0,
    hits: 0,
    misses: 0,
    invalidEntries: 0,
    savedRenderMs: 0,
  };
}

function cloneEntry(entry: RenderCacheEntry): RenderCacheEntry {
  return {
    ...entry,
    output: {
      ...entry.output,
      metadata: { ...entry.output.metadata },
    },
  };
}
