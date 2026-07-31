import type {
  QueryClient,
  QueryKey,
  QueryOptions,
  QueryState,
} from './types';

const DEFAULT_STALE_TIME = 30_000;

function serializeKey(key: QueryKey): string {
  return JSON.stringify(key);
}

function matchesPrefix(serializedKey: string, prefix?: QueryKey): boolean {
  if (!prefix) return true;

  const fullKey = JSON.parse(serializedKey) as unknown[];
  return prefix.every((part, index) => Object.is(fullKey[index], part));
}

export class InMemoryQueryClient implements QueryClient {
  private readonly cache = new Map<string, QueryState>();

  async fetchQuery<TData>({
    key,
    queryFn,
    staleTime = DEFAULT_STALE_TIME,
    force = false,
  }: QueryOptions<TData>): Promise<TData> {
    const serializedKey = serializeKey(key);
    const cached = this.cache.get(serializedKey) as QueryState<TData> | undefined;
    const now = Date.now();

    if (!force && cached?.data !== undefined && cached.staleAt > now) {
      return cached.data;
    }

    if (cached?.promise) {
      return cached.promise;
    }

    const promise = queryFn()
      .then((data) => {
        this.cache.set(serializedKey, {
          data,
          updatedAt: Date.now(),
          staleAt: Date.now() + staleTime,
        });
        return data;
      })
      .catch((error) => {
        this.cache.set(serializedKey, {
          data: cached?.data,
          error,
          updatedAt: cached?.updatedAt ?? 0,
          staleAt: 0,
        });
        throw error;
      });

    this.cache.set(serializedKey, {
      ...cached,
      promise,
      error: undefined,
      updatedAt: cached?.updatedAt ?? 0,
      staleAt: cached?.staleAt ?? 0,
    });

    return promise;
  }

  getQueryData<TData>(key: QueryKey): TData | undefined {
    return this.cache.get(serializeKey(key))?.data as TData | undefined;
  }

  setQueryData<TData>(
    key: QueryKey,
    data: TData,
    staleTime = DEFAULT_STALE_TIME,
  ): TData {
    const now = Date.now();
    this.cache.set(serializeKey(key), {
      data,
      updatedAt: now,
      staleAt: now + staleTime,
    });
    return data;
  }

  updateQueryData<TData>(
    key: QueryKey,
    updater: (current: TData | undefined) => TData,
    staleTime = DEFAULT_STALE_TIME,
  ): TData {
    const next = updater(this.getQueryData<TData>(key));
    return this.setQueryData(key, next, staleTime);
  }

  invalidateQueries(key?: QueryKey): void {
    for (const [serializedKey, state] of this.cache.entries()) {
      if (matchesPrefix(serializedKey, key)) {
        this.cache.set(serializedKey, { ...state, staleAt: 0 });
      }
    }
  }

  removeQueries(key?: QueryKey): void {
    for (const serializedKey of this.cache.keys()) {
      if (matchesPrefix(serializedKey, key)) {
        this.cache.delete(serializedKey);
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }
}

export function createQueryClient(): QueryClient {
  return new InMemoryQueryClient();
}
