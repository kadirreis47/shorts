export type EventMap = Record<string, unknown>;

export type EventHandler<TPayload> = (payload: TPayload) => void | Promise<void>;

export type Unsubscribe = () => void;

export interface EventBus<TEvents extends EventMap> {
  on<TKey extends keyof TEvents>(
    event: TKey,
    handler: EventHandler<TEvents[TKey]>,
  ): Unsubscribe;
  once<TKey extends keyof TEvents>(
    event: TKey,
    handler: EventHandler<TEvents[TKey]>,
  ): Unsubscribe;
  emit<TKey extends keyof TEvents>(
    event: TKey,
    payload: TEvents[TKey],
  ): Promise<void>;
  clear<TKey extends keyof TEvents>(event?: TKey): void;
  listenerCount<TKey extends keyof TEvents>(event: TKey): number;
}
