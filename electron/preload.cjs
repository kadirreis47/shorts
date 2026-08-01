const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  version: process.versions.electron,
  ffmpeg: {
    getCapabilities: () => ipcRenderer.invoke('ffmpeg:capabilities'),
    run: (request) => ipcRenderer.invoke('ffmpeg:run', request),
    cancel: (jobId) => ipcRenderer.invoke('ffmpeg:cancel', jobId),
    onProgress: (listener) => {
      const handler = (_event, payload) => listener(payload);
      ipcRenderer.on('ffmpeg:progress', handler);
      return () => ipcRenderer.removeListener('ffmpeg:progress', handler);
    },
  },
});
