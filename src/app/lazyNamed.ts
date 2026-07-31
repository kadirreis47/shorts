import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

export type LazyViewComponent = ComponentType<any>;

export function lazyNamed(
  importer: () => Promise<Record<string, LazyViewComponent>>,
  exportName: string,
): LazyExoticComponent<LazyViewComponent> {
  return lazy(async () => {
    const module = await importer();
    const component = module[exportName];

    if (!component) {
      throw new Error(`Beklenen React bileşeni bulunamadı: ${exportName}`);
    }

    return { default: component };
  });
}
