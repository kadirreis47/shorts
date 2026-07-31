import { createJSONStorage } from 'zustand/middleware';
import { indexedDBStorage } from '@/persistence/indexedDBStorage';

export function createPersistentStorage<T>() {
  return createJSONStorage<T>(() => indexedDBStorage);
}
