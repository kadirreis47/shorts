// This entry runs in Electron's sandboxed preload context. Keep it self-contained:
// sandboxed preloads can require Electron's built-ins but cannot require sibling files.
const ALLOWED_FFMPEG_API_KEYS = Object.freeze([
  'getCapabilities', 'createCanonicalRenderPlan', 'executeCanonicalRenderPlan', 'cancel',
  'resourceExists', 'materializeRenderArtifact', 'issueSegmentResource',
  'getSegmentCacheStats', 'clearSegmentCache', 'analyzeRenderArtifact',
  'verifyRenderArtifact', 'revalidateArtifact', 'onProgress',
  'pickOutputPath', 'openVerifiedExport', 'revealVerifiedExport', 'saveVerifiedExportAs',
  'probeManualMp4',
  'resolveImageDisplayGeometry',
]);

const ALLOWED_YOUTUBE_API_KEYS = Object.freeze([
  'establishOwnerContext', 'clearOwnerContext', 'connect', 'disconnect', 'status', 'finalizeSelection', 'cancelSelection', 'publish',
  'reconcilePublish', 'cancelPublish', 'acknowledgeReceipt', 'collectAnalytics',
]);

function validCredentialRef(value) {
  return typeof value === 'string' && /^youtube_[0-9a-f-]{36}$/i.test(value);
}

function validAccessToken(value) {
  return typeof value === 'string' && value.length >= 20 && value.length <= 16_384 && !/\s/.test(value);
}

function validSelectionRef(value) {
  return typeof value === 'string' && /^youtube_selection_[A-Za-z0-9_-]{32,}$/.test(value);
}

function validChannelRef(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function validPublishRequest(value) {
  return Boolean(value) && typeof value === 'object' && value.platform === 'youtube'
    && Object.keys(value).every((key) => ['jobId', 'idempotencyKey', 'platform', 'approvalFingerprint', 'approvedAt', 'target', 'account', 'artifact', 'metadata', 'outboundDescription', 'remotePublishId', 'recovery'].includes(key))
    && typeof value.jobId === 'string' && value.jobId.length > 0
    && typeof value.idempotencyKey === 'string' && value.idempotencyKey.length > 0
    && validCredentialRef(value.account?.credentialRef) && validChannelRef(value.account?.channelRef) && typeof value.account?.accountId === 'string'
    && typeof value.target?.accountId === 'string' && validChannelRef(value.target?.channelRef)
    && Boolean(value.artifact) && typeof value.artifact === 'object' && !Array.isArray(value.artifact)
    && Object.keys(value.artifact).every((key) => ['verifiedExportReference', 'artifactFingerprint'].includes(key))
    && /^vea1_[A-Za-z0-9_-]{43}$/.test(value.artifact.verifiedExportReference || '')
    && typeof value.artifact.artifactFingerprint === 'string' && /^[a-z0-9_-]+$/i.test(value.artifact.artifactFingerprint)
    && typeof value.outboundDescription === 'string' && value.outboundDescription.length <= 5000
    && (!value.recovery || (typeof value.recovery === 'object'
      && typeof value.recovery.jobState === 'string'
      && (value.recovery.remoteState === null || typeof value.recovery.remoteState === 'string')
      && (value.recovery.failureCode === null || typeof value.recovery.failureCode === 'string')));
}

function validArtifactIntegrityRequest(value) {
  return Boolean(value) && typeof value === 'object'
    && typeof value.artifactPath === 'string' && value.artifactPath.length > 0 && !value.artifactPath.includes('\0')
    && Number.isSafeInteger(value.sizeBytes) && value.sizeBytes >= 0
    && typeof value.contentDigest === 'string' && /^[a-f0-9]{64}$/.test(value.contentDigest);
}

function validPrivateImageGeometryRequest(accessToken, media) {
  return validAccessToken(accessToken) && Boolean(media) && typeof media === 'object' && media.bucket === 'media'
    && typeof media.objectPath === 'string'
    && /^[0-9a-f-]{36}\/generated-images\/[0-9a-f-]{36}\.(?:png|jpg)$/i.test(media.objectPath);
}

function validRenderPlanReference(value) {
  return typeof value === 'string' && /^crp1_[A-Za-z0-9_-]{43}$/.test(value);
}

function validCanonicalRenderRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const allowed = new Set(['operation', 'jobId', 'outputPath', 'outputResourceReference', 'intent']);
  let serialized;
  try { serialized = JSON.stringify(value); } catch { return false; }
  return Object.keys(value).every((key) => allowed.has(key))
    && ['full-render', 'segment-render', 'segment-concat'].includes(value.operation)
    && typeof value.jobId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value.jobId)
    && serialized.length <= 4 * 1024 * 1024
    && Boolean(value.intent) && typeof value.intent === 'object' && !Array.isArray(value.intent)
    && !Object.prototype.hasOwnProperty.call(value, 'args');
}

function validAnalyticsRequest(value) {
  return Boolean(value) && typeof value === 'object'
    && validCredentialRef(value.credentialRef) && validChannelRef(value.channelRef)
    && typeof value.remotePublicationId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value.remotePublicationId)
    && typeof value.publishedAt === 'string' && Number.isFinite(Date.parse(value.publishedAt))
    && ['1h', '6h', '24h', '48h', '7d', '30d', 'lifetime'].includes(value.window)
    && !Object.prototype.hasOwnProperty.call(value, 'accessToken') && !Object.prototype.hasOwnProperty.call(value, 'refreshToken');
}

function createYouTubeBridge(ipcRenderer) {
  return Object.freeze({
    establishOwnerContext: (accessToken) => validAccessToken(accessToken)
      ? ipcRenderer.invoke('youtube:owner-context', { accessToken })
      : Promise.reject(new TypeError('Invalid authenticated owner token.')),
    clearOwnerContext: () => ipcRenderer.invoke('youtube:clear-owner-context'),
    connect: () => ipcRenderer.invoke('youtube:connect'),
    disconnect: (credentialRef) => validCredentialRef(credentialRef)
      ? ipcRenderer.invoke('youtube:disconnect', { credentialRef })
      : Promise.reject(new TypeError('Invalid YouTube credential reference.')),
    status: (credentialRef) => validCredentialRef(credentialRef)
      ? ipcRenderer.invoke('youtube:status', { credentialRef })
      : Promise.reject(new TypeError('Invalid YouTube credential reference.')),
    finalizeSelection: (selectionRef, channelRef) => validSelectionRef(selectionRef) && validChannelRef(channelRef)
      ? ipcRenderer.invoke('youtube:finalize-selection', { selectionRef, channelRef })
      : Promise.reject(new TypeError('Invalid YouTube channel selection.')),
    cancelSelection: (selectionRef) => validSelectionRef(selectionRef)
      ? ipcRenderer.invoke('youtube:cancel-selection', { selectionRef })
      : Promise.reject(new TypeError('Invalid YouTube channel selection.')),
    publish: (request) => validPublishRequest(request) ? ipcRenderer.invoke('youtube:publish', request) : Promise.reject(new TypeError('Invalid YouTube publish request.')),
    reconcilePublish: (request) => validPublishRequest(request) ? ipcRenderer.invoke('youtube:reconcile-publish', request) : Promise.reject(new TypeError('Invalid YouTube reconciliation request.')),
    cancelPublish: (jobId) => typeof jobId === 'string' && jobId.length > 0 ? ipcRenderer.invoke('youtube:cancel-publish', { jobId }) : Promise.reject(new TypeError('Invalid YouTube publish job.')),
    acknowledgeReceipt: (request) => validPublishRequest(request) && typeof request.remotePublishId === 'string' ? ipcRenderer.invoke('youtube:acknowledge-receipt', request) : Promise.reject(new TypeError('Invalid YouTube receipt acknowledgement.')),
    collectAnalytics: (request) => validAnalyticsRequest(request) ? ipcRenderer.invoke('youtube:collect-analytics', request) : Promise.reject(new TypeError('Invalid YouTube analytics request.')),
  });
}

function createFFmpegBridge(ipcRenderer) {
  return Object.freeze({
    getCapabilities: (forceRefresh = false) => ipcRenderer.invoke('ffmpeg:capabilities', forceRefresh),
    resolveImageDisplayGeometry: (accessToken, media) => validPrivateImageGeometryRequest(accessToken, media)
      ? ipcRenderer.invoke('ffmpeg:resolve-image-display-geometry', { accessToken, media })
      : Promise.reject(new TypeError('Invalid private image geometry request.')),
    probeManualMp4: (bytes) => bytes instanceof ArrayBuffer && bytes.byteLength > 0 && bytes.byteLength <= 75 * 1024 * 1024
      ? ipcRenderer.invoke('manual-video:probe-mp4', bytes)
      : Promise.reject(new TypeError('Invalid manual video payload.')),
    createCanonicalRenderPlan: (request) => validCanonicalRenderRequest(request)
      ? ipcRenderer.invoke('ffmpeg:create-render-plan', request)
      : Promise.reject(new TypeError('Invalid canonical render request.')),
    executeCanonicalRenderPlan: (reference) => validRenderPlanReference(reference)
      ? ipcRenderer.invoke('ffmpeg:execute-render-plan', reference)
      : Promise.reject(new TypeError('Invalid canonical render plan reference.')),
    cancel: (jobId) => ipcRenderer.invoke('ffmpeg:cancel', jobId),
    resourceExists: (targetPath) => ipcRenderer.invoke('ffmpeg:resource-exists', targetPath),
    materializeRenderArtifact: (sourcePath, destinationPath) => ipcRenderer.invoke('ffmpeg:materialize-render-artifact', { sourcePath, destinationPath }),
    issueSegmentResource: (fingerprint) => typeof fingerprint === 'string' && /^[a-f0-9]{16,128}$/i.test(fingerprint)
      ? ipcRenderer.invoke('ffmpeg:issue-segment-resource', fingerprint)
      : Promise.reject(new TypeError('Invalid segment resource fingerprint.')),
    getSegmentCacheStats: () => ipcRenderer.invoke('ffmpeg:segment-cache-stats'),
    clearSegmentCache: () => ipcRenderer.invoke('ffmpeg:segment-cache-clear'),
    analyzeRenderArtifact: (targetPath) => ipcRenderer.invoke('ffmpeg:analyze-render-artifact', targetPath),
    verifyRenderArtifact: (targetPath) => ipcRenderer.invoke('ffmpeg:verify-render-artifact', targetPath),
    revalidateArtifact: (artifact) => validArtifactIntegrityRequest(artifact) ? ipcRenderer.invoke('ffmpeg:revalidate-artifact', artifact) : Promise.reject(new TypeError('Invalid artifact integrity request.')),
    pickOutputPath: (options) => ipcRenderer.invoke('ffmpeg:pick-output-path', options),
    openVerifiedExport: (artifact) => validArtifactIntegrityRequest(artifact)
      ? ipcRenderer.invoke('ffmpeg:open-verified-export', artifact)
      : Promise.reject(new TypeError('Invalid verified export artifact.')),
    revealVerifiedExport: (artifact) => validArtifactIntegrityRequest(artifact)
      ? ipcRenderer.invoke('ffmpeg:reveal-verified-export', artifact)
      : Promise.reject(new TypeError('Invalid verified export artifact.')),
    saveVerifiedExportAs: (artifact, destinationPath) => validArtifactIntegrityRequest(artifact) && typeof destinationPath === 'string'
      ? ipcRenderer.invoke('ffmpeg:save-verified-export-as', { artifact, destinationPath })
      : Promise.reject(new TypeError('Invalid verified export save request.')),
    onProgress: (listener) => {
      if (typeof listener !== 'function') throw new TypeError('Progress listener must be a function.');
      const handler = (_event, payload) => listener(payload);
      ipcRenderer.on('ffmpeg:progress', handler);
      return () => ipcRenderer.removeListener('ffmpeg:progress', handler);
    },
  });
}

function installPreloadBridge({ contextBridge, ipcRenderer, platform = process.platform, version = process.versions.electron }) {
  const api = Object.freeze({
    platform,
    // This is the Electron runtime version retained for compatibility.
    version,
    appVersion: () => ipcRenderer.invoke('app:get-version'),
    ffmpeg: createFFmpegBridge(ipcRenderer),
    youtube: createYouTubeBridge(ipcRenderer),
  });
  contextBridge.exposeInMainWorld('electronAPI', api);
  return api;
}

if (process.type === 'renderer') {
  const { contextBridge, ipcRenderer } = require('electron');
  installPreloadBridge({ contextBridge, ipcRenderer });
}

module.exports = {
  ALLOWED_FFMPEG_API_KEYS,
  ALLOWED_YOUTUBE_API_KEYS,
  createFFmpegBridge,
  createYouTubeBridge,
  installPreloadBridge,
  validAnalyticsRequest,
  validAccessToken,
};
