import type { Session, User } from '@supabase/supabase-js';
import { create } from 'zustand';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { setValidatedOwnerId } from '@/auth/identity';

export type AuthSessionStatus = 'bootstrapping' | 'authenticated' | 'signed-out' | 'error';

interface AuthSessionState {
  status: AuthSessionStatus;
  user: User | null;
  session: Session | null;
  error: string | null;
}

const initialState: AuthSessionState = {
  status: 'bootstrapping',
  user: null,
  session: null,
  error: null,
};

export const useAuthSessionStore = create<AuthSessionState>()(() => initialState);

let initialized = false;
let initializationPromise: Promise<void> | null = null;
let authSubscription: { unsubscribe: () => void } | null = null;
let validationVersion = 0;

function setSignedOut(error: string | null = null) {
  setValidatedOwnerId(null);
  useAuthSessionStore.setState({
    status: 'signed-out',
    user: null,
    session: null,
    error,
  });
}

async function clearNativeOwnerContext() {
  if (typeof window === 'undefined') return;
  try { await window.electronAPI?.youtube.clearOwnerContext?.(); } catch { /* Signed-out renderer state remains authoritative while native cleanup fails closed on restart. */ }
}

async function establishNativeOwnerContext(accessToken: string, expectedOwnerId: string) {
  if (typeof window === 'undefined') return;
  const youtube = window.electronAPI?.youtube;
  if (!youtube) return;
  if (typeof youtube.establishOwnerContext !== 'function') throw new Error('Native owner validation is unavailable.');
  const result = await youtube.establishOwnerContext(accessToken);
  if (!result.ok || !result.result.ready || result.result.ownerId !== expectedOwnerId) throw new Error('Native owner validation failed.');
}

function safeAuthenticationError(error: unknown, fallback: string): string {
  if (error instanceof Error && /invalid login credentials/i.test(error.message)) {
    return 'Email or password is incorrect.';
  }

  return fallback;
}

async function validateSession(session: Session | null, invalidSessionMessage: string | null = null) {
  const version = ++validationVersion;

  if (!session?.access_token) {
    await clearNativeOwnerContext();
    if (version === validationVersion) setSignedOut(invalidSessionMessage);
    return;
  }

  if (useAuthSessionStore.getState().status !== 'authenticated') {
    useAuthSessionStore.setState({ status: 'bootstrapping', error: null });
  }

  try {
    const { data, error } = await supabase.auth.getUser(session.access_token);

    if (version !== validationVersion) return;

    if (error || !data.user) {
      await clearNativeOwnerContext();
      if (version !== validationVersion) return;
      setSignedOut(invalidSessionMessage ?? 'Your session is no longer valid. Please sign in again.');
      void supabase.auth.signOut({ scope: 'local' });
      return;
    }

    await establishNativeOwnerContext(session.access_token, data.user.id);
    if (version !== validationVersion) return;

    const priorUserId = useAuthSessionStore.getState().user?.id ?? null;
    if (priorUserId !== data.user.id) {
      setValidatedOwnerId(data.user.id);
      useAuthSessionStore.setState({ status: 'bootstrapping', user: null, session: null, error: null });
    }

    setValidatedOwnerId(data.user.id);

    useAuthSessionStore.setState({
      status: 'authenticated',
      user: data.user,
      session,
      error: null,
    });
  } catch (error) {
    if (version !== validationVersion) return;
    await clearNativeOwnerContext();
    if (version !== validationVersion) return;
    setSignedOut(safeAuthenticationError(error, 'Your session could not be verified. Please sign in again.'));
    void supabase.auth.signOut({ scope: 'local' });
  }
}

function ensureAuthSubscription() {
  if (authSubscription) return;

  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      validationVersion += 1;
      setSignedOut();
      void clearNativeOwnerContext();
      return;
    }

    if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
      void validateSession(
        session,
        event === 'TOKEN_REFRESHED' ? 'Your session has expired. Please sign in again.' : null,
      );
    }
  });

  authSubscription = data.subscription;
}

export function initializeAuthSession(): Promise<void> {
  if (initializationPromise) return initializationPromise;

  initialized = true;
  initializationPromise = (async () => {
    if (!isSupabaseConfigured) {
      useAuthSessionStore.setState({
        status: 'error',
        user: null,
        session: null,
        error: 'ShortsFlow sign-in is not configured. Contact your administrator.',
      });
      return;
    }

    ensureAuthSubscription();
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      setSignedOut('Your saved session could not be restored. Please sign in again.');
      return;
    }

    await validateSession(data.session);
  })();

  return initializationPromise;
}

export async function signInWithPassword(email: string, password: string): Promise<boolean> {
  useAuthSessionStore.setState({ status: 'bootstrapping', error: null });

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      setSignedOut(safeAuthenticationError(error, 'Unable to sign in. Check your email and password.'));
      return false;
    }

    await validateSession(data.session);
    return useAuthSessionStore.getState().status === 'authenticated';
  } catch (error) {
    setSignedOut(safeAuthenticationError(error, 'Unable to sign in. Check your email and password.'));
    return false;
  }
}

export async function signOut(): Promise<void> {
  validationVersion += 1;
  await clearNativeOwnerContext();
  setSignedOut();
  try {
    await supabase.auth.signOut();
  } catch {
    // Local state is cleared below even when remote revocation is unavailable.
  } finally { setSignedOut(); }
}

export function getAuthenticatedSession(): Session | null {
  const state = useAuthSessionStore.getState();
  return state.status === 'authenticated' ? state.session : null;
}

export function getAuthenticatedUserId(): string | null {
  const state = useAuthSessionStore.getState();
  return state.status === 'authenticated' ? state.user?.id ?? null : null;
}

export function __resetAuthSessionForTests() {
  authSubscription?.unsubscribe();
  authSubscription = null;
  initialized = false;
  initializationPromise = null;
  validationVersion = 0;
  useAuthSessionStore.setState(initialState);
}

export function isAuthSessionInitialized() {
  return initialized;
}
