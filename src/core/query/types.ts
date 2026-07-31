export type QueryKey = readonly unknown[];

export interface QueryOptions<TData> {
  key: QueryKey;
  queryFn: () => Promise<TData>;
  staleTime?: number;
  force?: boolean;
}

export interface QueryState<TData = unknown> {
  data?: TData;
  error?: unknown;
  updatedAt: number;
  staleAt: number;
  promise?: Promise<TData>;
}

export interface QueryClient {
  fetchQuery<TData>(options: QueryOptions<TData>): Promise<TData>;
  getQueryData<TData>(key: QueryKey): TData | undefined;
  setQueryData<TData>(key: QueryKey, data: TData, staleTime?: number): TData;
  updateQueryData<TData>(
    key: QueryKey,
    updater: (current: TData | undefined) => TData,
    staleTime?: number,
  ): TData;
  invalidateQueries(key?: QueryKey): void;
  removeQueries(key?: QueryKey): void;
  clear(): void;
}
