const http = require('http');
const { shell } = require('electron');
const { createPkce, createState, YouTubeCredentialError } = require('./youtube-credentials.cjs');

const PUBLISHING_SCOPES = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'];
const ANALYTICS_SCOPE = 'https://www.googleapis.com/auth/yt-analytics.readonly';
const SCOPES = [...PUBLISHING_SCOPES, ANALYTICS_SCOPE];
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CHANNEL_URL = 'https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true';

function config(oauthConfigOverride, clientIdOverride, clientSecretOverride) {
  let resolved;
  if (oauthConfigOverride !== undefined) resolved = typeof oauthConfigOverride === 'function' ? oauthConfigOverride() : oauthConfigOverride;
  else if (clientIdOverride !== undefined || clientSecretOverride !== undefined) resolved = {
    clientId: typeof clientIdOverride === 'function' ? clientIdOverride() : clientIdOverride,
    clientSecret: typeof clientSecretOverride === 'function' ? clientSecretOverride() : clientSecretOverride,
  };
  else resolved = { clientId: process.env.SHORTSFLOW_YOUTUBE_CLIENT_ID, clientSecret: process.env.SHORTSFLOW_YOUTUBE_CLIENT_SECRET };
  const clientId = typeof resolved?.clientId === 'string' ? resolved.clientId.trim() : '';
  const clientSecret = typeof resolved?.clientSecret === 'string' ? resolved.clientSecret.trim() : '';
  if (!clientId || !clientSecret) throw new YouTubeCredentialError('oauth-configuration-missing', 'YouTube OAuth is not completely configured for this application.');
  return { clientId, clientSecret };
}
function oauthError(payload) { const code = payload?.error === 'access_denied' ? 'oauth-cancelled' : 'oauth-callback-failed'; return new YouTubeCredentialError(code, code === 'oauth-cancelled' ? 'YouTube authorization was cancelled.' : 'YouTube authorization callback failed.'); }
function sanitizeTokenResponse(response) { return { accessToken: String(response.access_token || ''), refreshToken: typeof response.refresh_token === 'string' ? response.refresh_token : null, expiresAt: new Date(Date.now() + Number(response.expires_in || 0) * 1000).toISOString(), scopes: typeof response.scope === 'string' ? response.scope.split(' ').filter(Boolean) : [], tokenType: String(response.token_type || 'Bearer'), provider: 'youtube' }; }
function assertPublishingScopes(token) {
  const granted = new Set(token.scopes);
  if (PUBLISHING_SCOPES.some((scope) => !granted.has(scope))) throw new YouTubeCredentialError('insufficient-scope', 'The connected YouTube account does not grant the required publishing permissions. Reconnect the account and approve all requested permissions.');
}
function invalidTokenRequestReason(description) {
  const normalized = typeof description === 'string' ? description.toLowerCase() : '';
  if (/code[_ ]verifier|pkce/.test(normalized)) return new YouTubeCredentialError('oauth-pkce-invalid', 'Google rejected the PKCE verification fields. Start the connection again.');
  if (/redirect[_ ]uri/.test(normalized)) return new YouTubeCredentialError('oauth-redirect-uri-mismatch', 'Google rejected the installed app callback address. Reinstall the current ShortsFlow build and try again.');
  if (/client[_ ]secret/.test(normalized)) return new YouTubeCredentialError('oauth-client-secret-invalid', 'This ShortsFlow build has an incomplete YouTube desktop OAuth credential. Reinstall a current build and try again.');
  if (/client[_ ]id|oauth client/.test(normalized)) return new YouTubeCredentialError('oauth-client-invalid', 'This ShortsFlow build has an invalid YouTube desktop OAuth client configuration. Reinstall a current build and try again.');
  if (/grant[_ ]type/.test(normalized)) return new YouTubeCredentialError('oauth-grant-type-invalid', 'Google rejected the authorization-code grant type. Reinstall the current ShortsFlow build and try again.');
  if (/required parameter[^a-z]+code\b|missing[^a-z]+code\b/.test(normalized)) return new YouTubeCredentialError('oauth-code-missing', 'Google did not receive the authorization code. Start the connection again.');
  if (/doesn.t comply|validation rules|oauth 2\.0 policy/.test(normalized)) return new YouTubeCredentialError('oauth-client-policy-rejected', 'Google rejected this desktop OAuth client under its application security policy.');
  return null;
}
function tokenExchangeError(providerError, providerDescription) {
  if (providerError === 'invalid_grant') return new YouTubeCredentialError('oauth-code-invalid', 'The YouTube authorization code was rejected or has expired. Start the connection again.');
  if (providerError === 'redirect_uri_mismatch') return new YouTubeCredentialError('oauth-redirect-uri-mismatch', 'The installed app callback address was rejected. Reinstall the current ShortsFlow build and try again.');
  if (providerError === 'invalid_client') return new YouTubeCredentialError('oauth-client-invalid', 'This ShortsFlow build has an invalid YouTube desktop OAuth client configuration. Reinstall a current build and try again.');
  if (providerError === 'invalid_request') return invalidTokenRequestReason(providerDescription) || new YouTubeCredentialError('oauth-token-request-invalid', 'YouTube rejected the authorization request without identifying a malformed field. Start the connection again.');
  return new YouTubeCredentialError('oauth-exchange-failed', 'YouTube authorization could not be completed.');
}
function createTokenExchangeRequest({ clientId, clientSecret, code, redirectUri, verifier, signal }) {
  const body = new URLSearchParams();
  body.set('code', code);
  body.set('client_id', clientId);
  body.set('client_secret', clientSecret);
  body.set('redirect_uri', redirectUri);
  body.set('grant_type', 'authorization_code');
  body.set('code_verifier', verifier);
  return { url: TOKEN_URL, options: { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString(), signal } };
}
async function jsonFetch(fetchImpl, url, options, errorCode, message) { let response; try { response = await fetchImpl(url, options); } catch (error) { if (error?.name === 'AbortError') throw new YouTubeCredentialError('oauth-timeout', 'YouTube authorization timed out while completing the connection. Please try again.'); throw new YouTubeCredentialError('youtube-network-failure', 'Unable to reach YouTube. Please try again.'); } let body = {}; try { body = await response.json(); } catch {} if (!response.ok) { if (errorCode === 'oauth-exchange-failed') throw tokenExchangeError(body?.error, body?.error_description); if (body?.error === 'invalid_grant' || response.status === 401) throw new YouTubeCredentialError('credential-reconnect-required', 'YouTube authorization has expired or was revoked. Reconnect the account.'); if (response.status === 403) throw new YouTubeCredentialError('insufficient-scope', 'The connected YouTube account does not grant the required permissions.'); throw new YouTubeCredentialError(errorCode, message); } return body; }

function createYouTubeAuthService({ vault, fetchImpl = fetch, openExternal = shell?.openExternal, timeoutMs = 300000, selectionTimeoutMs = 300000, serverFactory = http.createServer, selectionSetTimeout = setTimeout, selectionClearTimeout = clearTimeout, oauthConfig, clientId, clientSecret, logger = console } = {}) {
  const refreshFlights = new Map();
  const selectionContexts = new Map();
  function removeSelectionContext(selectionRef) {
    const context = selectionContexts.get(selectionRef);
    if (!context) return null;
    selectionContexts.delete(selectionRef);
    if (context.ownerAbort) context.owner?.signal?.removeEventListener('abort', context.ownerAbort);
    if (context.timer !== null) selectionClearTimeout(context.timer);
    return context;
  }
  function lifecycle(stage) { logger?.info?.(`[youtube-oauth] ${stage}`); }
  async function exchange(code, verifier, redirectUri, configuredClientId, configuredClientSecret, signal) {
    const request = createTokenExchangeRequest({ clientId: configuredClientId, clientSecret: configuredClientSecret, code, redirectUri, verifier, signal });
    const result = await jsonFetch(fetchImpl, request.url, request.options, 'oauth-exchange-failed', 'YouTube authorization could not be completed.');
    const token = sanitizeTokenResponse(result); if (!token.accessToken) throw new YouTubeCredentialError('oauth-exchange-failed', 'YouTube authorization returned no access token.'); assertPublishingScopes(token); lifecycle('token-exchange-complete'); lifecycle('scope-validation-complete'); return token;
  }
  async function identity(token, signal) { const channels = []; const seenChannelIds = new Set(); const seenPageTokens = new Set(); let pageToken = null; do { if (pageToken) { if (seenPageTokens.has(pageToken)) throw new YouTubeCredentialError('youtube-identity-failed', 'Unable to verify the YouTube channel identity.'); seenPageTokens.add(pageToken); } const url = new URL(CHANNEL_URL); url.searchParams.set('maxResults', '50'); if (pageToken) url.searchParams.set('pageToken', pageToken); const data = await jsonFetch(fetchImpl, url.toString(), { headers: { Authorization: `${token.tokenType} ${token.accessToken}` }, signal }, 'youtube-identity-failed', 'Unable to verify the YouTube channel identity.'); const items = Array.isArray(data.items) ? data.items : []; for (const channel of items) { if (typeof channel?.id !== 'string' || !channel.id || seenChannelIds.has(channel.id)) continue; seenChannelIds.add(channel.id); channels.push({ channelId: channel.id, displayName: String(channel?.snippet?.title || channel.id) }); } pageToken = typeof data.nextPageToken === 'string' && data.nextPageToken ? data.nextPageToken : null; } while (pageToken); if (!channels.length) throw new YouTubeCredentialError('youtube-channel-missing', 'No YouTube channel was found for this account.'); lifecycle('channel-discovery-complete'); return channels; }
  async function bind(token, account, owner) { vault.assertOwnerContext(owner); assertPublishingScopes(token); const credentialRef = await vault.store({ ...token, channelId: account.channelId, displayName: account.displayName }, owner); vault.assertOwnerContext(owner); return { platform: 'youtube', credentialRef, accountRef: account.channelId, channelRef: account.channelId, displayName: account.displayName, authenticated: true, grantedScopes: token.scopes }; }
  async function connect(owner = vault.captureOwnerContext()) {
    vault.assertOwnerContext(owner);
    const { clientId: configuredClientId, clientSecret: configuredClientSecret } = config(oauthConfig, clientId, clientSecret); const { verifier, challenge } = createPkce(); const state = createState(); let server; let timer; const controller = new AbortController(); let rejectDeadline;
    const deadline = new Promise((_, reject) => { rejectDeadline = reject; });
    const withinDeadline = (operation) => Promise.race([operation, deadline]);
    const ownerChanged = () => { try { vault.assertOwnerContext(owner); } catch (error) { controller.abort(); rejectDeadline(error); } };
    owner.signal?.addEventListener('abort', ownerChanged, { once: true });
    try {
      const callback = await withinDeadline(new Promise((resolve, reject) => {
        server = serverFactory((request, response) => {
          const url = new URL(request.url || '/', 'http://127.0.0.1');
          if (url.pathname !== '/') { response.writeHead(404); response.end(); return; }
          const receivedState = url.searchParams.get('state'); const code = url.searchParams.get('code'); const error = url.searchParams.get('error');
          if (receivedState !== state) { response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' }); response.end('<p>Authorization could not be verified. You can return to ShortsFlow.</p>'); return; }
          if (error) { const failure = oauthError({ error }); response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' }); response.end(`<p>${failure.code === 'oauth-cancelled' ? 'Authorization was cancelled.' : 'Authorization failed. You can return to ShortsFlow.'}</p>`); return reject(failure); }
          if (!code) { response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' }); response.end('<p>Authorization failed. You can return to ShortsFlow.</p>'); return reject(new YouTubeCredentialError('oauth-callback-failed', 'YouTube authorization returned no authorization code.')); }
          response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); response.end('<p>YouTube authorization completed. You may return to ShortsFlow.</p>'); lifecycle('callback-received'); resolve(code);
        });
        server.once('error', () => reject(new YouTubeCredentialError('oauth-callback-failed', 'YouTube authorization callback could not start.')));
        server.listen(0, '127.0.0.1', () => { const address = server.address(); if (!address || typeof address === 'string') return reject(new YouTubeCredentialError('oauth-callback-failed', 'YouTube authorization callback could not start.')); const redirectUri = `http://127.0.0.1:${address.port}`; const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth'); auth.searchParams.set('client_id', configuredClientId); auth.searchParams.set('redirect_uri', redirectUri); auth.searchParams.set('response_type', 'code'); auth.searchParams.set('scope', SCOPES.join(' ')); auth.searchParams.set('access_type', 'offline'); auth.searchParams.set('prompt', 'consent'); auth.searchParams.set('code_challenge', challenge); auth.searchParams.set('code_challenge_method', 'S256'); auth.searchParams.set('state', state); timer = setTimeout(() => { controller.abort(); rejectDeadline(new YouTubeCredentialError('oauth-timeout', 'YouTube authorization timed out while completing the connection. Please try again.')); }, timeoutMs); Promise.resolve(openExternal?.(auth.toString())).catch(() => reject(new YouTubeCredentialError('oauth-browser-failed', 'Unable to open the browser for YouTube authorization.'))); server.redirectUri = redirectUri; });
      }));
      vault.assertOwnerContext(owner); const token = await withinDeadline(exchange(callback, verifier, server.redirectUri, configuredClientId, configuredClientSecret, controller.signal)); vault.assertOwnerContext(owner); const channels = await withinDeadline(identity(token, controller.signal)); vault.assertOwnerContext(owner); if (channels.length === 1) { const result = await withinDeadline(bind(token, channels[0], owner)); vault.assertOwnerContext(owner); lifecycle('credential-persisted'); lifecycle('resolved'); return result; } const selectionRef = `youtube_selection_${createState()}`; const context = { token, channels, owner, expiresAt: Date.now() + selectionTimeoutMs, timer: null, ownerAbort: null }; context.ownerAbort = () => removeSelectionContext(selectionRef); selectionContexts.set(selectionRef, context); owner.signal?.addEventListener('abort', context.ownerAbort, { once: true }); context.timer = selectionSetTimeout(() => removeSelectionContext(selectionRef), selectionTimeoutMs); vault.assertOwnerContext(owner); lifecycle('selection-required'); lifecycle('resolved'); return { platform: 'youtube', status: 'selection-required', selectionRef, channels };
    } catch (error) { vault.assertOwnerContext(owner); lifecycle(`rejected:${error?.code || 'unknown'}`); throw error;
    } finally { owner.signal?.removeEventListener('abort', ownerChanged); if (timer) clearTimeout(timer); controller.abort(); if (server?.listening) { server.closeAllConnections?.(); server.close(() => undefined); } }
  }
  async function finalizeSelection(selectionRef, channelId, owner = vault.captureOwnerContext()) {
    vault.assertOwnerContext(owner);
    const context = removeSelectionContext(selectionRef);
    if (!context || context.expiresAt <= Date.now()) throw new YouTubeCredentialError('youtube-channel-selection-expired', 'YouTube channel selection expired. Reconnect the account.');
    vault.assertOwnerContext(context.owner);
    if (context.owner.ownerId !== owner.ownerId || context.owner.generation !== owner.generation) vault.assertOwnerContext(context.owner);
    const account = context.channels.find((channel) => channel.channelId === channelId);
    if (!account) throw new YouTubeCredentialError('youtube-channel-selection-invalid', 'The selected YouTube channel could not be verified. Reconnect the account.');
    return bind(context.token, account, owner);
  }
  function cancelSelection(selectionRef, owner = vault.captureOwnerContext()) { vault.assertOwnerContext(owner); const selection = selectionContexts.get(selectionRef); if (!selection) return false; vault.assertOwnerContext(selection.owner); if (selection.owner.ownerId !== owner.ownerId || selection.owner.generation !== owner.generation) vault.assertOwnerContext(selection.owner); return Boolean(removeSelectionContext(selectionRef)); }
  async function resolveExecutionCredential(credentialRef, owner = vault.captureOwnerContext()) {
    vault.assertOwnerContext(owner);
    const material = await vault.resolve(credentialRef, owner); vault.assertOwnerContext(owner); if (Date.parse(material.expiresAt) > Date.now() + 60000) return material;
    const refreshKey = `${owner.ownerId}:${owner.generation}:${credentialRef}`;
    if (refreshFlights.has(refreshKey)) return refreshFlights.get(refreshKey);
    const flight = (async () => {
      try {
        vault.assertOwnerContext(owner);
        if (!material.refreshToken) throw new YouTubeCredentialError('credential-reconnect-required', 'YouTube authorization has expired. Reconnect the account.');
        const { clientId: configuredClientId, clientSecret: configuredClientSecret } = config(oauthConfig, clientId, clientSecret); const body = new URLSearchParams({ client_id: configuredClientId, client_secret: configuredClientSecret, refresh_token: material.refreshToken, grant_type: 'refresh_token' }); const refreshed = sanitizeTokenResponse(await jsonFetch(fetchImpl, TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: owner.signal }, 'credential-refresh-failed', 'YouTube authorization could not be refreshed.')); vault.assertOwnerContext(owner); const next = { ...material, ...refreshed, scopes: refreshed.scopes.length ? refreshed.scopes : material.scopes, refreshToken: refreshed.refreshToken || material.refreshToken }; assertPublishingScopes(next); await vault.update(credentialRef, next, owner); vault.assertOwnerContext(owner); return next;
      } catch (error) {
        if (error?.code === 'credential-reconnect-required') {
          try { vault.assertOwnerContext(owner); await vault.remove(credentialRef, owner); } catch { /* Preserve the terminal authentication result without exposing vault details. */ }
        }
        vault.assertOwnerContext(owner);
        throw error;
      }
    })(); refreshFlights.set(refreshKey, flight); try { return await flight; } finally { refreshFlights.delete(refreshKey); }
  }
  return {
    connect,
    finalizeSelection,
    cancelSelection,
    resolveExecutionCredential,
    disconnect: async (ref, owner = vault.captureOwnerContext()) => { vault.assertOwnerContext(owner); const removed = await vault.remove(ref, owner); vault.assertOwnerContext(owner); return removed; },
    status: async (ref, owner = vault.captureOwnerContext()) => { vault.assertOwnerContext(owner); await vault.assertAccessible(ref, owner); vault.assertOwnerContext(owner); return { credentialRef: ref, authenticated: true }; },
  };
}

module.exports = { ANALYTICS_SCOPE, PUBLISHING_SCOPES, SCOPES, TOKEN_URL, createTokenExchangeRequest, createYouTubeAuthService };
