/** @vitest-environment jsdom */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authState: { status: 'signed-out', user: null, error: null } as { status: string; user: { id: string; email?: string } | null; error: string | null },
  bootstrap: vi.fn(() => ({ ready: false, error: null, offline: false, retry: vi.fn() })),
  channels: vi.fn(() => ({ channels: [], canonicalChannels: [] })),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock('@/auth/session', () => ({
  useAuthSessionStore: () => mocks.authState,
  initializeAuthSession: vi.fn(async () => undefined),
  signOut: vi.fn(async () => undefined),
}));
vi.mock('@/hooks/useAppBootstrap', () => ({ useAppBootstrap: mocks.bootstrap }));
vi.mock('@/hooks/useChannels', () => ({ useChannels: mocks.channels }));
vi.mock('@/app/bootstrap', () => ({ invalidateApplicationBootstrap: vi.fn() }));
vi.mock('@/app/ownerTransition', () => ({ transitionPrivateOwner: vi.fn() }));
vi.mock('@/app/navigation', () => ({ useNavigationItems: () => [] }));
vi.mock('@/store', () => ({
  useUIStore: (selector: (state: { currentView: string; navigate: () => void }) => unknown) =>
    selector({ currentView: 'dashboard', navigate: vi.fn() }),
}));

import App from '@/App';

describe('App auth gate', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    mocks.authState = { status: 'signed-out', user: null, error: null };
    vi.clearAllMocks();
  });

  it('renders only the sign-in gate and starts no private bootstrap while signed out', async () => {
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    await act(async () => { root.render(<App />); });
    expect(host.textContent).toContain('Sign in to ShortsFlow');
    expect(mocks.bootstrap).not.toHaveBeenCalled();
    expect(mocks.channels).not.toHaveBeenCalled();
  });

  it('enters the private bootstrap only for a validated identity', async () => {
    mocks.authState = { status: 'authenticated', user: { id: 'user-1', email: 'invited@example.com' }, error: null };
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    await act(async () => { root.render(<App />); });
    expect(mocks.bootstrap).toHaveBeenCalledWith('user-1');
    expect(mocks.channels).toHaveBeenCalledOnce();
  });
});
