const path = require('path');
const { loadLocalYouTubeClientId } = require('./electron-local-config.cjs');
const { REQUIRED, RUNTIME_DIRECTORY, validFile } = require('./provision-ffmpeg-runtime.cjs');

function validateV1Release({ clientId = loadLocalYouTubeClientId(), runtimeDirectory = RUNTIME_DIRECTORY } = {}) {
  if (typeof clientId !== 'string' || !clientId.trim() || /^YOUR_/i.test(clientId.trim())) throw new Error('A production SHORTSFLOW_YOUTUBE_CLIENT_ID is required for an official YouTube-enabled release.');
  const missing = REQUIRED.filter((name) => !validFile(path.join(runtimeDirectory, name)));
  if (missing.length) throw new Error(`Official release is missing bundled runtime binaries: ${missing.join(', ')}.`);
  return { clientId: clientId.trim(), runtimeDirectory };
}

if (require.main === module) {
  try { const result = validateV1Release(); console.log(`[ShortsFlow] V1 release runtime gate passed for ${result.runtimeDirectory}.`); } catch (error) { console.error(`[ShortsFlow] ${error.message}`); process.exitCode = 1; }
}

module.exports = { validateV1Release };
