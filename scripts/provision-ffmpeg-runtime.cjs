const fs = require('fs');
const path = require('path');
const { binaries } = require('../electron/ffmpeg-runtime.cjs');

const RUNTIME_DIRECTORY = path.join(process.cwd(), '.shortsflow-build', 'runtime', 'ffmpeg');
const REQUIRED = Object.freeze([binaries.ffmpeg, binaries.ffprobe]);

function validFile(filePath, fsApi = fs) { try { return fsApi.statSync(filePath).isFile() && fsApi.statSync(filePath).size > 0; } catch { return false; } }
function provisionFFmpegRuntime({ sourceDirectory = process.env.SHORTSFLOW_FFMPEG_BUNDLE_DIR, outputDirectory = RUNTIME_DIRECTORY, fsApi = fs, requireBundle = false } = {}) {
  fsApi.rmSync(outputDirectory, { recursive: true, force: true }); fsApi.mkdirSync(outputDirectory, { recursive: true, mode: 0o755 }); fsApi.writeFileSync(path.join(outputDirectory, '.keep'), 'Runtime resources are staged here by the release build.\n', { encoding: 'utf8' });
  if (!sourceDirectory) {
    if (requireBundle) throw new Error('FFmpeg/FFprobe bundle is required for packaged ShortsFlow builds. Configure SHORTSFLOW_FFMPEG_BUNDLE_DIR.');
    return { outputDirectory, bundled: false, files: [] };
  }
  const resolved = path.resolve(sourceDirectory); const files = REQUIRED.map((name) => path.join(resolved, name));
  if (!files.every((file) => validFile(file, fsApi))) throw new Error(`SHORTSFLOW_FFMPEG_BUNDLE_DIR must contain non-empty ${REQUIRED.join(' and ')}.`);
  for (const source of files) fsApi.copyFileSync(source, path.join(outputDirectory, path.basename(source)), fsApi.constants.COPYFILE_FICLONE);
  for (const notice of ['LICENSE', 'LICENSE.txt', 'COPYING', 'COPYING.LGPLv2.1', 'NOTICE']) { const source = path.join(resolved, notice); if (validFile(source, fsApi)) fsApi.copyFileSync(source, path.join(outputDirectory, notice)); }
  return { outputDirectory, bundled: true, files: REQUIRED.map((name) => path.join(outputDirectory, name)) };
}

if (require.main === module) {
  try { const result = provisionFFmpegRuntime({ requireBundle: true }); console.log(`[ShortsFlow] Staged bundled FFmpeg runtime resources at ${result.outputDirectory}.`); } catch (error) { console.error(`[ShortsFlow] ${error.message}`); process.exitCode = 1; }
}

module.exports = { REQUIRED, RUNTIME_DIRECTORY, provisionFFmpegRuntime, validFile };
