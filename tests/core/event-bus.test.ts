import { describe, expect, it, vi } from 'vitest';
import { TypedEventBus } from '@/core/events/eventBus';

interface Events extends Record<string, unknown> {
  message: { value: number };
}

describe('TypedEventBus', () => {
  it('on/emit, unsubscribe ve listener count davranışını korur', async () => {
    const bus = new TypedEventBus<Events>();
    const listener = vi.fn();
    const unsubscribe = bus.on('message', listener);
    expect(bus.listenerCount('message')).toBe(1);
    await bus.emit('message', { value: 7 });
    expect(listener).toHaveBeenCalledWith({ value: 7 });
    unsubscribe();
    expect(bus.listenerCount('message')).toBe(0);
  });

  it('once listenerını yalnızca bir kez çalıştırır', async () => {
    const bus = new TypedEventBus<Events>();
    const listener = vi.fn();
    bus.once('message', listener);
    await bus.emit('message', { value: 1 });
    await bus.emit('message', { value: 2 });
    expect(listener).toHaveBeenCalledOnce();
  });

  it('hatalı listener diğer listenerı engellemez', async () => {
    const bus = new TypedEventBus<Events>();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const healthy = vi.fn();
    bus.on('message', () => { throw new Error('listener failed'); });
    bus.on('message', healthy);
    await bus.emit('message', { value: 3 });
    expect(healthy).toHaveBeenCalledOnce();
  });

  it('tek event veya tüm eventler için clear uygular', () => {
    const bus = new TypedEventBus<Events>();
    bus.on('message', vi.fn());
    bus.clear('message');
    expect(bus.listenerCount('message')).toBe(0);
    bus.on('message', vi.fn());
    bus.clear();
    expect(bus.listenerCount('message')).toBe(0);
  });
});
