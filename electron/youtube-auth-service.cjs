const http = require('http');
const { shell } = require('electron');
const { createPkce, createState, YouTubeCredentialError } = require('./youtube-credentials.cjs');

const SCOPES = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'];
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CHANNEL_URL = 'https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true';

function config(clientIdOverride) { const clientId = typeof clientIdOverride === 'function' ? clientIdOverride() : clientIdOverride || process.env.SHORTSFLOW_YOUTUBE_CLIENT_ID; if (!clientId) throw new YouTubeCredentialError('oauth-configuration-missing', 'YouTube OAuth is not configured for this application.'); return { clientId }; }
function oauthError(payload) { const code = payload?.error === 'access_denied' ? 'oauth-cancelled' : 'oauth-callback-failed'; return new YouTubeCredentialError(code, code === 'oauth-cancelled' ? 'YouTube authorization was cancelled.' : 'YouTube authorization callback failed.'); }
function sanitizeTokenResponse(response) { return { accessToken: String(response.access_token || ''), refreshToken: typeof response.refresh_token === 'string' ? response.refresh_token : null, expiresAt: new Date(Date.now() + Number(response.expires_in || 0) * 1000).toISOString(), scopes: typeof response.scope === 'string' ? response.scope.split(' ').filter(Boolean) : [], tokenType: String(response.token_type || 'Bearer'), provider: 'youtube' }; }
function assertRequiredScopes(token) {
  const granted = new Set(token.scopes);
  if (SCOPES.some((scope) => !granted.has(scope))) throw new YouTubeCredentialError('insufficient-scope', 'The connected YouTube account does not grant the required publishing permissions. Reconnect the account and approve all requested permissions.');
}
async function jsonFetch(fetchImpl, url, options, errorCode, message) { let response; try { response = await fetchImpl(url, options); } catch { throw new YouTubeCredentialError('youtube-network-failure', 'Unable to reach YouTube. Please try again.'); } let body = {}; try { body = await response.json(); } catch {} if (!response.ok) { if (body?.error === 'invalid_grant' || response.status === 401) throw new YouTubeCredentialError('credential-reconnect-required', 'YouTube authorization has expired or was revoked. Reconnect the account.'); if (response.status === 403) throw new YouTubeCredentialError('insufficient-scope', 'The connected YouTube account does not grant the required permissions.'); throw new YouTubeCredentialError(errorCode, message); } return body; }

function createYouTubeAuthService({ vault, fetchImpl = fetch, openExternal = shell?.openExternal, timeoutMs = 300000, selectionTimeoutMs = 300000, serverFactory = http.createServer, selectionSetTimeout = setTimeout, selectionClearTimeout = clearTimeout, clientId } = {}) {
  const refreshFlights = new Map();
  const selectionContexts = new Map();
  function removeSelectionContext(selectionRef) {
    const context = selectionContexts.get(selectionRef);
    if (!context) return null;
    selectionContexts.delete(selectionRef);
    if (context.timer !== null) selectionClearTimeout(context.timer);
    return context;
  }
  async function exchange(code, verifier, redirectUri) { const { clientId: configuredClientId } = config(clientId); const body = new URLSearchParams({ code, client_id: configuredClientId, redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: verifier }); const result = await jsonFetch(fetchImpl, TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }, 'oauth-exchange-failed', 'YouTube authorization could not be completed.'); const token = sanitizeTokenResponse(result); if (!token.accessToken) throw new YouTubeCredentialError('oauth-exchange-failed', 'YouTube authorization returned no access token.'); assertRequiredScopes(token); return token; }
  async function identity(token) { const channels = []; const seenChannelIds = new Set(); const seenPageTokens = new Set(); let pageToken = null; do { if (pageToken) { if (seenPageTokens.has(pageToken)) throw new YouTubeCredentialError('youtube-identity-failed', 'Unable to verify the YouTube channel identity.'); seenPageTokens.add(pageToken); } const url = new URL(CHANNEL_URL); url.searchParams.set('maxResults', '50'); if (pageToken) url.searchParams.set('pageToken', pageToken); const data = await jsonFetch(fetchImpl, url.toString(), { headers: { Authorization: `${token.tokenType} ${token.accessToken}` } }, 'youtube-identity-failed', 'Unable to verify the YouTube channel identity.'); const items = Array.isArray(data.items) ? data.items : []; for (const channel of items) { if (typeof channel?.id !== 'string' || !channel.id || seenChannelIds.has(channel.id)) continue; seenChannelIds.add(channel.id); channels.push({ channelId: channel.id, displayName: String(channel?.snippet?.title || channel.id) }); } pageToken = typeof data.nextPageToken === 'string' && data.nextPageToken ? data.nextPageToken : null; } while (pageToken); if (!channels.length) throw new YouTubeCredentialError('youtube-channel-missing', 'No YouTube channel was found for this account.'); return channels; }
  async function bind(token, account) { assertRequiredScopes(token); const credentialRef = await vault.store({ ...token, channelId: account.channelId, displayName: account.displayName }); return { platform: 'youtube', credentialRef, accountRef: account.channelId, channelRef: account.channelId, displayName: account.displayName, authenticated: true, grantedScopes: token.scopes }; }
  async function connect() {
    const { clientId: configuredClientId } = config(clientId); const { verifier, challenge } = createPkce(); const state = createState(); let server; let timer;
    try {
      const callback = await new Promise((resolve, reject) => {
        server = serverFactory((request, response) => {
          const url = new URL(request.url || '/', 'http://127.0.0.1');
          if (url.pathname !== '/oauth2/callback') { response.writeHead(404); response.end(); return; }
          const receivedState = url.searchParams.get('state'); const code = url.searchParams.get('code'); const error = url.searchParams.get('error');
          if (receivedState !== state) { response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' }); response.end('<p>Authorization could not be verified. You can return to ShortsFlow.</p>'); return; }
          if (error) { const failure = oauthError({ error }); response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' }); response.end(`<p>${failure.code === 'oauth-cancelled' ? 'Authorization was cancelled.' : 'Authorization failed. You can return to ShortsFlow.'}</p>`); return reject(failure); }
          if (!code) { response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' }); response.end('<p>Authorization failed. You can return to ShortsFlow.</p>'); return reject(new YouTubeCredentialError('oauth-callback-failed', 'YouTube authorization returned no authorization code.')); }
          response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); response.end('<p>YouTube authorization completed. You may return to ShortsFlow.</p>'); resolve(code);
        });
        server.once('error', () => reject(new YouTubeCredentialError('oauth-callback-failed', 'YouTube authorization callback could not start.')));
        server.listen(0, '127.0.0.1', () => { const address = server.address(); if (!address || typeof address === 'string') return reject(new YouTubeCredentialError('oauth-callback-failed', 'YouTube authorization callback could not start.')); const redirectUri = `http://127.0.0.1:${address.port}/oauth2/callback`; const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth'); auth.searchParams.set('client_id', configuredClientId); auth.searchParams.set('redirect_uri', redirectUri); auth.searchParams.set('response_type', 'code'); auth.searchParams.set('scope', SCOPES.join(' ')); auth.searchParams.set('access_type', 'offline'); auth.searchParams.set('prompt', 'consent'); auth.searchParams.set('code_challenge', challenge); auth.searchParams.set('code_challenge_method', 'S256'); auth.searchParams.set('state', state); timer = setTimeout(() => reject(new YouTubeCredentialError('oauth-timeout', 'YouTube authorization timed out. Please try again.')), timeoutMs); Promise.resolve(openExternal?.(auth.toString())).catch(() => reject(new YouTubeCredentialError('oauth-browser-failed', 'Unable to open the browser for YouTube authorization.'))); server.redirectUri = redirectUri; });
      });
      const token = await exchange(callback, verifier, server.redirectUri); const channels = await identity(token); if (channels.length === 1) return bind(token, channels[0]); const selectionRef = `youtube_selection_${createState()}`; const context = { token, channels, expiresAt: Date.now() + selectionTimeoutMs, timer: null }; selectionContexts.set(selectionRef, context); context.timer = selectionSetTimeout(() => removeSelectionContext(selectionRef), selectionTimeoutMs); return { platform: 'youtube', status: 'selection-required', selectionRef, channels };
    } finally { if (timer) clearTimeout(timer); if (server?.listening) await new Promise((resolve) => server.close(() => resolve())); }
  }
  async function finalizeSelection(selectionRef, channelId) {
    const context = removeSelectionContext(selectionRef);
    if (!context || context.expiresAt <= Date.now()) throw new YouTubeCredentialError('youtube-channel-selection-expired', 'YouTube channel selection expired. Reconnect the account.');
    const account = context.channels.find((channel) => channel.channelId === channelId);
    if (!account) throw new YouTubeCredentialError('youtube-channel-selection-invalid', 'The selected YouTube channel could not be verified. Reconnect the account.');
    return bind(context.token, account);
  }
  function cancelSelection(selectionRef) { return Boolean(removeSelectionContext(selectionRef)); }
  async function resolveExecutionCredential(credentialRef) {
    const material = await vault.resolve(credentialRef); if (Date.parse(material.expiresAt) > Date.now() + 60000) return material;
    if (refreshFlights.has(credentialRef)) return refreshFlights.get(credentialRef);
    const flight = (async () => {
      try {
        if (!material.refreshToken) throw new YouTubeCredentialError('credential-reconnect-required', 'YouTube authorization has expired. Reconnect the account.');
        const { clientId: configuredClientId } = config(clientId); const body = new URLSearchParams({ client_id: configuredClientId, refresh_token: material.refreshToken, grant_type: 'refresh_token' }); const refreshed = sanitizeTokenResponse(await jsonFetch(fetchImpl, TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }, 'credential-refresh-failed', 'YouTube authorization could not be refreshed.')); const next = { ...material, ...refreshed, scopes: refreshed.scopes.length ? refreshed.scopes : material.scopes, refreshToken: refreshed.refreshToken || material.refreshToken }; assertRequiredScopes(next); await vault.update(credentialRef, next); return next;
      } catch (error) {
        if (error?.code === 'credential-reconnect-required') {
          try { await vault.remove(credentialRef); } catch { /* Preserve the terminal authentication result without exposing vault details. */ }
        }
        throw error;
      }
    })(); refreshFlights.set(credentialRef, flight); try { return await flight; } finally { refreshFlights.delete(credentialRef); }
  }
  return { connect, finalizeSelection, cancelSelection, resolveExecutionCredential, disconnect: (ref) => vault.remove(ref), status: async (ref) => ({ credentialRef: ref, authenticated: await vault.exists(ref) }) };
}

module.exports = { SCOPES, createYouTubeAuthService };
