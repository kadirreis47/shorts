import { describe, expect, it, vi } from 'vitest';
import { ServiceContainer } from '@/core/di/container';
import type { DependencyToken } from '@/core/di/types';

const token = <T>(name: string) => Symbol(name) as DependencyToken<T>;

describe('ServiceContainer', () => {
  it('value, singleton ve factory kayıtlarını doğru çözümler', () => {
    const container = new ServiceContainer();
    const valueToken = token<number>('value');
    const singletonToken = token<{ id: number }>('singleton');
    const factoryToken = token<{ id: number }>('factory');
    const singletonFactory = vi.fn(() => ({ id: 1 }));
    let factoryId = 0;

    container.registerValue(valueToken, 42);
    container.registerSingleton(singletonToken, singletonFactory);
    container.registerFactory(factoryToken, () => ({ id: ++factoryId }));

    expect(container.resolve(valueToken)).toBe(42);
    expect(container.resolve(singletonToken)).toBe(container.resolve(singletonToken));
    expect(singletonFactory).toHaveBeenCalledOnce();
    expect(container.resolve(factoryToken)).not.toBe(container.resolve(factoryToken));
  });

  it('eksik token için açıklayıcı hata verir', () => {
    const container = new ServiceContainer();
    expect(() => container.resolve(token('missing'))).toThrow('Dependency is not registered: missing');
  });

  it('circular dependency algılar', () => {
    const container = new ServiceContainer();
    const a = token<string>('a');
    const b = token<string>('b');
    container.registerSingleton(a, (scope) => scope.resolve(b));
    container.registerSingleton(b, (scope) => scope.resolve(a));
    expect(() => container.resolve(a)).toThrow('Circular dependency detected: a');
  });

  it('reset kayıtları ve singleton instance durumunu kaldırır', () => {
    const container = new ServiceContainer();
    const service = token<object>('service');
    container.registerSingleton(service, () => ({}));
    container.resolve(service);
    container.reset();
    expect(container.has(service)).toBe(false);
    expect(() => container.resolve(service)).toThrow();
  });
});
