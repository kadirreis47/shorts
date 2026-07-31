export type DependencyToken<T> = symbol & { readonly __type?: T };

export type DependencyFactory<T> = (container: DependencyContainer) => T;

export interface DependencyContainer {
  registerValue<T>(token: DependencyToken<T>, value: T): void;
  registerSingleton<T>(token: DependencyToken<T>, factory: DependencyFactory<T>): void;
  registerFactory<T>(token: DependencyToken<T>, factory: DependencyFactory<T>): void;
  resolve<T>(token: DependencyToken<T>): T;
  has<T>(token: DependencyToken<T>): boolean;
  reset(): void;
}
