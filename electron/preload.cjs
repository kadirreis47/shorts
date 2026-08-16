// This entry runs in Electron's sandboxed preload context. Keep it self-contained:
// sandboxed preloads can require Electron's built-ins but cannot require sibling files.
const ALLOWED_FFMPEG_API_KEYS = Object.freeze([
  'getCapabilities', 'run', 'cancel', 'fileExists', 'copyFile', 'getSegmentPath',
  'segmentExists', 'getSegmentCacheStats', 'clearSegmentCache', 'analyzeOutput',
  'artifactDigest', 'verifyArtifactSnapshot', 'revalidateArtifact', 'onProgress',
  'pickOutputPath', 'openVerifiedExport', 'revealVerifiedExport', 'saveVerifiedExportAs',
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
    && typeof value.jobId === 'string' && value.jobId.length > 0
    && typeof value.idempotencyKey === 'string' && value.idempotencyKey.length > 0
    && validCredentialRef(value.account?.credentialRef) && validChannelRef(value.account?.channelRef) && typeof value.account?.accountId === 'string'
    && typeof value.target?.accountId === 'string' && validChannelRef(value.target?.channelRef)
    && typeof value.artifact?.artifactPath === 'string' && !value.artifact.artifactPath.includes('\0')
    && Number.isSafeInteger(value.artifact?.sizeBytes) && value.artifact.sizeBytes > 0
    && /^[a-f0-9]{64}$/.test(value.artifact?.contentDigest || '')
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
    run: (request) => ipcRenderer.invoke('ffmpeg:run', request),
    cancel: (jobId) => ipcRenderer.invoke('ffmpeg:cancel', jobId),
    fileExists: (targetPath) => ipcRenderer.invoke('ffmpeg:file-exists', targetPath),
    copyFile: (sourcePath, destinationPath) => ipcRenderer.invoke('ffmpeg:copy-file', { sourcePath, destinationPath }),
    getSegmentPath: (fingerprint) => ipcRenderer.invoke('ffmpeg:segment-path', fingerprint),
    segmentExists: (fingerprint) => ipcRenderer.invoke('ffmpeg:segment-exists', fingerprint),
    getSegmentCacheStats: () => ipcRenderer.invoke('ffmpeg:segment-cache-stats'),
    clearSegmentCache: () => ipcRenderer.invoke('ffmpeg:segment-cache-clear'),
    analyzeOutput: (targetPath) => ipcRenderer.invoke('ffmpeg:analyze-output', targetPath),
    artifactDigest: (targetPath) => ipcRenderer.invoke('ffmpeg:artifact-digest', targetPath),
    verifyArtifactSnapshot: (targetPath) => ipcRenderer.invoke('ffmpeg:verify-artifact-snapshot', targetPath),
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
    version,
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
