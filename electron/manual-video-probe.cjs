const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { resolveFFprobeExecutable } = require('./ffmpeg-service.cjs');

const MAX_MANUAL_VIDEO_BYTES = 75 * 1024 * 1024;
const PROBE_TIMEOUT_MS = 15_000;
const PROBE_ARGS = Object.freeze(['-v', 'error', '-show_entries', 'format=format_name,duration:stream=codec_type,codec_name,width,height,r_frame_rate,duration', '-of', 'json']);

function asBytes(value) {
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  throw safeError('invalid');
}

function safeError(code) { const error = new Error(`manual-video-probe:${code}`); error.code = code; return error; }

function parseRate(value) {
  if (typeof value !== 'string') return null;
  const parts = value.split('/');
  if (parts.length !== 2 || !/^-?\d+$/.test(parts[0]) || !/^\d+$/.test(parts[1])) return null;
  const [numerator, denominator] = parts.map(Number);
  return Number.isSafeInteger(numerator) && Number.isSafeInteger(denominator) && numerator > 0 && denominator > 0
    ? numerator / denominator
    : null;
}

function normalizeProbe(raw) {
  const streams = Array.isArray(raw?.streams) ? raw.streams : [];
  const videos = streams.filter((stream) => stream && stream.codec_type === 'video');
  if (videos.length !== 1) throw safeError('video-stream');
  const video = videos[0];
  const duration = Number(raw?.format?.duration ?? video.duration);
  const fps = parseRate(video.r_frame_rate);
  const formatNames = typeof raw?.format?.format_name === 'string' ? raw.format.format_name.split(',') : [];
  if (!formatNames.includes('mp4') || video.codec_name !== 'h264') throw safeError('codec');
  if (!Number.isFinite(duration) || duration <= .25 || duration > 120) throw safeError('duration');
  if (!Number.isSafeInteger(video.width) || !Number.isSafeInteger(video.height) || video.width <= 0 || video.height <= 0 || video.width > 3840 || video.height > 2160) throw safeError('resolution');
  if (!Number.isFinite(fps) || fps <= 0 || fps > 60) throw safeError('fps');
  return Object.freeze({ container: 'mp4', codec: 'h264', width: video.width, height: video.height, fps, durationMs: Math.round(duration * 1000), hasAudio: streams.some((stream) => stream && stream.codec_type === 'audio') });
}

function runProbe(executable, filePath, { spawnFn = spawn, timeoutMs = PROBE_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnFn(executable, [...PROBE_ARGS, filePath], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = ''; let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, timeoutMs);
    child.stdout?.setEncoding('utf8'); child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk) => { stdout += chunk; if (stdout.length > 65_536) child.kill('SIGTERM'); });
    child.stderr?.on('data', (chunk) => { stderr += chunk; if (stderr.length > 4_096) child.kill('SIGTERM'); });
    child.on('error', () => { clearTimeout(timeout); reject(safeError('failed')); });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (timedOut) return reject(safeError('timeout'));
      if (code !== 0) return reject(safeError('failed'));
      try { resolve(JSON.parse(stdout)); } catch { reject(safeError('invalid')); }
    });
  });
}

async function probeManualMp4(bytes, options = {}) {
  const value = asBytes(bytes);
  if (!value.length || value.length > MAX_MANUAL_VIDEO_BYTES) throw safeError('size');
  const fsApi = options.fsApi ?? fs;
  const directory = await fsApi.promises.mkdtemp(path.join(os.tmpdir(), 'shortsflow-manual-video-'));
  const filePath = path.join(directory, `${crypto.randomUUID()}.mp4`);
  let result;
  let operationError = null;
  try {
    await fsApi.promises.writeFile(filePath, value, { flag: 'wx' });
    const executable = options.resolveExecutable?.() ?? resolveFFprobeExecutable();
    if (!executable) throw safeError('unavailable');
    result = normalizeProbe(await (options.runProbe ?? runProbe)(executable, filePath, options));
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    try {
      await fsApi.promises.rm(directory, { recursive: true, force: true });
    } catch (cleanupError) {
      if (!operationError) throw safeError('cleanup');
    }
  }
  return result;
}

function registerManualVideoProbeHandler(ipcMain) {
  ipcMain.handle('manual-video:probe-mp4', async (_event, bytes) => probeManualMp4(bytes));
}

module.exports = { MAX_MANUAL_VIDEO_BYTES, PROBE_TIMEOUT_MS, PROBE_ARGS, parseRate, normalizeProbe, probeManualMp4, registerManualVideoProbeHandler };
