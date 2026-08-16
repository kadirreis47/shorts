import { createJSONStorage } from 'zustand/middleware';
import { userScopedStateStorage } from '@/persistence/userScopedStorage';

export function createPersistentStorage<T>() {
  return createJSONStorage<T>(() => userScopedStateStorage);
}
