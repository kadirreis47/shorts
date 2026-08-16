const OWNER_ERROR_CODE = 'youtube-owner-authorization-required';
const OWNER_ERROR_MESSAGE = 'YouTube access is unavailable for the signed-in user. Sign in again and reconnect YouTube.';

class YouTubeOwnerError extends Error {
  constructor() { super(OWNER_ERROR_MESSAGE); this.name = 'YouTubeOwnerError'; this.code = OWNER_ERROR_CODE; }
}

function validAccessToken(value) {
  return typeof value === 'string' && value.length >= 20 && value.length <= 16_384 && !/\s/.test(value);
}

function validUserId(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function tokenExpiresAt(accessToken) {
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString('utf8'));
    const expiresAt = Number(payload?.exp) * 1000;
    return Number.isFinite(expiresAt) && expiresAt > Date.now() ? expiresAt : null;
  } catch { return null; }
}

function createSupabaseOwnerValidator({ resolveConfig, fetchImpl = globalThis.fetch, timeoutMs = 10_000 } = {}) {
  if (typeof resolveConfig !== 'function' || typeof fetchImpl !== 'function') throw new TypeError('Supabase owner validation is not configured.');
  return async (accessToken) => {
    if (!validAccessToken(accessToken)) throw new YouTubeOwnerError();
    const config = resolveConfig();
    if (!config?.url || !config?.anonKey) throw new YouTubeOwnerError();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${config.url.replace(/\/$/, '')}/auth/v1/user`, {
        method: 'GET',
        signal: controller.signal,
        headers: { apikey: config.anonKey, Authorization: `Bearer ${accessToken}` },
      });
      if (!response?.ok) throw new YouTubeOwnerError();
      const body = await response.json();
      if (!validUserId(body?.id)) throw new YouTubeOwnerError();
      const expiresAt = tokenExpiresAt(accessToken);
      if (!expiresAt) throw new YouTubeOwnerError();
      return { ownerId: body.id, expiresAt };
    } catch {
      throw new YouTubeOwnerError();
    } finally {
      clearTimeout(timer);
    }
  };
}

function createYouTubeOwnerContext({ validateAccessToken }) {
  if (typeof validateAccessToken !== 'function') throw new TypeError('A trusted Supabase access-token validator is required.');
  let ownerId = null;
  let generation = 0;
  let validationAttempt = 0;
  let ownerAbortController = new AbortController();
  let expiresAt = null;
  let expiryTimer = null;
  let transitioning = false;
  let transitionAttempt = 0;
  let criticalOperations = 0;
  const criticalWaiters = new Set();

  function fail() { throw new YouTubeOwnerError(); }
  function capture() {
    if (expiresAt !== null && expiresAt <= Date.now()) void clear();
    if (transitioning || !ownerId || ownerAbortController.signal.aborted) return fail();
    return Object.freeze({ ownerId, generation, signal: ownerAbortController.signal });
  }
  function isCurrent(context) {
    return !transitioning && Boolean(context) && context.ownerId === ownerId && context.generation === generation && !context.signal?.aborted && (expiresAt === null || expiresAt > Date.now());
  }
  function assertCurrent(context) { if (!isCurrent(context)) fail(); }
  function assertCriticalCurrent(context) {
    if (!context || context.ownerId !== ownerId || context.generation !== generation || (expiresAt !== null && expiresAt <= Date.now())) fail();
  }
  async function runCritical(context, operation) {
    assertCurrent(context);
    criticalOperations += 1;
    try { return await operation(); }
    finally {
      criticalOperations -= 1;
      if (criticalOperations === 0) {
        for (const resolve of criticalWaiters) resolve();
        criticalWaiters.clear();
      }
    }
  }
  async function waitForCriticalOperations() {
    if (criticalOperations === 0) return;
    await new Promise((resolve) => criticalWaiters.add(resolve));
  }
  async function transitionTo(nextOwnerId, nextExpiry, attempt) {
    const ownTransition = ++transitionAttempt;
    transitioning = true;
    ownerAbortController.abort();
    await waitForCriticalOperations();
    if (attempt !== validationAttempt || ownTransition !== transitionAttempt) fail();
    ownerAbortController = new AbortController();
    ownerId = nextOwnerId;
    generation += 1;
    expiresAt = nextExpiry;
    transitioning = false;
  }
  async function establish(accessToken) {
    const attempt = ++validationAttempt;
    let validated;
    try { validated = await validateAccessToken(accessToken); }
    catch { if (attempt !== validationAttempt) fail(); throw new YouTubeOwnerError(); }
    const validatedOwnerId = typeof validated === 'string' ? validated : validated?.ownerId;
    const validatedExpiry = typeof validated === 'object' && Number.isFinite(validated?.expiresAt) ? validated.expiresAt : null;
    if (attempt !== validationAttempt || !validUserId(validatedOwnerId)) fail();
    const changed = ownerId !== validatedOwnerId || transitioning;
    if (changed) {
      await transitionTo(validatedOwnerId, validatedExpiry, attempt);
    } else {
      expiresAt = validatedExpiry;
    }
    if (expiryTimer) clearTimeout(expiryTimer);
    expiryTimer = expiresAt === null ? null : setTimeout(() => void clear(), Math.max(0, expiresAt - Date.now()));
    expiryTimer?.unref?.();
    return { ready: true, ownerId: validatedOwnerId, changed };
  }
  async function clear() {
    validationAttempt += 1;
    const ownTransition = ++transitionAttempt;
    if (expiryTimer) clearTimeout(expiryTimer);
    expiryTimer = null;
    expiresAt = null;
    const changed = ownerId !== null;
    if (changed) {
      transitioning = true;
      ownerAbortController.abort();
      await waitForCriticalOperations();
      if (ownTransition !== transitionAttempt) return { ready: false, changed: true };
      ownerAbortController = new AbortController();
      ownerId = null;
      generation += 1;
    }
    if (ownTransition === transitionAttempt) transitioning = false;
    return { ready: false, changed };
  }

  return { establish, clear, capture, assertCurrent, assertCriticalCurrent, isCurrent, runCritical };
}

module.exports = {
  OWNER_ERROR_CODE,
  OWNER_ERROR_MESSAGE,
  YouTubeOwnerError,
  createSupabaseOwnerValidator,
  createYouTubeOwnerContext,
  validAccessToken,
  validUserId,
  tokenExpiresAt,
};
