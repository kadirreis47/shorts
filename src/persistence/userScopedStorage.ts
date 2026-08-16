import type { StateStorage } from 'zustand/middleware';
import { getValidatedOwnerId } from '@/auth/identity';
import { indexedDBStorage } from '@/persistence/indexedDBStorage';

interface OwnerEnvelope {
  ownerId: string;
  value: string;
}

const PREFIX = 'shortsflow:user:';

export function currentPersistenceOwnerId(): string | null {
  return getValidatedOwnerId();
}

export function userScopedStorageKey(name: string, ownerId = currentPersistenceOwnerId()): string | null {
  return ownerId ? `${PREFIX}${ownerId}:${name}` : null;
}

function wrap(ownerId: string, value: string): string {
  return JSON.stringify({ ownerId, value } satisfies OwnerEnvelope);
}

function unwrap(raw: string | null, ownerId: string): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<OwnerEnvelope>;
    return parsed.ownerId === ownerId && typeof parsed.value === 'string' ? parsed.value : null;
  } catch {
    return null;
  }
}

/** Private durable data only. Unscoped legacy keys are intentionally never read. */
export const userScopedStateStorage: StateStorage = {
  async getItem(name) {
    const ownerId = currentPersistenceOwnerId();
    const key = userScopedStorageKey(name, ownerId);
    return key && ownerId ? unwrap(await indexedDBStorage.getItem(key), ownerId) : null;
  },
  async setItem(name, value) {
    const ownerId = currentPersistenceOwnerId();
    const key = userScopedStorageKey(name, ownerId);
    if (key && ownerId) await indexedDBStorage.setItem(key, wrap(ownerId, value));
  },
  async removeItem(name) {
    const key = userScopedStorageKey(name);
    if (key) await indexedDBStorage.removeItem(key);
  },
};

export function readUserScopedLocalStorage(name: string): string | null {
  const ownerId = currentPersistenceOwnerId();
  const key = userScopedStorageKey(name, ownerId);
  if (!ownerId || !key || typeof localStorage === 'undefined') return null;
  return unwrap(localStorage.getItem(key), ownerId);
}

export function writeUserScopedLocalStorage(name: string, value: string): void {
  const ownerId = currentPersistenceOwnerId();
  const key = userScopedStorageKey(name, ownerId);
  if (!ownerId || !key || typeof localStorage === 'undefined') return;
  localStorage.setItem(key, wrap(ownerId, value));
}

export function removeUserScopedLocalStorage(name: string): void {
  const key = userScopedStorageKey(name);
  if (key && typeof localStorage !== 'undefined') localStorage.removeItem(key);
}
