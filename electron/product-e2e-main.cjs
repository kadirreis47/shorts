const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { registerFFmpegHandlers } = require('./ffmpeg-service.cjs');
const { registerYouTubeHandlers } = require('./youtube-ipc.cjs');

const success = (value) => { console.log(`SHORTSFLOW_PRODUCT_E2E:${JSON.stringify(value)}`); app.exit(0); };
const fail = (message) => { console.error(`SHORTSFLOW_PRODUCT_E2E_FAILURE:${message}`); app.exit(1); };
const renderer = fs.readFileSync(path.join(__dirname, 'product-e2e-renderer.html'));
const port = Number(process.env.SHORTSFLOW_E2E_PORT || 49731);
app.disableHardwareAcceleration();
if (process.env.SHORTSFLOW_E2E_USER_DATA) {
  app.setPath('userData', process.env.SHORTSFLOW_E2E_USER_DATA);
  app.setPath('videos', path.join(process.env.SHORTSFLOW_E2E_USER_DATA, 'videos'));
}

app.whenReady().then(() => {
  console.log('[ShortsFlow] Product E2E main ready.');
  registerFFmpegHandlers();
  registerYouTubeHandlers({
    service: { connect: async () => { throw new Error('OAuth is not part of product E2E.'); }, disconnect: async () => true, status: async (credentialRef) => ({ credentialRef, authenticated: true }), finalizeSelection: async () => { throw new Error('Not used.'); }, cancelSelection: () => true },
    publishService: { initialize: async () => undefined, publish: async () => ({ remotePublishId: 'e2e-video', remoteUrl: 'https://www.youtube.com/watch?v=e2e-video', state: 'published', retryAfterUtc: null }), reconcile: async () => ({ found: true, remotePublishId: 'e2e-video', remoteUrl: 'https://www.youtube.com/watch?v=e2e-video', state: 'published' }), cancel: () => false, acknowledgeReceipt: async () => true },
    analyticsService: { collect: async () => ({ metrics: [{ rawMetricId: 'views', value: 100 }, { rawMetricId: 'likes', value: 8 }, { rawMetricId: 'comments', value: 2 }, { rawMetricId: 'shares', value: 1 }, { rawMetricId: 'average_percentage_viewed', value: 82 }, { rawMetricId: 'followers_gained', value: 1 }], diagnostics: [] }) },
  });
  console.log('[ShortsFlow] Product E2E IPC registered.');
  const window = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, preload: path.join(__dirname, 'preload.cjs') } });
  const timer = setTimeout(() => fail('Timed out waiting for the renderer product scenario.'), 30_000); timer.unref();
  window.webContents.on('console-message', (_event, _level, message) => {
    if (!message.startsWith('SHORTSFLOW_PRODUCT_E2E:')) { console.error(`[ShortsFlow E2E renderer] ${message}`); return; }
    clearTimeout(timer); try { const result = JSON.parse(message.slice('SHORTSFLOW_PRODUCT_E2E:'.length)); if (result?.error) fail(result.error); else success(result); } catch { fail('Renderer reported invalid product E2E output.'); }
  });
  window.webContents.on('did-finish-load', () => console.log('[ShortsFlow] Product E2E renderer loaded.'));
  window.webContents.on('did-fail-load', (_event, _code, description) => fail(`Renderer failed to load: ${description}`));
  const server = http.createServer((request, response) => {
    if (request.url !== '/') { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(renderer);
  });
  server.once('error', (error) => fail(error instanceof Error ? error.message : String(error)));
  server.listen(port, '127.0.0.1', () => {
    void window.loadURL(`http://127.0.0.1:${port}/`).catch((error) => fail(error instanceof Error ? error.message : String(error)));
  });
}).catch((error) => fail(error instanceof Error ? error.message : String(error)));
