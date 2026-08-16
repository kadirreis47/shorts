import { createRequire } from 'node:module';
import * as fs from 'node:fs/promises';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { createCredentialVault } = require('../../electron/youtube-credentials.cjs') as { createCredentialVault: (input: any) => any };
const { createYouTubeAuthService, SCOPES } = require('../../electron/youtube-auth-service.cjs') as any;
const { registerYouTubeHandlers } = require('../../electron/youtube-ipc.cjs') as any;
const { createYouTubePublishService } = require('../../electron/youtube-publish-service.cjs') as any;
const { createSupabaseOwnerValidator, createYouTubeOwnerContext } = require('../../electron/youtube-owner-context.cjs') as any;
const { resolveSupabaseAuthConfig } = require('../../electron/supabase-runtime-config.cjs') as any;

const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TOKEN_A = 'authenticated-token-a-value';
const TOKEN_A_REFRESH = 'authenticated-token-a-refresh';
const TOKEN_B = 'authenticated-token-b-value';
const credential = {
  accessToken: 'youtube-access-secret',
  refreshToken: 'youtube-refresh-secret',
  expiresAt: '2099-01-01T00:00:00.000Z',
  scopes: SCOPES,
  tokenType: 'Bearer',
  provider: 'youtube',
  channelId: 'UC-owner-a',
  displayName: 'Owner A channel',
};
const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (value: string) => Buffer.from(`encrypted:${value}`),
  decryptString: (value: Buffer) => value.toString().replace(/^encrypted:/, ''),
};

let directory = '';
afterEach(async () => { if (directory) await rm(directory, { recursive: true, force: true }); directory = ''; });

function ownerContext() {
  return createYouTubeOwnerContext({
    validateAccessToken: async (token: string) => {
      if (token === TOKEN_A || token === TOKEN_A_REFRESH) return USER_A;
      if (token === TOKEN_B) return USER_B;
      throw new Error('invalid');
    },
  });
}

function publishRequest(credentialRef: string) {
  return {
    jobId: 'job-owner-test', idempotencyKey: 'owner-test', platform: 'youtube', approvalFingerprint: 'approved', approvedAt: '2026-08-14T00:00:00.000Z',
    target: { accountId: 'youtube:UC-owner-a', channelRef: 'UC-owner-a' },
    account: { platform: 'youtube', accountId: 'youtube:UC-owner-a', accountRef: 'UC-owner-a', channelRef: 'UC-owner-a', credentialRef },
    artifact: { artifactPath: 'C:/safe/export.mp4', artifactFingerprint: 'artifact-owner-test', contentDigest: 'a'.repeat(64), sizeBytes: 100 },
    metadata: { title: 'Owner test', description: '', caption: '', hashtags: [], visibility: 'private', language: null, category: null, audienceFlags: {}, thumbnailPath: null, playlistRef: null, commentsEnabled: null },
    outboundDescription: '', recovery: { jobState: 'queued', remoteState: null, failureCode: null },
  };
}

describe('native YouTube credential owner binding', () => {
  it('validates a Supabase token against the fixed Auth endpoint without returning or retaining it', async () => {
    const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
    const token = `header.${payload}.signature`;
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ id: USER_A, email: 'owner@example.com' }) }));
    const validate = createSupabaseOwnerValidator({ resolveConfig: () => ({ url: 'https://project.supabase.co', anonKey: 'public-anon-key' }), fetchImpl });
    const result = await validate(token);
    expect(result).toMatchObject({ ownerId: USER_A, expiresAt: expect.any(Number) });
    expect(fetchImpl).toHaveBeenCalledWith('https://project.supabase.co/auth/v1/user', expect.objectContaining({ headers: { apikey: 'public-anon-key', Authorization: `Bearer ${token}` } }));
    expect(JSON.stringify(result)).not.toContain(token);
    await expect(createSupabaseOwnerValidator({ resolveConfig: () => ({ url: 'https://project.supabase.co', anonKey: 'public-anon-key' }), fetchImpl: async () => ({ ok: false }) })('invalid-token-value-long-enough')).rejects.toMatchObject({ code: 'youtube-owner-authorization-required' });
  });

  it('does not permit launch environment variables to replace the packaged Supabase identity authority', () => {
    const resourcesPath = 'C:/Program Files/ShortsFlow/resources';
    const configPath = `${resourcesPath}/shortsflow.runtime.json`;
    const fsApi = {
      readFileSync: (path: string) => {
        if (path.replace(/\\/g, '/') !== configPath) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
        return JSON.stringify({ supabaseUrl: 'https://trusted.supabase.co', supabaseAnonKey: 'trusted-public-anon' });
      },
    };
    expect(resolveSupabaseAuthConfig({
      isPackaged: true,
      resourcesPath,
      env: { VITE_SUPABASE_URL: 'https://attacker.supabase.co', VITE_SUPABASE_ANON_KEY: 'attacker-public-anon' },
      fsApi,
    })).toEqual({ url: 'https://trusted.supabase.co', anonKey: 'trusted-public-anon' });
  });

  it('replaces owners, clears on logout, and preserves generation for same-owner refresh', async () => {
    const context = ownerContext();
    expect(() => context.capture()).toThrowError(expect.objectContaining({ code: 'youtube-owner-authorization-required' }));
    expect(await context.establish(TOKEN_A)).toMatchObject({ ownerId: USER_A, changed: true });
    const first = context.capture();
    expect(await context.establish(TOKEN_A_REFRESH)).toMatchObject({ ownerId: USER_A, changed: false });
    expect(context.capture().generation).toBe(first.generation);
    expect(first.signal.aborted).toBe(false);
    expect(await context.establish(TOKEN_B)).toMatchObject({ ownerId: USER_B, changed: true });
    expect(first.signal.aborted).toBe(true);
    expect(() => context.assertCurrent(first)).toThrowError(expect.objectContaining({ code: 'youtube-owner-authorization-required' }));
    await context.clear();
    expect(() => context.capture()).toThrowError(expect.objectContaining({ code: 'youtube-owner-authorization-required' }));
    await expect(context.establish('invalid-owner-token-value')).rejects.toMatchObject({ code: 'youtube-owner-authorization-required' });
  });

  it('stores validated ownership, strips caller ownership, reuses same-owner channels, and isolates foreign credentials', async () => {
    directory = await mkdtemp(join(tmpdir(), 'shortsflow-owner-vault-'));
    const context = ownerContext();
    await context.establish(TOKEN_A);
    const vault = createCredentialVault({ userDataPath: directory, safeStorage, ownerContext: context });
    const ref = await vault.store({ ...credential, ownerId: USER_B });
    expect(await vault.store({ ...credential, accessToken: 'replacement-secret' })).toBe(ref);
    expect(await vault.resolve(ref)).not.toHaveProperty('ownerId');
    const disk = JSON.parse(await readFile(vault.filePath, 'utf8'));
    expect(disk[ref]).toMatchObject({ version: 2, ownerId: USER_A });
    expect(JSON.stringify(disk)).not.toContain('youtube-access-secret');
    expect(JSON.stringify(disk)).not.toContain('youtube-refresh-secret');
    await context.establish(TOKEN_B);
    const foreign = await vault.resolve(ref).catch((error: Error & { code?: string }) => ({ code: error.code, message: error.message }));
    const missing = await vault.resolve('youtube_00000000-0000-0000-0000-000000000000').catch((error: Error & { code?: string }) => ({ code: error.code, message: error.message }));
    expect(foreign).toEqual(missing);
    expect(foreign).toMatchObject({ code: 'credential-unavailable' });
  });

  it('rejects a vault record whose visible owner metadata does not match its encrypted owner binding', async () => {
    directory = await mkdtemp(join(tmpdir(), 'shortsflow-owner-vault-tamper-'));
    const context = ownerContext();
    await context.establish(TOKEN_A);
    const vault = createCredentialVault({ userDataPath: directory, safeStorage, ownerContext: context });
    const ref = await vault.store(credential);
    const disk = JSON.parse(await readFile(vault.filePath, 'utf8'));
    disk[ref].ownerId = USER_B;
    await writeFile(vault.filePath, JSON.stringify(disk));
    await context.establish(TOKEN_B);
    await expect(vault.resolve(ref)).rejects.toMatchObject({ code: 'credential-unavailable' });
  });

  it('keeps legacy records unbound until successful OAuth identity proof stores the matching channel', async () => {
    directory = await mkdtemp(join(tmpdir(), 'shortsflow-owner-legacy-'));
    const legacyRef = 'youtube_11111111-1111-1111-1111-111111111111';
    const encrypted = safeStorage.encryptString(JSON.stringify(credential)).toString('base64');
    await writeFile(join(directory, 'youtube-credentials.v1'), JSON.stringify({ [legacyRef]: { version: 1, encrypted, updatedAt: '2026-01-01T00:00:00.000Z' } }));
    const context = ownerContext();
    await context.establish(TOKEN_A);
    const vault = createCredentialVault({ userDataPath: directory, safeStorage, ownerContext: context });
    await expect(vault.resolve(legacyRef)).rejects.toMatchObject({ code: 'credential-unavailable' });
    const differentRef = await vault.store({ ...credential, channelId: 'UC-different' });
    expect(differentRef).not.toBe(legacyRef);
    expect((JSON.parse(await readFile(vault.filePath, 'utf8')))[legacyRef].ownerId).toBeUndefined();
    const reboundRef = await vault.store({ ...credential, accessToken: 'newly-proven-token' });
    expect(reboundRef).toBe(legacyRef);
    expect((JSON.parse(await readFile(vault.filePath, 'utf8')))[legacyRef].ownerId).toBe(USER_A);
  });

  it('blocks User B from every credential-backed IPC path without revealing whether User A credential exists', async () => {
    directory = await mkdtemp(join(tmpdir(), 'shortsflow-owner-ipc-'));
    const context = ownerContext();
    await context.establish(TOKEN_A);
    const vault = createCredentialVault({ userDataPath: directory, safeStorage, ownerContext: context });
    const ref = await vault.store(credential);
    const auth = createYouTubeAuthService({ vault, clientId: 'test-client', clientSecret: 'test-client-secret' });
    const requireCredential = async (input: any, owner: any) => { await auth.resolveExecutionCredential(input.account.credentialRef, owner); return { remotePublishId: 'remote', remoteUrl: null, state: 'published' }; };
    const publisher = { initialize: async () => undefined, publish: requireCredential, reconcile: requireCredential, cancel: vi.fn(() => false), acknowledgeReceipt: async (input: any, owner: any) => { await auth.resolveExecutionCredential(input.account.credentialRef, owner); return true; } };
    const analytics = { collect: async (input: any, owner: any) => { await auth.resolveExecutionCredential(input.credentialRef, owner); return { metrics: [], diagnostics: [] }; } };
    const handlers = new Map<string, (event: unknown, input?: any) => Promise<any>>();
    const electron = { app: { getPath: () => directory }, safeStorage, ipcMain: { handle: (name: string, handler: any) => handlers.set(name, handler), removeHandler: vi.fn() } };
    registerYouTubeHandlers({ electron, ownerContext: context, service: auth, publishService: publisher, analyticsService: analytics });
    await handlers.get('youtube:owner-context')!({}, { accessToken: TOKEN_B });
    const request = publishRequest(ref);
    const status = await handlers.get('youtube:status')!({}, { credentialRef: ref });
    const missing = await handlers.get('youtube:status')!({}, { credentialRef: 'youtube_00000000-0000-0000-0000-000000000000' });
    expect(status).toEqual(missing);
    expect(status).toMatchObject({ ok: false, error: { code: 'credential-unavailable' } });
    await expect(handlers.get('youtube:disconnect')!({}, { credentialRef: ref })).rejects.toMatchObject({ code: 'credential-unavailable' });
    expect(await handlers.get('youtube:publish')!({}, request)).toMatchObject({ ok: false, error: { code: 'credential-unavailable', status: 401 } });
    expect(await handlers.get('youtube:reconcile-publish')!({}, request)).toMatchObject({ ok: false, error: { code: 'credential-unavailable', status: 401 } });
    expect(await handlers.get('youtube:acknowledge-receipt')!({}, { ...request, remotePublishId: 'remote' })).toEqual({ acknowledged: false });
    expect(await handlers.get('youtube:collect-analytics')!({}, { credentialRef: ref, channelRef: 'UC-owner-a', remotePublicationId: 'remote', publishedAt: '2026-08-01T00:00:00.000Z', window: '24h' })).toMatchObject({ ok: false, error: { code: 'credential-unavailable', status: 401 } });
    expect(JSON.stringify([status, missing])).not.toContain('youtube-access-secret');
    await expect(handlers.get('youtube:clear-owner-context')!({})).resolves.toMatchObject({ ok: true, result: { ready: false } });
    expect(await handlers.get('youtube:status')!({}, { credentialRef: ref })).toMatchObject({ ok: false, error: { code: 'youtube-owner-authorization-required' } });
    await context.establish(TOKEN_A);
    expect((await handlers.get('youtube:status')!({}, { credentialRef: ref })).status.authenticated).toBe(true);
  });

  it('aborts an in-flight native publish generation before stale checkpoint side effects', async () => {
    const context = ownerContext();
    await context.establish(TOKEN_A);
    const ownerA = context.capture();
    const checkpoints = { list: vi.fn(async () => []), get: vi.fn(async () => null), put: vi.fn(async () => undefined), remove: vi.fn(async () => false) };
    const snapshots = { cleanupOrphans: vi.fn(async () => ({ removed: 0, failed: 0 })), create: vi.fn(async () => ({ snapshotPath: 'C:/managed/snapshot.bin' })), assertManagedPath: vi.fn(), remove: vi.fn(async () => true) };
    const artifact = { assertUnchanged: vi.fn(async () => true), close: vi.fn(async () => undefined), createReadStream: vi.fn() };
    let uploadStarted!: () => void;
    const started = new Promise<void>((resolve) => { uploadStarted = resolve; });
    const transport = {
      createSession: vi.fn(({ signal }: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
        uploadStarted();
        signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
      })),
      querySession: vi.fn(), upload: vi.fn(), getVideoStatus: vi.fn(),
    };
    const auth = { resolveExecutionCredential: vi.fn(async (_ref: string, owner: unknown) => { context.assertCurrent(owner); return credential; }) };
    const service = createYouTubePublishService({ auth, ownerContext: context, checkpoints, snapshots, transport, openArtifact: async () => artifact });
    const pending = service.publish(publishRequest('youtube_11111111-1111-1111-1111-111111111111'), ownerA);
    await started;
    await context.establish(TOKEN_B);
    await expect(pending).rejects.toBeTruthy();
    expect(checkpoints.put).not.toHaveBeenCalled();
    expect(artifact.close).toHaveBeenCalled();
  });

  it('serializes an authorized vault mutation before exposing a replacement owner', async () => {
    directory = await mkdtemp(join(tmpdir(), 'shortsflow-owner-vault-transition-'));
    const context = ownerContext();
    await context.establish(TOKEN_A);
    const vault = createCredentialVault({ userDataPath: directory, safeStorage, ownerContext: context });
    const ref = await vault.store(credential);
    let releaseRename!: () => void;
    let renameStarted!: () => void;
    const renameGate = new Promise<void>((resolve) => { releaseRename = resolve; });
    const renameObserved = new Promise<void>((resolve) => { renameStarted = resolve; });
    const guardedVault = createCredentialVault({
      userDataPath: directory,
      safeStorage,
      ownerContext: context,
      fsApi: {
        ...fs,
        rename: async (source: string, destination: string) => {
          renameStarted();
          await renameGate;
          return fs.rename(source, destination);
        },
      },
    });

    const removal = guardedVault.remove(ref);
    await renameObserved;
    const ownerSwitch = context.establish(TOKEN_B);
    await Promise.resolve();
    expect(() => context.capture()).toThrowError(expect.objectContaining({ code: 'youtube-owner-authorization-required' }));
    let switched = false;
    void ownerSwitch.then(() => { switched = true; });
    await Promise.resolve();
    expect(switched).toBe(false);

    releaseRename();
    await expect(removal).resolves.toBe(true);
    await expect(ownerSwitch).resolves.toMatchObject({ ownerId: USER_B, changed: true });
    await expect(guardedVault.resolve(ref)).rejects.toMatchObject({ code: 'credential-unavailable' });
  });
});
