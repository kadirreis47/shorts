import { afterEach, describe, expect, it, vi } from 'vitest';

const authMocks = vi.hoisted(() => {
  let listener: ((event: string, session: unknown) => void) | null = null;
  return {
    getSession: vi.fn(),
    getUser: vi.fn(),
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
    onAuthStateChange: vi.fn((callback) => {
      listener = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }),
    emit(event: string, session: unknown) { listener?.(event, session); },
  };
});

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { auth: authMocks },
}));

import {
  __resetAuthSessionForTests,
  initializeAuthSession,
  signInWithPassword,
  signOut,
  useAuthSessionStore,
} from '@/auth/session';

const session = { access_token: 'session-token', user: { id: 'user-1' } };
const user = { id: 'user-1', email: 'invited@example.com' };

describe('auth session foundation', () => {
  afterEach(() => {
    delete (globalThis as { window?: Window }).window;
    __resetAuthSessionForTests();
    vi.clearAllMocks();
  });

  it('establishes the independently validated native owner before exposing authenticated state', async () => {
    let release!: (value: { ok: true; result: { ready: true; ownerId: string; changed: boolean } }) => void;
    const establishOwnerContext = vi.fn(() => new Promise((resolve) => { release = resolve; }));
    (globalThis as { window?: Partial<Window> }).window = { electronAPI: { youtube: { establishOwnerContext, clearOwnerContext: vi.fn() } as never } as never };
    authMocks.getSession.mockResolvedValue({ data: { session }, error: null });
    authMocks.getUser.mockResolvedValue({ data: { user }, error: null });
    const pending = initializeAuthSession();
    await vi.waitFor(() => expect(establishOwnerContext).toHaveBeenCalledWith('session-token'));
    expect(useAuthSessionStore.getState().status).toBe('bootstrapping');
    release({ ok: true, result: { ready: true, ownerId: user.id, changed: true } });
    await pending;
    expect(useAuthSessionStore.getState()).toMatchObject({ status: 'authenticated', user });
  });

  it('fails closed when Electron cannot bind the validated Supabase identity', async () => {
    const clearOwnerContext = vi.fn(async () => ({ ok: true, result: { ready: false, changed: false } }));
    (globalThis as { window?: Partial<Window> }).window = { electronAPI: { youtube: { establishOwnerContext: vi.fn(async () => ({ ok: false, error: { code: 'owner-failed', message: 'safe' } })), clearOwnerContext } as never } as never };
    authMocks.getSession.mockResolvedValue({ data: { session }, error: null });
    authMocks.getUser.mockResolvedValue({ data: { user }, error: null });
    await initializeAuthSession();
    expect(useAuthSessionStore.getState()).toMatchObject({ status: 'signed-out', user: null });
    expect(clearOwnerContext).toHaveBeenCalled();
  });

  it('keeps the application signed out when no saved session exists', async () => {
    authMocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
    await initializeAuthSession();
    expect(useAuthSessionStore.getState().status).toBe('signed-out');
    expect(authMocks.getUser).not.toHaveBeenCalled();
  });

  it('validates a restored cached session with getUser before authenticating', async () => {
    authMocks.getSession.mockResolvedValue({ data: { session }, error: null });
    authMocks.getUser.mockResolvedValue({ data: { user }, error: null });
    await initializeAuthSession();
    expect(authMocks.getUser).toHaveBeenCalledWith('session-token');
    expect(useAuthSessionStore.getState()).toMatchObject({ status: 'authenticated', user });
  });

  it('fails closed when a cached session cannot be validated', async () => {
    authMocks.getSession.mockResolvedValue({ data: { session }, error: null });
    authMocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error('expired') });
    await initializeAuthSession();
    expect(useAuthSessionStore.getState()).toMatchObject({ status: 'signed-out', user: null, session: null });
  });

  it('enters the authenticated state only after successful password sign-in validation', async () => {
    authMocks.signInWithPassword.mockResolvedValue({ data: { session }, error: null });
    authMocks.getUser.mockResolvedValue({ data: { user }, error: null });
    await expect(signInWithPassword('invited@example.com', 'not-stored')).resolves.toBe(true);
    expect(authMocks.signInWithPassword).toHaveBeenCalledWith({ email: 'invited@example.com', password: 'not-stored' });
    expect(useAuthSessionStore.getState().status).toBe('authenticated');
  });

  it('keeps a failed sign-in safely gated', async () => {
    authMocks.signInWithPassword.mockResolvedValue({ data: { session: null }, error: new Error('Invalid login credentials') });
    await expect(signInWithPassword('invited@example.com', 'wrong')).resolves.toBe(false);
    expect(useAuthSessionStore.getState()).toMatchObject({ status: 'signed-out', user: null });
    expect(useAuthSessionStore.getState().error).toBe('Email or password is incorrect.');
  });

  it('reacts to expiry/sign-out and registers only one auth listener', async () => {
    authMocks.getSession.mockResolvedValue({ data: { session }, error: null });
    authMocks.getUser.mockResolvedValue({ data: { user }, error: null });
    await Promise.all([initializeAuthSession(), initializeAuthSession()]);
    expect(authMocks.onAuthStateChange).toHaveBeenCalledTimes(1);
    authMocks.emit('SIGNED_OUT', null);
    expect(useAuthSessionStore.getState()).toMatchObject({ status: 'signed-out', user: null });
    await signOut();
    expect(authMocks.signOut).toHaveBeenCalledOnce();
  });
});
