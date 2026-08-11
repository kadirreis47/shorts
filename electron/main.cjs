const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');
const { registerFFmpegHandlers } = require('./ffmpeg-service.cjs');
const { registerYouTubeHandlers } = require('./youtube-ipc.cjs');

let mainWindow;

function isSafeExternalUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'https:' || url.protocol === 'mailto:';
  } catch {
    return false;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    title: 'ShortsFlow - Automation Studio',
    backgroundColor: '#f8fafc',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
  });

  const isDev = process.env.ELECTRON_IS_DEV === '1' || !app.isPackaged;
  const devServerUrl = process.env.SHORTSFLOW_DEV_SERVER_URL || 'http://127.0.0.1:5173';

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const currentUrl = mainWindow?.webContents.getURL();
    if (url !== currentUrl) {
      event.preventDefault();
      if (isSafeExternalUrl(url)) void shell.openExternal(url);
    }
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[ShortsFlow] Renderer process ended:', details.reason, details.exitCode);
  });

  mainWindow.on('unresponsive', () => {
    console.error('[ShortsFlow] Main window is unresponsive.');
  });

  if (isDev) {
    void mainWindow.loadURL(devServerUrl);
    if (process.env.SHORTSFLOW_OPEN_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    void mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  Menu.setApplicationMenu(null);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  registerFFmpegHandlers();
  registerYouTubeHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
