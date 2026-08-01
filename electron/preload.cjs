const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  version: process.versions.electron,
  ffmpeg: {
    getCapabilities: (forceRefresh = false) => ipcRenderer.invoke('ffmpeg:capabilities', forceRefresh),
    run: (request) => ipcRenderer.invoke('ffmpeg:run', request),
    cancel: (jobId) => ipcRenderer.invoke('ffmpeg:cancel', jobId),
    onProgress: (listener) => {
      const handler = (_event, payload) => listener(payload);
      ipcRenderer.on('ffmpeg:progress', handler);
      return () => ipcRenderer.removeListener('ffmpeg:progress', handler);
    },
  },
});
