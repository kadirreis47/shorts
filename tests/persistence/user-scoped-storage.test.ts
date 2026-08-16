/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthSessionStore } from '@/auth/session';
import { setValidatedOwnerId } from '@/auth/identity';
import { readUserScopedLocalStorage, userScopedStorageKey, writeUserScopedLocalStorage } from '@/persistence/userScopedStorage';
import { createPersistentStorage } from '@/persistence/storeStorage';
import { clearStudioDraft, loadStudioDraft, saveStudioDraft } from '@/lib/studioDraft';

function authenticate(id: string) {
  setValidatedOwnerId(id);
  useAuthSessionStore.setState({ status: 'authenticated', user: { id } as never, session: { access_token: 'token' } as never, error: null });
}

describe('user-scoped local persistence', () => {
  beforeEach(() => { localStorage.clear(); useAuthSessionStore.setState({ status: 'signed-out', user: null, session: null, error: null }); });

  it('isolates durable state between Supabase user IDs and never reads legacy global data', () => {
    localStorage.setItem('legacy-private-key', 'legacy');
    authenticate('user-a');
    writeUserScopedLocalStorage('private-key', 'A');
    expect(readUserScopedLocalStorage('private-key')).toBe('A');
    authenticate('user-b');
    expect(readUserScopedLocalStorage('private-key')).toBeNull();
    writeUserScopedLocalStorage('private-key', 'B');
    authenticate('user-a');
    expect(readUserScopedLocalStorage('private-key')).toBe('A');
    expect(readUserScopedLocalStorage('legacy-private-key')).toBeNull();
  });

  it('rejects an envelope whose owner does not match the active identity', () => {
    authenticate('user-a');
    const key = userScopedStorageKey('private-key')!;
    localStorage.setItem(key, JSON.stringify({ ownerId: 'user-b', value: 'not-for-a' }));
    expect(readUserScopedLocalStorage('private-key')).toBeNull();
  });

  it('keeps Studio drafts in the owning user namespace', () => {
    authenticate('user-a');
    saveStudioDraft({ version: 1, savedAt: 'now' } as never);
    authenticate('user-b');
    expect(loadStudioDraft()).toBeNull();
    authenticate('user-a');
    expect(loadStudioDraft()?.savedAt).toBe('now');
    clearStudioDraft();
    expect(loadStudioDraft()).toBeNull();
  });

  it('does not persist private values while signed out', () => {
    writeUserScopedLocalStorage('private-key', 'blocked');
    expect([...Array(localStorage.length)].map((_, index) => localStorage.key(index))).not.toContain('private-key');
  });

  it('scopes export and publishing queue storage through the shared Zustand contract', async () => {
    const storage = createPersistentStorage<{ queue: string }>()!;
    authenticate('user-a');
    await storage.setItem('shortsflow-export-intelligence', { state: { queue: 'export-a' }, version: 1 });
    await storage.setItem('shortsflow-publishing', { state: { queue: 'publish-a' }, version: 1 });
    authenticate('user-b');
    expect(await storage.getItem('shortsflow-export-intelligence')).toBeNull();
    expect(await storage.getItem('shortsflow-publishing')).toBeNull();
    authenticate('user-a');
    expect(await storage.getItem('shortsflow-export-intelligence')).toMatchObject({ state: { queue: 'export-a' } });
    expect(await storage.getItem('shortsflow-publishing')).toMatchObject({ state: { queue: 'publish-a' } });
  });
});
