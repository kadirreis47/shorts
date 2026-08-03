const { contextBridge, ipcRenderer } = require('electron');
const { createFFmpegBridge } = require('./preload-api.cjs');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  version: process.versions.electron,
  ffmpeg: createFFmpegBridge(ipcRenderer),
});
