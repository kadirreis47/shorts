const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { loadLocalYouTubeClientId } = require('./electron-local-config.cjs');
function viteCli() { let root = path.dirname(require.resolve('vite')); while (!fs.existsSync(path.join(root, 'bin', 'vite.js'))) { const parent = path.dirname(root); if (parent === root) throw new Error('Vite CLI was not found.'); root = parent; } return path.join(root, 'bin', 'vite.js'); }
const clientId = loadLocalYouTubeClientId(); const env = { ...process.env, ...(clientId ? { SHORTSFLOW_YOUTUBE_CLIENT_ID: clientId } : {}) };
const build = spawnSync(process.execPath, [viteCli(), 'build'], { stdio: 'inherit', env }); if (build.status !== 0) process.exit(build.status || 1);
process.exit(spawnSync(require('electron'), ['electron/main.cjs'], { stdio: 'inherit', env }).status || 0);
