const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { provisionFFmpegRuntime } = require('./provision-ffmpeg-runtime.cjs');

function runElectronProductE2E({ sourceDirectory = process.env.SHORTSFLOW_FFMPEG_BUNDLE_DIR, spawnImpl = spawnSync } = {}) {
  if (!sourceDirectory) throw new Error('SHORTSFLOW_FFMPEG_BUNDLE_DIR must point to the trusted Windows FFmpeg/FFprobe release directory for product E2E.');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shortsflow-product-e2e-'));
  try {
    provisionFFmpegRuntime({ sourceDirectory, outputDirectory: path.join(root, 'ffmpeg') });
    const environment = { ...process.env, SHORTSFLOW_PRODUCT_E2E_PACKAGED: '1', SHORTSFLOW_E2E_RESOURCES_PATH: root, SHORTSFLOW_E2E_USER_DATA: path.join(root, 'user-data') };
    const electronTestArgs = ['--disable-gpu', 'electron/product-e2e-main.cjs'];
    for (const mode of ['seed', 'resume']) {
      const result = spawnImpl(require('electron'), electronTestArgs, { cwd: process.cwd(), stdio: 'inherit', env: { ...environment, SHORTSFLOW_E2E_MODE: mode } });
      if (result.status !== 0) throw new Error(`Electron product E2E ${mode} phase failed with status ${result.status}.`);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

if (require.main === module) { try { runElectronProductE2E(); } catch (error) { console.error(`[ShortsFlow] ${error.message}`); process.exitCode = 1; } }
module.exports = { runElectronProductE2E };
