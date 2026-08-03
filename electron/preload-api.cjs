const ALLOWED_FFMPEG_API_KEYS = Object.freeze([
  'getCapabilities',
  'run',
  'cancel',
  'fileExists',
  'getSegmentPath',
  'segmentExists',
  'getSegmentCacheStats',
  'clearSegmentCache',
  'analyzeOutput',
  'onProgress',
]);

function createFFmpegBridge(ipcRenderer) {
  return Object.freeze({
    getCapabilities: (forceRefresh = false) => ipcRenderer.invoke('ffmpeg:capabilities', forceRefresh),
    run: (request) => ipcRenderer.invoke('ffmpeg:run', request),
    cancel: (jobId) => ipcRenderer.invoke('ffmpeg:cancel', jobId),
    fileExists: (targetPath) => ipcRenderer.invoke('ffmpeg:file-exists', targetPath),
    getSegmentPath: (fingerprint) => ipcRenderer.invoke('ffmpeg:segment-path', fingerprint),
    segmentExists: (fingerprint) => ipcRenderer.invoke('ffmpeg:segment-exists', fingerprint),
    getSegmentCacheStats: () => ipcRenderer.invoke('ffmpeg:segment-cache-stats'),
    clearSegmentCache: () => ipcRenderer.invoke('ffmpeg:segment-cache-clear'),
    analyzeOutput: (targetPath) => ipcRenderer.invoke('ffmpeg:analyze-output', targetPath),
    onProgress: (listener) => {
      if (typeof listener !== 'function') throw new TypeError('Progress listener must be a function.');
      const handler = (_event, payload) => listener(payload);
      ipcRenderer.on('ffmpeg:progress', handler);
      return () => ipcRenderer.removeListener('ffmpeg:progress', handler);
    },
  });
}

module.exports = { ALLOWED_FFMPEG_API_KEYS, createFFmpegBridge };
