const { app, ipcMain } = require('electron');
const { createCredentialVault, publicError } = require('./youtube-credentials.cjs');
const { createYouTubeAuthService } = require('./youtube-auth-service.cjs');
const { resolveYouTubeOAuthConfig } = require('./youtube-runtime-config.cjs');
const { resolveSupabaseAuthConfig } = require('./supabase-runtime-config.cjs');
const { createSupabaseOwnerValidator, createYouTubeOwnerContext } = require('./youtube-owner-context.cjs');
const { createYouTubeUploadCheckpointStore, YouTubeCheckpointError } = require('./youtube-upload-checkpoints.cjs');
const { createYouTubePublishService, YouTubePublishError } = require('./youtube-publish-service.cjs');
const { createYouTubeAnalyticsService, YouTubeAnalyticsError, validRequest: validAnalyticsRequest } = require('./youtube-analytics-service.cjs');
const { ArtifactIntegrityError } = require('./artifact-integrity.cjs');
const { ArtifactSnapshotError, createArtifactSnapshotStore } = require('./artifact-snapshot.cjs');
const path = require('path');

function validCredentialRef(value) { return typeof value === 'string' && /^youtube_[0-9a-f-]{36}$/i.test(value); }
function validSelectionRef(value) { return typeof value === 'string' && /^youtube_selection_[A-Za-z0-9_-]{32,}$/.test(value); }
function validChannelRef(value) { return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value); }
function validPublishRequest(value) {
  return Boolean(value) && typeof value === 'object' && value.platform === 'youtube'
    && typeof value.jobId === 'string' && value.jobId.length > 0 && value.jobId.length <= 256
    && typeof value.idempotencyKey === 'string' && value.idempotencyKey.length > 0 && value.idempotencyKey.length <= 256
    && typeof value.approvalFingerprint === 'string' && value.approvalFingerprint.length > 0
    && typeof value.approvedAt === 'string' && Number.isFinite(Date.parse(value.approvedAt))
    && value.account?.platform === 'youtube' && validCredentialRef(value.account.credentialRef)
    && typeof value.account.accountId === 'string' && value.account.accountId.length > 0 && typeof value.account.accountRef === 'string' && validChannelRef(value.account.channelRef)
    && typeof value.target?.accountId === 'string' && validChannelRef(value.target.channelRef)
    && value.artifact && typeof value.artifact.artifactPath === 'string' && value.artifact.artifactPath.length > 0 && !value.artifact.artifactPath.includes('\0')
    && Number.isSafeInteger(value.artifact.sizeBytes) && value.artifact.sizeBytes > 0
    && typeof value.artifact.artifactFingerprint === 'string' && /^[a-z0-9_-]+$/i.test(value.artifact.artifactFingerprint)
    && typeof value.artifact.contentDigest === 'string' && /^[a-f0-9]{64}$/.test(value.artifact.contentDigest)
    && value.metadata && typeof value.metadata.title === 'string' && typeof value.metadata.description === 'string' && typeof value.metadata.caption === 'string'
    && typeof value.outboundDescription === 'string' && value.outboundDescription.length <= 5000
    && (!value.recovery || (typeof value.recovery === 'object'
      && typeof value.recovery.jobState === 'string'
      && (value.recovery.remoteState === null || typeof value.recovery.remoteState === 'string')
      && (value.recovery.failureCode === null || typeof value.recovery.failureCode === 'string')))
    && Array.isArray(value.metadata.hashtags) && value.metadata.hashtags.every((tag) => typeof tag === 'string')
    && ['public', 'unlisted', 'private'].includes(value.metadata.visibility) && value.metadata.audienceFlags && typeof value.metadata.audienceFlags === 'object'
    && (value.metadata.language === null || typeof value.metadata.language === 'string') && (value.metadata.category === null || typeof value.metadata.category === 'string');
}
function safeAnalyticsError(error) {
  if (error?.name === 'YouTubeOwnerError') return { code: String(error.code), message: String(error.message), retryable: false, status: 401, retryAfterMs: null };
  if (error?.name === 'YouTubeCredentialError') {
    const authentication = ['credential-unavailable', 'credential-reconnect-required', 'credential-missing', 'insufficient-scope', 'credential-storage-failed'].includes(error.code);
    const retryable = ['secure-storage-unavailable', 'credential-refresh-failed', 'youtube-network-failure'].includes(error.code);
    return { code: String(error.code), message: String(error.message), retryable, status: authentication ? 401 : 503, retryAfterMs: null };
  }
  if (error instanceof YouTubeAnalyticsError) return { code: String(error.code), message: String(error.message), retryable: Boolean(error.retryable), status: Number(error.status || 500), retryAfterMs: Number.isFinite(error.retryAfterMs) ? error.retryAfterMs : null };
  return { code: 'youtube-analytics-failed', message: 'YouTube analytics failed safely.', retryable: false, status: 500, retryAfterMs: null };
}
function safeAnalyticsResult(result) {
  return {
    metrics: Array.isArray(result?.metrics) ? result.metrics.map((metric) => ({ rawMetricId: String(metric.rawMetricId || ''), value: metric.value === null || typeof metric.value === 'number' || typeof metric.value === 'string' ? metric.value : null, availability: typeof metric.availability === 'string' ? metric.availability : undefined, observedAt: typeof metric.observedAt === 'string' ? metric.observedAt : null })).filter((metric) => metric.rawMetricId) : [],
    diagnostics: Array.isArray(result?.diagnostics) ? result.diagnostics.map((item) => ({ code: String(item.code || 'malformed-metric'), severity: ['info', 'warning', 'error'].includes(item.severity) ? item.severity : 'warning', message: String(item.message || 'YouTube analytics returned incomplete data.') })) : [],
  };
}
function safePublishError(error) {
  if (error?.name === 'YouTubeOwnerError') return { code: String(error.code), message: String(error.message), retryable: false, status: 401, retryAfterUtc: null };
  if (error?.name === 'YouTubeCredentialError') {
    const authentication = ['credential-unavailable', 'credential-reconnect-required', 'credential-missing', 'insufficient-scope', 'credential-storage-failed'].includes(error.code);
    const retryable = ['secure-storage-unavailable', 'credential-refresh-failed', 'youtube-network-failure'].includes(error.code);
    return { code: String(error.code), message: String(error.message), retryable, status: authentication ? 401 : 503, retryAfterUtc: null };
  }
  if (error instanceof YouTubePublishError || error instanceof YouTubeCheckpointError || error instanceof ArtifactIntegrityError || error instanceof ArtifactSnapshotError) return { code: String(error.code), message: String(error.message), retryable: Boolean(error.retryable), status: Number(error.status || 500), retryAfterUtc: error.retryAfterUtc ?? null };
  return { code: 'youtube-publish-failed', message: 'YouTube publishing failed safely.', retryable: false, status: 500, retryAfterUtc: null };
}
function registerYouTubeHandlers({ electron = require('electron'), service, publishService, analyticsService, ownerContext: ownerContextOverride, validateAccessToken } = {}) {
  const runtime = electron;
  const userDataPath = runtime.app.getPath('userData');
  const ownerContext = ownerContextOverride || createYouTubeOwnerContext({ validateAccessToken: validateAccessToken || createSupabaseOwnerValidator({ resolveConfig: () => resolveSupabaseAuthConfig({ isPackaged: runtime.app.isPackaged }) }) });
  const auth = service || createYouTubeAuthService({ vault: createCredentialVault({ userDataPath, safeStorage: runtime.safeStorage, ownerContext }), oauthConfig: () => resolveYouTubeOAuthConfig({ userDataPath }) });
  const publisher = publishService || createYouTubePublishService({ auth, ownerContext, checkpoints: createYouTubeUploadCheckpointStore({ userDataPath, safeStorage: runtime.safeStorage }), snapshots: createArtifactSnapshotStore({ directory: path.resolve(userDataPath, 'youtube-upload-snapshots') }) });
  let analytics = analyticsService;
  if (typeof publisher.initialize === 'function') void publisher.initialize().catch(() => undefined);
  const handle = (operation) => async (_event, input = {}) => {
    try {
      const owner = ownerContext.capture();
      if ((operation === 'disconnect' || operation === 'status') && !validCredentialRef(input.credentialRef)) throw Object.assign(new Error('Invalid YouTube credential reference.'), { code: 'invalid-request' });
      if ((operation === 'finalize' || operation === 'cancel-selection') && !validSelectionRef(input.selectionRef)) throw Object.assign(new Error('Invalid YouTube channel selection.'), { code: 'invalid-request' });
      if (operation === 'finalize' && !validChannelRef(input.channelRef)) throw Object.assign(new Error('Invalid YouTube channel selection.'), { code: 'invalid-request' });
      let result;
      if (operation === 'connect') result = await auth.connect(owner);
      else if (operation === 'disconnect') result = { credentialRef: input.credentialRef, disconnected: await auth.disconnect(input.credentialRef, owner) };
      else if (operation === 'finalize') result = await auth.finalizeSelection(input.selectionRef, input.channelRef, owner);
      else if (operation === 'cancel-selection') result = { selectionRef: input.selectionRef, cancelled: auth.cancelSelection(input.selectionRef, owner) };
      else result = await auth.status(input.credentialRef, owner);
      ownerContext.assertCurrent(owner);
      return result;
    } catch (error) { const safe = publicError(error); const failure = new Error(safe.message); failure.code = safe.code; throw failure; }
  };
  const status = async (_event, input = {}) => {
    try {
      const owner = ownerContext.capture();
      if (!validCredentialRef(input.credentialRef)) throw Object.assign(new Error('Invalid YouTube credential reference.'), { code: 'invalid-request' });
      const result = await auth.status(input.credentialRef, owner);
      ownerContext.assertCurrent(owner);
      return { ok: true, status: result };
    } catch (error) {
      return { ok: false, error: publicError(error) };
    }
  };
  runtime.ipcMain.handle('youtube:owner-context', async (_event, input = {}) => {
    try { return { ok: true, result: await ownerContext.establish(input.accessToken) }; }
    catch (error) { return { ok: false, error: publicError(error) }; }
  });
  runtime.ipcMain.handle('youtube:clear-owner-context', async () => ({ ok: true, result: await ownerContext.clear() }));
  runtime.ipcMain.handle('youtube:connect', handle('connect'));
  runtime.ipcMain.handle('youtube:disconnect', handle('disconnect'));
  runtime.ipcMain.handle('youtube:status', status);
  runtime.ipcMain.handle('youtube:finalize-selection', handle('finalize'));
  runtime.ipcMain.handle('youtube:cancel-selection', handle('cancel-selection'));
  runtime.ipcMain.handle('youtube:publish', async (_event, input) => { try { const owner = ownerContext.capture(); if (!validPublishRequest(input)) throw new YouTubePublishError('invalid-request', 'Invalid YouTube publish request.', { status: 400 }); const result = await publisher.publish(input, owner); ownerContext.assertCurrent(owner); return { ok: true, result: { remotePublishId: result.remotePublishId, remoteUrl: result.remoteUrl, state: result.state, retryAfterUtc: result.retryAfterUtc ?? null } }; } catch (error) { return { ok: false, error: safePublishError(error) }; } });
  runtime.ipcMain.handle('youtube:reconcile-publish', async (_event, input) => { try { const owner = ownerContext.capture(); if (!validPublishRequest(input)) throw new YouTubePublishError('invalid-request', 'Invalid YouTube reconciliation request.', { status: 400 }); const result = await publisher.reconcile(input, owner); ownerContext.assertCurrent(owner); return { ok: true, result: { found: result.found !== false, remotePublishId: result.remotePublishId, remoteUrl: result.remoteUrl, state: result.state, retryAfterUtc: result.retryAfterUtc ?? null, restartRequired: result.restartRequired === true, approvalMismatch: result.approvalMismatch === true } }; } catch (error) { return { ok: false, error: safePublishError(error) }; } });
  runtime.ipcMain.handle('youtube:cancel-publish', async (_event, input) => { try { const owner = ownerContext.capture(); const cancelled = typeof input?.jobId === 'string' ? publisher.cancel(input.jobId, owner) : false; ownerContext.assertCurrent(owner); return { cancelled }; } catch { return { cancelled: false }; } });
  runtime.ipcMain.handle('youtube:acknowledge-receipt', async (_event, input) => { try { const owner = ownerContext.capture(); if (!validPublishRequest(input) || typeof input.remotePublishId !== 'string') return { acknowledged: false }; const acknowledged = await publisher.acknowledgeReceipt(input, owner); ownerContext.assertCurrent(owner); return { acknowledged }; } catch { return { acknowledged: false }; } });
  runtime.ipcMain.handle('youtube:collect-analytics', async (_event, input) => { try { const owner = ownerContext.capture(); if (!validAnalyticsRequest(input)) throw new YouTubeAnalyticsError('invalid-request', 'Invalid YouTube analytics request.', { status: 400 }); analytics ??= createYouTubeAnalyticsService({ auth }); const result = await analytics.collect(input, owner); ownerContext.assertCurrent(owner); return { ok: true, result: safeAnalyticsResult(result) }; } catch (error) { return { ok: false, error: safeAnalyticsError(error) }; } });
  return () => ['youtube:owner-context', 'youtube:clear-owner-context', 'youtube:connect', 'youtube:disconnect', 'youtube:status', 'youtube:finalize-selection', 'youtube:cancel-selection', 'youtube:publish', 'youtube:reconcile-publish', 'youtube:cancel-publish', 'youtube:acknowledge-receipt', 'youtube:collect-analytics'].forEach((channel) => runtime.ipcMain.removeHandler(channel));
}
module.exports = { registerYouTubeHandlers, safePublishError, safeAnalyticsError, safeAnalyticsResult, validCredentialRef, validSelectionRef, validChannelRef, validPublishRequest, validAnalyticsRequest };
