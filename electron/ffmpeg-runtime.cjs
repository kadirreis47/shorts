const fs = require('fs');
const path = require('path');

const RESOURCE_DIRECTORY = 'ffmpeg';
const binaries = Object.freeze({ ffmpeg: process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg', ffprobe: process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe' });

function bundledBinary(name, { resourcesPath = process.resourcesPath, fsApi = fs } = {}) {
  const root = path.resolve(resourcesPath || '', RESOURCE_DIRECTORY); const candidate = path.resolve(root, binaries[name]);
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) return null;
  try { return fsApi.statSync(candidate).isFile() && fsApi.statSync(candidate).size > 0 ? candidate : null; } catch { return null; }
}

function isPackagedRuntime({ appIsPackaged = false, env = process.env } = {}) {
  return Boolean(appIsPackaged || env.SHORTSFLOW_PRODUCT_E2E_PACKAGED === '1');
}

function resolveFFmpegRuntime({ isPackaged = false, resourcesPath = process.resourcesPath, env = process.env, fsApi = fs } = {}) {
  if (isPackaged) return { ffmpeg: bundledBinary('ffmpeg', { resourcesPath, fsApi }), ffprobe: bundledBinary('ffprobe', { resourcesPath, fsApi }), source: 'bundled' };
  const ffmpeg = typeof env.SHORTSFLOW_FFMPEG_PATH === 'string' && env.SHORTSFLOW_FFMPEG_PATH.trim() ? env.SHORTSFLOW_FFMPEG_PATH.trim() : binaries.ffmpeg;
  const ffprobe = typeof env.SHORTSFLOW_FFPROBE_PATH === 'string' && env.SHORTSFLOW_FFPROBE_PATH.trim() ? env.SHORTSFLOW_FFPROBE_PATH.trim() : null;
  return { ffmpeg, ffprobe, source: ffmpeg === binaries.ffmpeg ? 'path' : 'environment' };
}

module.exports = { RESOURCE_DIRECTORY, binaries, bundledBinary, isPackagedRuntime, resolveFFmpegRuntime };
