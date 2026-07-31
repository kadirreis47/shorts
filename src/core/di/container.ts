import type {
  DependencyContainer,
  DependencyFactory,
  DependencyToken,
} from './types';

type Registration<T> =
  | { kind: 'value'; value: T }
  | { kind: 'singleton'; factory: DependencyFactory<T>; instance?: T }
  | { kind: 'factory'; factory: DependencyFactory<T> };

export class ServiceContainer implements DependencyContainer {
  private readonly registrations = new Map<symbol, Registration<unknown>>();
  private readonly resolving = new Set<symbol>();

  registerValue<T>(token: DependencyToken<T>, value: T) {
    this.registrations.set(token, { kind: 'value', value });
  }

  registerSingleton<T>(token: DependencyToken<T>, factory: DependencyFactory<T>) {
    this.registrations.set(token, { kind: 'singleton', factory });
  }

  registerFactory<T>(token: DependencyToken<T>, factory: DependencyFactory<T>) {
    this.registrations.set(token, { kind: 'factory', factory });
  }

  resolve<T>(token: DependencyToken<T>): T {
    const registration = this.registrations.get(token) as Registration<T> | undefined;

    if (!registration) {
      throw new Error(`Dependency is not registered: ${String(token.description ?? token)}`);
    }

    if (this.resolving.has(token)) {
      throw new Error(`Circular dependency detected: ${String(token.description ?? token)}`);
    }

    if (registration.kind === 'value') {
      return registration.value;
    }

    if (registration.kind === 'singleton' && registration.instance !== undefined) {
      return registration.instance;
    }

    this.resolving.add(token);

    try {
      const instance = registration.factory(this);

      if (registration.kind === 'singleton') {
        registration.instance = instance;
      }

      return instance;
    } finally {
      this.resolving.delete(token);
    }
  }

  has<T>(token: DependencyToken<T>) {
    return this.registrations.has(token);
  }

  reset() {
    this.registrations.clear();
    this.resolving.clear();
  }
}

export const applicationContainer = new ServiceContainer();
