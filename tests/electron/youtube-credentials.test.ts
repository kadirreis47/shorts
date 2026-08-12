import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import http from 'node:http';

const require = createRequire(import.meta.url);
const { createCredentialVault, createPkce, createState } = require('../../electron/youtube-credentials.cjs') as { createCredentialVault: (input: any) => any; createPkce: () => { verifier: string; challenge: string }; createState: () => string };
const { createYouTubeAuthService, SCOPES, TOKEN_URL } = require('../../electron/youtube-auth-service.cjs') as { createYouTubeAuthService: (input: any) => any; SCOPES: string[]; TOKEN_URL: string };
const { resolveYouTubeClientId, resolveYouTubeOAuthConfig } = require('../../electron/youtube-runtime-config.cjs') as { resolveYouTubeClientId: (input: any) => string | null; resolveYouTubeOAuthConfig: (input: any) => { clientId: string | null; clientSecret: string | null } };
const { generateRuntimeConfig } = require('../../scripts/generate-electron-runtime-config.cjs') as { generateRuntimeConfig: (input: any) => string };
const { loadLocalYouTubeOAuthConfig } = require('../../scripts/electron-local-config.cjs') as { loadLocalYouTubeOAuthConfig: (input: any) => { clientId: string | null; clientSecret: string | null } };
const SYNTHETIC_CLIENT_SECRET = 'unit-test-desktop-client-secret';
const safeStorage = { isEncryptionAvailable: () => true, encryptString: (value: string) => Buffer.from(`encrypted:${value}`), decryptString: (value: Buffer) => value.toString().replace(/^encrypted:/, '') };
const credential = { accessToken: 'access-secret', refreshToken: 'refresh-secret', expiresAt: new Date(Date.now() + 60_000).toISOString(), scopes: SCOPES, tokenType: 'Bearer', provider: 'youtube', channelId: 'UC1', displayName: 'Channel' };
let directory = '';
afterEach(async () => { if (directory) await rm(directory, { recursive: true, force: true }); directory = ''; });

async function connectWithChannels(channels: Array<{ id: string; title: string }>, selectionTimeoutMs?: number, serviceOptions: Record<string, unknown> = {}) {
  directory = await mkdtemp(join(tmpdir(), 'shortsflow-youtube-'));
  const vault = createCredentialVault({ userDataPath: directory, safeStorage });
  let authorizationUrl = '';
  const service = createYouTubeAuthService({ vault, clientId: 'test-client', clientSecret: SYNTHETIC_CLIENT_SECRET, selectionTimeoutMs, openExternal: (url: string) => { authorizationUrl = url; }, fetchImpl: async (url: string) => url.includes('/token') ? ({ ok: true, json: async () => ({ access_token: 'access-secret', refresh_token: 'refresh-secret', expires_in: 3600, token_type: 'Bearer', scope: SCOPES.join(' ') }) }) : ({ ok: true, json: async () => ({ items: channels.map((channel) => ({ id: channel.id, snippet: { title: channel.title } })) }) }), ...serviceOptions });
  const pending = service.connect();
  const settled = pending.then((value: unknown) => ({ value }), (error: unknown) => ({ error }));
  await vi.waitFor(() => expect(authorizationUrl).not.toBe(''));
  const redirect = new URL(new URL(authorizationUrl).searchParams.get('redirect_uri')!);
  const state = new URL(authorizationUrl).searchParams.get('state')!;
  await new Promise<void>((resolve, reject) => { http.get(`${redirect}?state=${encodeURIComponent(state)}&code=code`, (response) => { response.resume(); response.on('end', resolve); }).on('error', reject); });
  const outcome = await settled;
  if ('error' in outcome) throw outcome.error;
  return { vault: serviceOptions.vault ?? vault, service, result: outcome.value as any };
}

async function connectWithChannelPages(pages: Record<string, Record<string, unknown>>) {
  const fetchImpl = vi.fn(async (url: string) => {
    if (url.includes('/token')) return { ok: true, json: async () => ({ access_token: 'access-secret', refresh_token: 'refresh-secret', expires_in: 3600, token_type: 'Bearer', scope: SCOPES.join(' ') }) };
    const page = pages[new URL(url).searchParams.get('pageToken') || 'first'];
    if (!page) throw new Error('unexpected page');
    return { ok: page.ok !== false, status: page.status ?? 200, json: async () => page.body ?? page };
  });
  return { ...(await connectWithChannels([], undefined, { fetchImpl })), fetchImpl };
}

type TokenFetchOptions = { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal };
async function connectForExchange(fetchImpl: (url: string, options: TokenFetchOptions) => Promise<unknown>) {
  directory = await mkdtemp(join(tmpdir(), 'shortsflow-youtube-'));
  const vault = createCredentialVault({ userDataPath: directory, safeStorage });
  let authorizationUrl = '';
  const logger = { info: vi.fn(), warn: vi.fn() };
  const service = createYouTubeAuthService({ vault, clientId: 'desktop-client.apps.googleusercontent.com', clientSecret: SYNTHETIC_CLIENT_SECRET, logger, openExternal: (url: string) => { authorizationUrl = url; }, fetchImpl });
  const pending = service.connect();
  void pending.catch(() => undefined);
  await vi.waitFor(() => expect(authorizationUrl).not.toBe(''));
  const authorization = new URL(authorizationUrl);
  const redirect = new URL(authorization.searchParams.get('redirect_uri')!);
  const state = authorization.searchParams.get('state')!;
  await new Promise<void>((resolve, reject) => { http.get(`${redirect}?state=${encodeURIComponent(state)}&iss=https%3A%2F%2Faccounts.google.com&code=authorization-code-secret&scope=ignored-provider-metadata`, (response) => { response.resume(); response.on('end', resolve); }).on('error', reject); });
  return { authorization, pending, logger };
}

describe('YouTube credential boundary', () => {
  it('creates Google-compatible unique S256 PKCE values and state', () => { const first = createPkce(); const second = createPkce(); expect(first.verifier).not.toBe(second.verifier); expect(first.verifier).toMatch(/^[A-Za-z0-9._~-]{43,128}$/); expect(first.challenge).toMatch(/^[A-Za-z0-9_-]{43}$/); expect(first.challenge).toBe(createHash('sha256').update(first.verifier, 'ascii').digest('base64url')); expect(first.challenge).not.toContain('='); expect(createState()).not.toBe(createState()); });
  it('fails clearly when OAuth returns no authenticated channels', async () => { await expect(connectWithChannels([])).rejects.toMatchObject({ code: 'youtube-channel-missing' }); });
  it('automatically binds the sole authenticated channel', async () => { const { result } = await connectWithChannels([{ id: 'UC-one', title: 'One' }]); expect(result).toEqual(expect.objectContaining({ credentialRef: expect.stringMatching(/^youtube_/), channelRef: 'UC-one', displayName: 'One' })); });
  it('rejects a granular OAuth grant missing upload scope before storing a credential', async () => {
    directory = await mkdtemp(join(tmpdir(), 'shortsflow-youtube-'));
    const vault = createCredentialVault({ userDataPath: directory, safeStorage });
    let authorizationUrl = '';
    const service = createYouTubeAuthService({ vault, clientId: 'test-client', clientSecret: SYNTHETIC_CLIENT_SECRET, openExternal: (url: string) => { authorizationUrl = url; }, fetchImpl: async (url: string) => url.includes('/token') ? ({ ok: true, json: async () => ({ access_token: 'access-secret', refresh_token: 'refresh-secret', expires_in: 3600, token_type: 'Bearer', scope: 'https://www.googleapis.com/auth/youtube.readonly' }) }) : ({ ok: true, json: async () => ({ items: [{ id: 'UC-one', snippet: { title: 'One' } }] }) }) });
    const pending = service.connect();
    const settled = pending.then((value: unknown) => ({ value }), (error: unknown) => ({ error }));
    await vi.waitFor(() => expect(authorizationUrl).not.toBe(''));
    const redirect = new URL(new URL(authorizationUrl).searchParams.get('redirect_uri')!);
    const state = new URL(authorizationUrl).searchParams.get('state')!;
    await new Promise<void>((resolve, reject) => { http.get(`${redirect}?state=${encodeURIComponent(state)}&code=code`, (response) => { response.resume(); response.on('end', resolve); }).on('error', reject); });
    await expect(settled).resolves.toEqual({ error: expect.objectContaining({ code: 'insufficient-scope' }) });
    expect(await vault.exists('youtube_missing')).toBe(false);
    await expect(readFile(vault.filePath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('settles with a timeout after a successful callback when token finalization stalls, and closes the callback server', async () => {
    directory = await mkdtemp(join(tmpdir(), 'shortsflow-youtube-'));
    const vault = createCredentialVault({ userDataPath: directory, safeStorage });
    let authorizationUrl = ''; let callbackServer: http.Server | undefined;
    const service = createYouTubeAuthService({ vault, clientId: 'test-client', clientSecret: SYNTHETIC_CLIENT_SECRET, timeoutMs: 75, logger: { info: vi.fn() }, serverFactory: ((handler: http.RequestListener) => { callbackServer = http.createServer(handler); return callbackServer; }) as unknown as typeof http.createServer, openExternal: (url: string) => { authorizationUrl = url; }, fetchImpl: async () => new Promise<never>(() => {}) });
    const pending = service.connect();
    await vi.waitFor(() => expect(authorizationUrl).not.toBe(''));
    const redirect = new URL(new URL(authorizationUrl).searchParams.get('redirect_uri')!);
    const state = new URL(authorizationUrl).searchParams.get('state')!;
    const response = await new Promise<{ status: number; body: string }>((resolve, reject) => { http.get(`${redirect}?state=${encodeURIComponent(state)}&code=code`, (result) => { let body = ''; result.on('data', (chunk) => { body += chunk; }); result.on('end', () => resolve({ status: result.statusCode ?? 0, body })); }).on('error', reject); });
    expect(response).toMatchObject({ status: 200 }); expect(response.body).toContain('completed');
    await expect(pending).rejects.toMatchObject({ code: 'oauth-timeout' });
    await vi.waitFor(() => expect(callbackServer?.listening).toBe(false));
  });
  it('rejects credential storage failures after a successful callback without exposing OAuth secrets', async () => {
    const vault = { store: vi.fn(async () => { throw Object.assign(new Error('storage failed'), { code: 'credential-storage-failed' }); }) };
    await expect(connectWithChannels([{ id: 'UC-storage', title: 'Storage' }], undefined, { vault })).rejects.toMatchObject({ code: 'credential-storage-failed' });
  });
  it('uses the exact dynamic loopback redirect URI and desktop PKCE request fields for the token exchange', async () => {
    let tokenOptions: TokenFetchOptions | undefined;
    const fetchImpl = vi.fn(async (url: string, options: typeof tokenOptions) => {
      if (url.includes('/token')) { tokenOptions = options; return { ok: true, json: async () => ({ access_token: 'access-secret', refresh_token: 'refresh-secret', expires_in: 3600, token_type: 'Bearer', scope: SCOPES.join(' ') }) }; }
      return { ok: true, json: async () => ({ items: [{ id: 'UC-exchange', snippet: { title: 'Exchange' } }] }) };
    });
    const { authorization, pending, logger } = await connectForExchange(fetchImpl);
    await expect(pending).resolves.toEqual(expect.objectContaining({ channelRef: 'UC-exchange' }));
    const serializedBody = tokenOptions!.body!; const token = new URLSearchParams(serializedBody);
    expect(tokenOptions).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    expect(await new Request(TOKEN_URL, tokenOptions as RequestInit).text()).toBe(serializedBody); expect([...token.keys()].sort()).toEqual(['client_id', 'client_secret', 'code', 'code_verifier', 'grant_type', 'redirect_uri']);
    expect(serializedBody).toBe(`code=authorization-code-secret&client_id=desktop-client.apps.googleusercontent.com&client_secret=${SYNTHETIC_CLIENT_SECRET}&redirect_uri=${encodeURIComponent(authorization.searchParams.get('redirect_uri')!)}&grant_type=authorization_code&code_verifier=${token.get('code_verifier')}`);
    expect(token.get('code')).toBe('authorization-code-secret'); expect(token.has('iss')).toBe(false); expect(token.has('scope')).toBe(false);
    expect(token.get('grant_type')).toBe('authorization_code'); expect(token.get('client_id')).toBe(authorization.searchParams.get('client_id'));
    expect(token.get('redirect_uri')).toBe(authorization.searchParams.get('redirect_uri')); expect(new URL(token.get('redirect_uri')!)).toMatchObject({ hostname: '127.0.0.1', pathname: '/' }); expect(new URL(token.get('redirect_uri')!).port).not.toBe('');
    expect(token.get('client_secret')).toBe(SYNTHETIC_CLIENT_SECRET); expect(token.get('code_verifier')).toBeTruthy(); expect(authorization.searchParams.get('code_challenge_method')).toBe('S256');
    const logs = JSON.stringify([...logger.info.mock.calls, ...logger.warn.mock.calls]);
    expect(logs).not.toContain(SYNTHETIC_CLIENT_SECRET); expect(logs).not.toContain('authorization-code-secret'); expect(logs).not.toContain(token.get('code_verifier')!);
    expect(logs).not.toContain('token-request-structure'); expect(logs).not.toContain('token-response-error');
  });
  it.each([
    ['invalid_grant', 'oauth-code-invalid'],
    ['redirect_uri_mismatch', 'oauth-redirect-uri-mismatch'],
    ['invalid_client', 'oauth-client-invalid'],
    ['invalid_request', 'oauth-token-request-invalid'],
  ])('maps token endpoint %s without leaking authorization material', async (providerError, expectedCode) => {
    const { pending } = await connectForExchange(async () => ({ ok: false, status: 400, json: async () => ({ error: providerError, error_description: 'authorization-code-secret access-secret refresh-secret client-secret' }) }));
    const error = await pending.catch((failure: Error) => failure);
    expect(error).toMatchObject({ code: expectedCode }); expect(JSON.stringify(error)).not.toContain('secret');
  });
  it('never emits the configured desktop client secret through logs or the public error', async () => {
    const { pending, logger } = await connectForExchange(async () => ({ ok: false, status: 400, json: async () => ({ error: 'invalid_request', error_description: `client_secret is ${SYNTHETIC_CLIENT_SECRET}` }) }));
    const error = await pending.catch((failure: Error) => failure);
    expect(error).toMatchObject({ code: 'oauth-client-secret-invalid' });
    expect(JSON.stringify(error)).not.toContain(SYNTHETIC_CLIENT_SECRET);
    expect(JSON.stringify([...logger.info.mock.calls, ...logger.warn.mock.calls])).not.toContain(SYNTHETIC_CLIENT_SECRET);
  });
  it.each([
    ['Missing required parameter: code_verifier', 'oauth-pkce-invalid'],
    ['Invalid parameter value for redirect_uri', 'oauth-redirect-uri-mismatch'],
    ['client_secret is missing.', 'oauth-client-secret-invalid'],
    ['Missing required parameter: client_id', 'oauth-client-invalid'],
    ['Invalid grant_type', 'oauth-grant-type-invalid'],
    ['Missing required parameter: code', 'oauth-code-missing'],
    ["This app doesn't comply with Google's OAuth 2.0 policy validation rules", 'oauth-client-policy-rejected'],
  ])('maps safe Google invalid_request detail %s to %s without returning raw detail', async (description, expectedCode) => {
    const { pending } = await connectForExchange(async () => ({ ok: false, status: 400, json: async () => ({ error: 'invalid_request', error_description: description }) }));
    const error = await pending.catch((failure: Error) => failure);
    expect(error).toMatchObject({ code: expectedCode }); expect(JSON.stringify(error)).not.toContain(description);
  });
  it('collects every channel page with the maximum page size before requiring selection', async () => { const { result, fetchImpl } = await connectWithChannelPages({ first: { items: [{ id: 'UC-A', snippet: { title: 'Channel A' } }], nextPageToken: 'second' }, second: { items: [{ id: 'UC-B', snippet: { title: 'Channel B' } }, { id: 'UC-C', snippet: { title: 'Channel C' } }] } }); expect(result).toEqual(expect.objectContaining({ status: 'selection-required', channels: [{ channelId: 'UC-A', displayName: 'Channel A' }, { channelId: 'UC-B', displayName: 'Channel B' }, { channelId: 'UC-C', displayName: 'Channel C' }] })); const channelUrls = fetchImpl.mock.calls.map(([url]: [string]) => url).filter((url: string) => url.includes('/youtube/v3/channels')); expect(channelUrls).toHaveLength(2); expect(new URL(channelUrls[0]).searchParams.get('maxResults')).toBe('50'); expect(new URL(channelUrls[1]).searchParams.get('pageToken')).toBe('second'); expect(JSON.stringify(result)).not.toContain('access-secret'); expect(JSON.stringify(result)).not.toContain('refresh-secret'); });
  it('automatically binds a sole channel found on a later page', async () => { const { result } = await connectWithChannelPages({ first: { items: [], nextPageToken: 'second' }, second: { items: [{ id: 'UC-late', snippet: { title: 'Late channel' } }] } }); expect(result).toEqual(expect.objectContaining({ channelRef: 'UC-late', displayName: 'Late channel', credentialRef: expect.stringMatching(/^youtube_/) })); });
  it('deduplicates paginated channels by first-seen YouTube channel ID', async () => { const { result } = await connectWithChannelPages({ first: { items: [{ id: 'UC-A', snippet: { title: 'First title' } }, { id: 'UC-B', snippet: { title: 'Channel B' } }], nextPageToken: 'second' }, second: { items: [{ id: 'UC-A', snippet: { title: 'Duplicate title' } }, { id: 'UC-C', snippet: { title: 'Channel C' } }] } }); expect(result).toEqual(expect.objectContaining({ channels: [{ channelId: 'UC-A', displayName: 'First title' }, { channelId: 'UC-B', displayName: 'Channel B' }, { channelId: 'UC-C', displayName: 'Channel C' }] })); });
  it('fails safely rather than looping or returning a partial selection on broken pagination', async () => { await expect(connectWithChannelPages({ first: { items: [{ id: 'UC-A', snippet: { title: 'Channel A' } }], nextPageToken: 'repeat' }, repeat: { items: [{ id: 'UC-B', snippet: { title: 'Channel B' } }], nextPageToken: 'repeat' } })).rejects.toMatchObject({ code: 'youtube-identity-failed' }); await expect(connectWithChannelPages({ first: { items: [{ id: 'UC-A', snippet: { title: 'Channel A' } }], nextPageToken: 'second' }, second: { ok: false, status: 500, body: { error: 'provider-failure' } } })).rejects.toMatchObject({ code: 'youtube-identity-failed' }); });
  it('requires safe deterministic selection for multiple authenticated channels', async () => { const { service, vault, result } = await connectWithChannels([{ id: 'UC-A', title: 'Channel A' }, { id: 'UC-B', title: 'Channel B' }]); expect(result).toEqual({ platform: 'youtube', status: 'selection-required', selectionRef: expect.any(String), channels: [{ channelId: 'UC-A', displayName: 'Channel A' }, { channelId: 'UC-B', displayName: 'Channel B' }] }); expect(JSON.stringify(result)).not.toContain('access-secret'); expect(JSON.stringify(result)).not.toContain('refresh-secret'); await expect(service.finalizeSelection(result.selectionRef, 'UC-other')).rejects.toMatchObject({ code: 'youtube-channel-selection-invalid' }); await expect(service.finalizeSelection(result.selectionRef, 'UC-A')).rejects.toMatchObject({ code: 'youtube-channel-selection-expired' }); expect(await vault.exists('youtube_missing')).toBe(false); });
  it('finalizes exactly one selected channel and safely expires or cancels selection contexts', async () => { const selected = await connectWithChannels([{ id: 'UC-A', title: 'Channel A' }, { id: 'UC-B', title: 'Channel B' }]); if (!('selectionRef' in selected.result)) throw new Error('Expected selection'); const [first, second] = await Promise.allSettled([selected.service.finalizeSelection(selected.result.selectionRef, 'UC-B'), selected.service.finalizeSelection(selected.result.selectionRef, 'UC-A')]); expect(first.status).toBe('fulfilled'); expect(second.status).toBe('rejected'); if (first.status === 'fulfilled') expect(first.value).toEqual(expect.objectContaining({ channelRef: 'UC-B', displayName: 'Channel B' })); const cancelled = await connectWithChannels([{ id: 'UC-C', title: 'Channel C' }, { id: 'UC-D', title: 'Channel D' }]); if (!('selectionRef' in cancelled.result)) throw new Error('Expected selection'); expect(cancelled.service.cancelSelection(cancelled.result.selectionRef)).toBe(true); await expect(cancelled.service.finalizeSelection(cancelled.result.selectionRef, 'UC-C')).rejects.toMatchObject({ code: 'youtube-channel-selection-expired' }); const expired = await connectWithChannels([{ id: 'UC-E', title: 'Channel E' }, { id: 'UC-F', title: 'Channel F' }], 0); if (!('selectionRef' in expired.result)) throw new Error('Expected selection'); await expect(expired.service.finalizeSelection(expired.result.selectionRef, 'UC-E')).rejects.toMatchObject({ code: 'youtube-channel-selection-expired' }); });
  it('automatically removes abandoned selection contexts and clears their timers on every removal path', async () => {
    let callback: (() => void) | undefined;
    const cleared: unknown[] = [];
    const timers = { selectionSetTimeout: (fn: () => void) => { callback = fn; return 'timer'; }, selectionClearTimeout: (timer: unknown) => { cleared.push(timer); } };
    const abandoned = await connectWithChannels([{ id: 'UC-E', title: 'Channel E' }, { id: 'UC-F', title: 'Channel F' }], 100, timers);
    if (!('selectionRef' in abandoned.result) || !callback) throw new Error('Expected selection timer');
    cleared.length = 0;
    callback();
    await expect(abandoned.service.finalizeSelection(abandoned.result.selectionRef, 'UC-E')).rejects.toMatchObject({ code: 'youtube-channel-selection-expired' });
    expect(cleared).toEqual(['timer']);
    expect(JSON.stringify(abandoned.result)).not.toContain('refresh-secret');
    const finalized = await connectWithChannels([{ id: 'UC-G', title: 'Channel G' }, { id: 'UC-H', title: 'Channel H' }], 100, timers);
    if (!('selectionRef' in finalized.result)) throw new Error('Expected selection');
    cleared.length = 0;
    await finalized.service.finalizeSelection(finalized.result.selectionRef, 'UC-G');
    expect(cleared).toEqual(['timer']);
    const raced = await connectWithChannels([{ id: 'UC-R', title: 'Channel R' }, { id: 'UC-S', title: 'Channel S' }], 100, timers);
    if (!('selectionRef' in raced.result) || !callback) throw new Error('Expected selection');
    const expireAfterFinalize = callback;
    await expect(raced.service.finalizeSelection(raced.result.selectionRef, 'UC-R')).resolves.toEqual(expect.objectContaining({ channelRef: 'UC-R' }));
    expireAfterFinalize();
    await expect(raced.service.finalizeSelection(raced.result.selectionRef, 'UC-R')).rejects.toMatchObject({ code: 'youtube-channel-selection-expired' });
    const cancelled = await connectWithChannels([{ id: 'UC-I', title: 'Channel I' }, { id: 'UC-J', title: 'Channel J' }], 100, timers);
    if (!('selectionRef' in cancelled.result)) throw new Error('Expected selection');
    cleared.length = 0;
    cancelled.service.cancelSelection(cancelled.result.selectionRef);
    expect(cleared).toEqual(['timer']);
  });
  it('stores only encrypted credential records and resolves by opaque reference after reload', async () => { directory = await mkdtemp(join(tmpdir(), 'shortsflow-youtube-')); const first = createCredentialVault({ userDataPath: directory, safeStorage }); const ref = await first.store(credential); expect(ref).toMatch(/^youtube_/); expect(await createCredentialVault({ userDataPath: directory, safeStorage }).resolve(ref)).toEqual(credential); const disk = await readFile(first.filePath, 'utf8'); expect(disk).not.toContain('access-secret'); expect(disk).not.toContain('refresh-secret'); });
  it('serializes concurrent stores so neither credential is lost', async () => { directory = await mkdtemp(join(tmpdir(), 'shortsflow-youtube-')); const vault = createCredentialVault({ userDataPath: directory, safeStorage }); const [first, second] = await Promise.all([vault.store({ ...credential, channelId: 'A' }), vault.store({ ...credential, channelId: 'B' })]); expect((await vault.resolve(first)).channelId).toBe('A'); expect((await vault.resolve(second)).channelId).toBe('B'); });
  it('fails closed when secure storage is unavailable', async () => { directory = await mkdtemp(join(tmpdir(), 'shortsflow-youtube-')); const vault = createCredentialVault({ userDataPath: directory, safeStorage: { ...safeStorage, isEncryptionAvailable: () => false } }); await expect(vault.store(credential)).rejects.toMatchObject({ code: 'secure-storage-unavailable' }); });
  it('rejects Electron basic_text and never reads or writes credential material through it', async () => { directory = await mkdtemp(join(tmpdir(), 'shortsflow-youtube-')); const vault = createCredentialVault({ userDataPath: directory, safeStorage: { ...safeStorage, getSelectedStorageBackend: () => 'basic_text' } }); await expect(vault.store(credential)).rejects.toMatchObject({ code: 'secure-storage-unavailable' }); await expect(vault.resolve('youtube_00000000-0000-0000-0000-000000000000')).rejects.toMatchObject({ code: 'secure-storage-unavailable' }); await expect(readFile(vault.filePath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' }); });
  it('refreshes expired credentials once, retains a prior refresh token, and never returns it through account status', async () => { directory = await mkdtemp(join(tmpdir(), 'shortsflow-youtube-')); const vault = createCredentialVault({ userDataPath: directory, safeStorage }); const ref = await vault.store({ ...credential, expiresAt: new Date(Date.now() - 1).toISOString() }); let refreshBody = ''; const fetchImpl = vi.fn(async (_url: string, options: TokenFetchOptions) => { refreshBody = String(options.body); return { ok: true, json: async () => ({ access_token: 'new-access', expires_in: 3600, token_type: 'Bearer' }) }; }); const service = createYouTubeAuthService({ vault, fetchImpl, openExternal: vi.fn(), clientId: 'test-client', clientSecret: SYNTHETIC_CLIENT_SECRET }); const [one, two] = await Promise.all([service.resolveExecutionCredential(ref), service.resolveExecutionCredential(ref)]); expect(one.accessToken).toBe('new-access'); expect(two.refreshToken).toBe('refresh-secret'); expect(fetchImpl).toHaveBeenCalledTimes(1); expect(new URLSearchParams(refreshBody).get('client_secret')).toBe(SYNTHETIC_CLIENT_SECRET); expect(await service.status(ref)).toEqual({ credentialRef: ref, authenticated: true }); });
  it('removes only terminally invalid credentials, reports status as disconnected, and never retries the dead refresh token', async () => { directory = await mkdtemp(join(tmpdir(), 'shortsflow-youtube-')); const vault = createCredentialVault({ userDataPath: directory, safeStorage }); const ref = await vault.store({ ...credential, expiresAt: new Date(Date.now() - 1).toISOString() }); const unaffectedRef = await vault.store({ ...credential, channelId: 'UC-other' }); const fetchImpl = vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) })); const service = createYouTubeAuthService({ vault, clientId: 'test-client', clientSecret: SYNTHETIC_CLIENT_SECRET, fetchImpl }); await expect(service.resolveExecutionCredential(ref)).rejects.toMatchObject({ code: 'credential-reconnect-required' }); expect(await service.status(ref)).toEqual({ credentialRef: ref, authenticated: false }); await expect(service.resolveExecutionCredential(ref)).rejects.toMatchObject({ code: 'credential-missing' }); expect(fetchImpl).toHaveBeenCalledTimes(1); expect(await vault.resolve(unaffectedRef)).toEqual(expect.objectContaining({ channelId: 'UC-other' })); });
  it('preserves a credential after a transient refresh failure without exposing token material', async () => { directory = await mkdtemp(join(tmpdir(), 'shortsflow-youtube-')); const vault = createCredentialVault({ userDataPath: directory, safeStorage }); const ref = await vault.store({ ...credential, expiresAt: new Date(Date.now() - 1).toISOString() }); const service = createYouTubeAuthService({ vault, clientId: 'test-client', clientSecret: SYNTHETIC_CLIENT_SECRET, fetchImpl: async () => { throw new Error('network unavailable'); } }); const failure = await service.resolveExecutionCredential(ref).catch((error: Error) => error); expect(failure).toMatchObject({ code: 'youtube-network-failure' }); expect(String(failure)).not.toContain('refresh-secret'); expect(await service.status(ref)).toEqual({ credentialRef: ref, authenticated: true }); });
  it('loads the matching desktop credential pair from packaged main-process runtime configuration', async () => { directory = await mkdtemp(join(tmpdir(), 'shortsflow-youtube-')); await (await import('node:fs/promises')).writeFile(join(directory, 'shortsflow.runtime.json'), JSON.stringify({ youtubeClientId: 'desktop-client', youtubeClientSecret: SYNTHETIC_CLIENT_SECRET })); expect(resolveYouTubeOAuthConfig({ env: {}, userDataPath: directory, resourcesPath: join(directory, 'none') })).toEqual({ clientId: 'desktop-client', clientSecret: SYNTHETIC_CLIENT_SECRET }); expect(resolveYouTubeClientId({ env: {}, userDataPath: directory, resourcesPath: join(directory, 'none') })).toBe('desktop-client'); expect(resolveYouTubeOAuthConfig({ env: {}, userDataPath: join(directory, 'missing'), resourcesPath: join(directory, 'none') })).toEqual({ clientId: null, clientSecret: null }); });
  it('generates an explicitly unconfigured runtime file when OAuth is absent and clears stale credential values', async () => { directory = await mkdtemp(join(tmpdir(), 'shortsflow-youtube-')); const output = join(directory, 'shortsflow.runtime.json'); generateRuntimeConfig({ clientId: 'synthetic-release-client', clientSecret: SYNTHETIC_CLIENT_SECRET, outputFile: output }); expect(JSON.parse(await readFile(output, 'utf8'))).toEqual({ youtubeClientId: 'synthetic-release-client', youtubeClientSecret: SYNTHETIC_CLIENT_SECRET }); generateRuntimeConfig({ outputFile: output, resolveConfig: () => ({ clientId: null, clientSecret: null }) }); expect(JSON.parse(await readFile(output, 'utf8'))).toEqual({ youtubeClientId: '', youtubeClientSecret: '' }); expect(resolveYouTubeClientId({ env: {}, userDataPath: directory, resourcesPath: join(directory, 'none') })).toBeNull(); });
  it('uses one atomic local credential resolver for build generation with environment precedence', async () => { directory = await mkdtemp(join(tmpdir(), 'shortsflow-youtube-')); const output = join(directory, 'shortsflow.runtime.json'); const fsApi = { readFileSync: () => `SHORTSFLOW_YOUTUBE_CLIENT_ID=from-dotenv\nSHORTSFLOW_YOUTUBE_CLIENT_SECRET=${SYNTHETIC_CLIENT_SECRET}\n` }; const fromDotEnv = loadLocalYouTubeOAuthConfig({ env: {}, fsApi }); const fromEnvironment = loadLocalYouTubeOAuthConfig({ env: { SHORTSFLOW_YOUTUBE_CLIENT_ID: 'from-environment', SHORTSFLOW_YOUTUBE_CLIENT_SECRET: 'environment-test-secret' }, fsApi }); expect(fromDotEnv).toEqual({ clientId: 'from-dotenv', clientSecret: SYNTHETIC_CLIENT_SECRET }); expect(fromEnvironment).toEqual({ clientId: 'from-environment', clientSecret: 'environment-test-secret' }); generateRuntimeConfig({ outputFile: output, resolveConfig: () => fromEnvironment }); expect(JSON.parse(await readFile(output, 'utf8'))).toEqual({ youtubeClientId: 'from-environment', youtubeClientSecret: 'environment-test-secret' }); });
  it('fails closed before opening a browser when either desktop credential field is missing', async () => { directory = await mkdtemp(join(tmpdir(), 'shortsflow-youtube-')); const vault = createCredentialVault({ userDataPath: directory, safeStorage }); for (const oauthConfig of [{ clientId: 'desktop-client', clientSecret: null }, { clientId: null, clientSecret: SYNTHETIC_CLIENT_SECRET }]) { const openExternal = vi.fn(); const service = createYouTubeAuthService({ vault, oauthConfig, openExternal }); await expect(service.connect()).rejects.toMatchObject({ code: 'oauth-configuration-missing' }); expect(openExternal).not.toHaveBeenCalled(); } });
  it('ignores mismatched callback states until the legitimate callback succeeds', async () => { directory = await mkdtemp(join(tmpdir(), 'shortsflow-youtube-')); const vault = createCredentialVault({ userDataPath: directory, safeStorage }); let authUrl = ''; const service = createYouTubeAuthService({ vault, clientId: 'test-client', clientSecret: SYNTHETIC_CLIENT_SECRET, openExternal: (url: string) => { authUrl = url; }, fetchImpl: async (url: string) => url.includes('/token') ? ({ ok: true, json: async () => ({ access_token: 'access-secret', refresh_token: 'refresh-secret', expires_in: 3600, token_type: 'Bearer', scope: SCOPES.join(' ') }) }) : ({ ok: true, json: async () => ({ items: [{ id: 'UC-legitimate', snippet: { title: 'Legitimate' } }] }) }) }); const pending = service.connect(); await vi.waitFor(() => expect(authUrl).not.toBe('')); const authorization = new URL(authUrl); const redirect = new URL(authorization.searchParams.get('redirect_uri')!); const request = (query: string) => new Promise<{ status: number; body: string }>((resolve, reject) => { http.get(`${redirect}?${query}`, (result) => { let body = ''; result.on('data', (chunk) => { body += chunk; }); result.on('end', () => resolve({ status: result.statusCode ?? 0, body })); }).on('error', reject); }); const first = await request('state=wrong-one&code=untrusted-code'); const second = await request('state=wrong-two'); for (const response of [first, second]) { expect(response.status).toBe(400); expect(response.body).toContain('Authorization could not be verified'); expect(response.body).not.toContain('completed'); expect(response.body).not.toContain(authorization.searchParams.get('state')!); expect(response.body).not.toContain('untrusted-code'); expect(response.body).not.toContain('access-secret'); } const success = await request(`state=${encodeURIComponent(authorization.searchParams.get('state')!)}&code=legitimate-code`); expect(success.status).toBe(200); expect(success.body).toContain('completed'); await expect(pending).resolves.toEqual(expect.objectContaining({ channelRef: 'UC-legitimate', authenticated: true })); });
  it('keeps valid-state denial as a terminal truthful callback failure', async () => { directory = await mkdtemp(join(tmpdir(), 'shortsflow-youtube-')); const vault = createCredentialVault({ userDataPath: directory, safeStorage }); let authUrl = ''; const pending = createYouTubeAuthService({ vault, clientId: 'test-client', clientSecret: SYNTHETIC_CLIENT_SECRET, openExternal: (url: string) => { authUrl = url; } }).connect(); const rejection = expect(pending).rejects.toMatchObject({ code: 'oauth-cancelled' }); await vi.waitFor(() => expect(authUrl).not.toBe('')); const authorization = new URL(authUrl); const redirect = new URL(authorization.searchParams.get('redirect_uri')!); const response = await new Promise<{ status: number; body: string }>((resolve, reject) => { http.get(`${redirect}?state=${encodeURIComponent(authorization.searchParams.get('state')!)}&error=access_denied`, (result) => { let body = ''; result.on('data', (chunk) => { body += chunk; }); result.on('end', () => resolve({ status: result.statusCode ?? 0, body })); }).on('error', reject); }); expect(response).toMatchObject({ status: 400 }); expect(response.body).toContain('Authorization was cancelled'); expect(response.body).not.toContain('completed'); await rejection; });
});
