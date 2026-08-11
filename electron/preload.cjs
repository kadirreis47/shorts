const { contextBridge, ipcRenderer } = require('electron');
const { createFFmpegBridge, createYouTubeBridge } = require('./preload-api.cjs');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  version: process.versions.electron,
  ffmpeg: createFFmpegBridge(ipcRenderer),
  youtube: createYouTubeBridge(ipcRenderer),
});
