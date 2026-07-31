import type {
  EventBus,
  EventHandler,
  EventMap,
  Unsubscribe,
} from './types';

export class TypedEventBus<TEvents extends EventMap>
  implements EventBus<TEvents>
{
  private readonly listeners = new Map<
    keyof TEvents,
    Set<EventHandler<TEvents[keyof TEvents]>>
  >();

  on<TKey extends keyof TEvents>(
    event: TKey,
    handler: EventHandler<TEvents[TKey]>,
  ): Unsubscribe {
    const handlers = this.getOrCreateHandlers(event);
    handlers.add(handler as EventHandler<TEvents[keyof TEvents]>);

    return () => {
      this.remove(event, handler);
    };
  }

  once<TKey extends keyof TEvents>(
    event: TKey,
    handler: EventHandler<TEvents[TKey]>,
  ): Unsubscribe {
    let unsubscribe: Unsubscribe = () => undefined;

    const onceHandler: EventHandler<TEvents[TKey]> = async (payload) => {
      unsubscribe();
      await handler(payload);
    };

    unsubscribe = this.on(event, onceHandler);
    return unsubscribe;
  }

  async emit<TKey extends keyof TEvents>(
    event: TKey,
    payload: TEvents[TKey],
  ): Promise<void> {
    const handlers = this.listeners.get(event);
    if (!handlers || handlers.size === 0) return;

    const snapshot = Array.from(handlers) as Array<
      EventHandler<TEvents[TKey]>
    >;

    const results = await Promise.allSettled(
      snapshot.map((handler) => Promise.resolve(handler(payload))),
    );

    const failures = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );

    if (failures.length > 0) {
      console.error(
        `[EventBus] ${String(event)} eventinde ${failures.length} listener başarısız oldu.`,
        failures.map((failure) => failure.reason),
      );
    }
  }

  clear<TKey extends keyof TEvents>(event?: TKey): void {
    if (event === undefined) {
      this.listeners.clear();
      return;
    }

    this.listeners.delete(event);
  }

  listenerCount<TKey extends keyof TEvents>(event: TKey): number {
    return this.listeners.get(event)?.size ?? 0;
  }

  private getOrCreateHandlers<TKey extends keyof TEvents>(event: TKey) {
    let handlers = this.listeners.get(event);

    if (!handlers) {
      handlers = new Set<EventHandler<TEvents[keyof TEvents]>>();
      this.listeners.set(event, handlers);
    }

    return handlers;
  }

  private remove<TKey extends keyof TEvents>(
    event: TKey,
    handler: EventHandler<TEvents[TKey]>,
  ) {
    const handlers = this.listeners.get(event);
    if (!handlers) return;

    handlers.delete(handler as EventHandler<TEvents[keyof TEvents]>);

    if (handlers.size === 0) {
      this.listeners.delete(event);
    }
  }
}
