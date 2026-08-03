const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  version: process.versions.electron,
  ffmpeg: {
    getCapabilities: (forceRefresh = false) => ipcRenderer.invoke('ffmpeg:capabilities', forceRefresh),
    run: (request) => ipcRenderer.invoke('ffmpeg:run', request),
    cancel: (jobId) => ipcRenderer.invoke('ffmpeg:cancel', jobId),
    fileExists: (targetPath) => ipcRenderer.invoke('ffmpeg:file-exists', targetPath),
    getSegmentPath: (fingerprint) =>
      ipcRenderer.invoke('ffmpeg:segment-path', fingerprint),
    segmentExists: (fingerprint) =>
      ipcRenderer.invoke('ffmpeg:segment-exists', fingerprint),
    getSegmentCacheStats: () =>
      ipcRenderer.invoke('ffmpeg:segment-cache-stats'),
    clearSegmentCache: () =>
      ipcRenderer.invoke('ffmpeg:segment-cache-clear'),
    analyzeOutput: (targetPath) =>
      ipcRenderer.invoke('ffmpeg:analyze-output', targetPath),
    onProgress: (listener) => {
      const handler = (_event, payload) => listener(payload);
      ipcRenderer.on('ffmpeg:progress', handler);
      return () => ipcRenderer.removeListener('ffmpeg:progress', handler);
    },
  },
});
