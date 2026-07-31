import type { StateStorage } from 'zustand/middleware';

const DATABASE_NAME = 'shortsflow';
const DATABASE_VERSION = 1;
const STORE_NAME = 'zustand';

let databasePromise: Promise<IDBDatabase> | null = null;

function canUseIndexedDB() {
  return typeof window !== 'undefined' && 'indexedDB' in window;
}

function openDatabase() {
  if (!canUseIndexedDB()) {
    return Promise.reject(new Error('IndexedDB is not available.'));
  }

  if (!databasePromise) {
    databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME);
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB could not be opened.'));
      request.onblocked = () => reject(new Error('IndexedDB upgrade was blocked.'));
    });
  }

  return databasePromise;
}

async function runTransaction<T>(
  mode: IDBTransactionMode,
  execute: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const database = await openDatabase();

  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = execute(transaction.objectStore(STORE_NAME));

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction was aborted.'));
  });
}

function getFallbackStorage() {
  if (typeof window === 'undefined') return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export const indexedDBStorage: StateStorage = {
  async getItem(name) {
    try {
      const value = await runTransaction<string | undefined>('readonly', (store) => store.get(name));
      if (value !== undefined) return value;

      const legacyValue = getFallbackStorage()?.getItem(name) ?? null;
      if (legacyValue !== null) {
        await runTransaction<IDBValidKey>('readwrite', (store) =>
          store.put(legacyValue, name),
        );
        getFallbackStorage()?.removeItem(name);
      }

      return legacyValue;
    } catch (error) {
      console.warn(`[Persistence] IndexedDB read failed for "${name}". Falling back to localStorage.`, error);
      return getFallbackStorage()?.getItem(name) ?? null;
    }
  },

  async setItem(name, value) {
    try {
      await runTransaction<IDBValidKey>('readwrite', (store) => store.put(value, name));
    } catch (error) {
      console.warn(`[Persistence] IndexedDB write failed for "${name}". Falling back to localStorage.`, error);
      getFallbackStorage()?.setItem(name, value);
    }
  },

  async removeItem(name) {
    try {
      await runTransaction<undefined>('readwrite', (store) => store.delete(name));
    } catch (error) {
      console.warn(`[Persistence] IndexedDB delete failed for "${name}". Falling back to localStorage.`, error);
      getFallbackStorage()?.removeItem(name);
    }
  },
};
