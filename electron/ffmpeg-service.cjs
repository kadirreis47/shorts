const { app, ipcMain, dialog, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { validateFFmpegRunRequest, validateTargetPath, validateArtifactIntegrityRequest } = require('./ffmpeg-security.cjs');
const { ArtifactIntegrityError, hashFileSha256, revalidateVerifiedArtifact } = require('./artifact-integrity.cjs');
const { createArtifactSnapshotStore } = require('./artifact-snapshot.cjs');

const active = new Map();
const materializationLocks = new Map();
let cachedCapabilities = null;

function registerFFmpegHandlers() {
  ipcMain.handle('ffmpeg:pick-output-path', async (event, options = {}) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showSaveDialog(window, { title: 'Export destination', defaultPath: typeof options.defaultPath === 'string' ? options.defaultPath : 'export.mp4', filters: [{ name: 'MP4 video', extensions: ['mp4'] }] });
    if (result.canceled || !result.filePath) return null;
    return validateTargetPath(result.filePath);
  });
  ipcMain.handle('ffmpeg:capabilities', async (_event, forceRefresh = false) => {
    if (cachedCapabilities && !forceRefresh) return cachedCapabilities;
    cachedCapabilities = await detectCapabilities();
    return cachedCapabilities;
  });

  ipcMain.handle('ffmpeg:run', async (event, request) =>
    runFFmpeg(event.sender, validateFFmpegRunRequest(request)));
  ipcMain.handle('ffmpeg:analyze-output', async (_event, targetPath) =>
    analyzeOutput(validateTargetPath(targetPath)),
  );
  ipcMain.handle('ffmpeg:artifact-digest', async (_event, targetPath) =>
    hashFileSha256(validateTargetPath(targetPath)),
  );
  ipcMain.handle('ffmpeg:verify-artifact-snapshot', async (_event, targetPath) => {
    const trustedPath = validateTargetPath(targetPath);
    const snapshots = createArtifactSnapshotStore({ directory: path.join(app.getPath('temp'), 'shortsflow-artifact-verification') });
    return verifyArtifactSnapshot(trustedPath, { snapshots });
  });
  ipcMain.handle('ffmpeg:revalidate-artifact', async (_event, artifact) => {
    try {
      return { ok: true, artifact: await revalidateVerifiedArtifact(validateArtifactIntegrityRequest(artifact)) };
    } catch (error) {
      if (error instanceof ArtifactIntegrityError) return { ok: false, error: { code: error.code, message: error.message } };
      return { ok: false, error: { code: 'artifact-unreadable', message: 'Verified export could not be read safely.' } };
    }
  });
  ipcMain.handle('ffmpeg:segment-path', async (_event, fingerprint) =>
    getSegmentPath(fingerprint),
  );
  ipcMain.handle('ffmpeg:segment-exists', async (_event, fingerprint) => {
    try {
      const stat = await fs.promises.stat(getSegmentPath(fingerprint));
      return stat.isFile();
    } catch {
      return false;
    }
  });
  ipcMain.handle('ffmpeg:segment-cache-stats', async () => {
    const directory = getSegmentDirectory();
    await fs.promises.mkdir(directory, { recursive: true });
    const files = await fs.promises.readdir(directory, { withFileTypes: true });
    let entries = 0;
    let totalBytes = 0;
    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith('.mp4')) continue;
      const stat = await fs.promises.stat(path.join(directory, file.name));
      entries += 1;
      totalBytes += stat.size;
    }
    return { entries, totalBytes, cacheDirectory: directory };
  });
  ipcMain.handle('ffmpeg:segment-cache-clear', async () => {
    const directory = getSegmentDirectory();
    await fs.promises.rm(directory, { recursive: true, force: true });
  });

  ipcMain.handle('ffmpeg:file-exists', async (_event, targetPath) => {
    try { targetPath = validateTargetPath(targetPath); } catch { return false; }
    try {
      const stat = await fs.promises.stat(targetPath);
      return stat.isFile();
    } catch {
      return false;
    }
  });
  ipcMain.handle('ffmpeg:copy-file', async (_event, request) => {
    const sourcePath = validateTargetPath(request?.sourcePath);
    const destinationPath = validateTargetPath(request?.destinationPath);
    const samePath = process.platform === 'win32'
      ? sourcePath.toLowerCase() === destinationPath.toLowerCase()
      : sourcePath === destinationPath;
    if (samePath) { const stat = await fs.promises.stat(destinationPath); return { path: destinationPath, sizeBytes: stat.size }; }
    const key = process.platform === 'win32' ? destinationPath.toLowerCase() : destinationPath;
    const previous = materializationLocks.get(key) || Promise.resolve();
    const operation = previous.then(() => materializeFile(sourcePath, destinationPath));
    const locked = operation.catch(() => undefined);
    materializationLocks.set(key, locked);
    try { return await operation; } finally { if (materializationLocks.get(key) === locked) materializationLocks.delete(key); }
  });
  ipcMain.handle('ffmpeg:cancel', async (_event, jobId) => {
    const child = active.get(jobId);
    if (!child) return false;
    child.kill('SIGTERM');
    setTimeout(() => { if (!child.killed) child.kill('SIGKILL'); }, 1500).unref();
    return true;
  });
}

async function materializeFile(sourcePath, destinationPath) {
  await fs.promises.mkdir(path.dirname(destinationPath), { recursive: true });
  const temporaryPath = path.join(path.dirname(destinationPath), `.${path.basename(destinationPath)}.${process.pid}.${Date.now()}.tmp`);
  const backupPath = path.join(path.dirname(destinationPath), `.${path.basename(destinationPath)}.${process.pid}.${Date.now()}.bak`);
  let backedUp = false;
  let committed = false;
  try {
    await fs.promises.copyFile(sourcePath, temporaryPath);
    const temporaryStat = await fs.promises.stat(temporaryPath);
    if (!temporaryStat.isFile() || temporaryStat.size <= 0) throw new Error('Materialized cache artifact is empty.');
    try {
      await fs.promises.rename(destinationPath, backupPath);
      backedUp = true;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    try {
      await fs.promises.rename(temporaryPath, destinationPath);
    } catch (error) {
      if (backedUp) {
        try { await fs.promises.rename(backupPath, destinationPath); } catch {}
      }
      throw error;
    }
    const stat = await fs.promises.stat(destinationPath);
    if (!stat.isFile() || stat.size !== temporaryStat.size) throw new Error('Materialized destination failed integrity check.');
    committed = true;
    if (backedUp) { try { await fs.promises.rm(backupPath, { force: true }); } catch {} }
    return { path: destinationPath, sizeBytes: stat.size };
  } catch (error) {
    if (backedUp && !committed) {
      try {
        await fs.promises.rm(destinationPath, { force: true });
      } catch {}
      try { await fs.promises.rename(backupPath, destinationPath); } catch {}
    }
    throw error;
  } finally {
    try { await fs.promises.rm(temporaryPath, { force: true }); } catch {}
    if (backedUp && committed) { try { await fs.promises.rm(backupPath, { force: true }); } catch {} }
  }
}

async function detectCapabilities() {
  const executable = resolveExecutable();
  try {
    const versionOutput = await capture(executable, ['-version']);
    const encodersOutput = await capture(executable, ['-hide_banner', '-encoders']);
    const encoders = encodersOutput.split(/\r?\n/).filter((line) => /^\s*[VAS\.]{6}\s+\S+/.test(line)).map((line) => line.trim().split(/\s+/)[1]).filter(Boolean);
    const hardwareEncoders = encoders.filter((name) => /nvenc|qsv|vaapi|videotoolbox|amf/i.test(name));
    const gpuDevices = await detectNvidiaGpus();
    const ffprobeExecutable = resolveFFprobeExecutable();
    let ffprobeAvailable = false; let ffprobeVersion = null;
    try { const probe = await capture(ffprobeExecutable, ['-version']); ffprobeAvailable = true; ffprobeVersion = probe.split(/\r?\n/)[0] || null; } catch {}
    return { available: true, executable, version: versionOutput.split(/\r?\n/)[0] || null, encoders, hardwareEncoders, gpuDevices, ffprobeAvailable, ffprobeExecutable: ffprobeAvailable ? ffprobeExecutable : null, ffprobeVersion };
  } catch {
    return { available: false, executable: null, version: null, encoders: [], hardwareEncoders: [], gpuDevices: [], ffprobeAvailable: false, ffprobeExecutable: null, ffprobeVersion: null };
  }
}


async function detectNvidiaGpus() {
  try {
    const output = await capture('nvidia-smi', [
      '--query-gpu=index,name,driver_version,memory.total,memory.free,utilization.gpu,temperature.gpu',
      '--format=csv,noheader,nounits',
    ]);
    return output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
      const [index, name, driverVersion, memoryTotal, memoryFree, utilization, temperature] = line.split(',').map((value) => value.trim());
      return {
        index: Number(index) || 0, name, driverVersion: driverVersion || null,
        memoryTotalMiB: numericOrNull(memoryTotal), memoryFreeMiB: numericOrNull(memoryFree),
        utilizationPercent: numericOrNull(utilization), temperatureCelsius: numericOrNull(temperature),
      };
    });
  } catch { return []; }
}
function numericOrNull(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }

async function analyzeOutput(targetPath) {
  if (!targetPath || typeof targetPath !== 'string') {
    throw new Error('Analiz edilecek çıktı yolu geçersiz.');
  }

  const executable = resolveFFprobeExecutable();
  const output = await capture(executable, [
    '-v',
    'error',
    '-show_entries',
    'format=format_name,duration,size,bit_rate:stream=index,codec_type,codec_name,codec_long_name,profile,width,height,pix_fmt,r_frame_rate,bit_rate,duration,sample_rate,channels,channel_layout',
    '-of',
    'json',
    targetPath,
  ]);

  const parsed = JSON.parse(output);
  const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
  const video = streams.find((stream) => stream.codec_type === 'video') ?? null;
  const audio = streams.find((stream) => stream.codec_type === 'audio') ?? null;
  const format = parsed.format ?? {};
  const sizeBytes = Number(format.size) || 0;

  return {
    outputPath: targetPath,
    containerFormat: format.format_name ?? null,
    durationSeconds: numericOrNull(format.duration),
    sizeBytes,
    overallBitRate: numericOrNull(format.bit_rate),
    video: video ? normalizeStream(video) : null,
    audio: audio ? normalizeStream(audio) : null,
    warnings: [],
    qualityScore: 0,
    passed: false,
    analyzedAt: new Date().toISOString(),
  };
}

async function verifyArtifactSnapshot(targetPath, { snapshots, analyze = analyzeOutput, digest = hashFileSha256 } = {}) {
  if (!snapshots) throw new TypeError('Trusted artifact snapshot storage is required.');
  const snapshot = await snapshots.create(targetPath); let operationError = null;
  try {
    const diagnostics = await analyze(snapshot.snapshotPath);
    const integrity = await digest(snapshot.snapshotPath);
    if (integrity.sizeBytes !== snapshot.sizeBytes) throw new ArtifactIntegrityError('artifact-integrity-mismatch', 'The verification snapshot changed while it was analyzed.');
    await snapshots.assertSourceUnchanged(snapshot);
    return { diagnostics: { ...diagnostics, outputPath: targetPath }, integrity: { artifactPath: targetPath, sizeBytes: integrity.sizeBytes, contentDigest: integrity.contentDigest } };
  } catch (error) { operationError = error; throw error; }
  finally {
    const removed = await snapshots.remove(snapshot.snapshotPath);
    if (!removed && !operationError) throw new ArtifactIntegrityError('artifact-snapshot-cleanup-failed', 'The temporary verification snapshot could not be removed safely.');
  }
}

function normalizeStream(stream) {
  return {
    codecName: stream.codec_name ?? null,
    codecLongName: stream.codec_long_name ?? null,
    profile: stream.profile ?? null,
    width: numericOrNull(stream.width),
    height: numericOrNull(stream.height),
    pixelFormat: stream.pix_fmt ?? null,
    frameRate: parseFrameRate(stream.r_frame_rate),
    bitRate: numericOrNull(stream.bit_rate),
    durationSeconds: numericOrNull(stream.duration),
    sampleRate: numericOrNull(stream.sample_rate),
    channels: numericOrNull(stream.channels),
    channelLayout: stream.channel_layout ?? null,
  };
}

function parseFrameRate(value) {
  if (!value || typeof value !== 'string') return null;
  const [numerator, denominator] = value.split('/').map(Number);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null;
  }
  return numerator / denominator;
}

function resolveFFprobeExecutable() {
  const explicit = process.env.SHORTSFLOW_FFPROBE_PATH;
  if (explicit) return explicit;

  const ffmpeg = resolveExecutable();
  const directory = path.dirname(ffmpeg);
  const extension = process.platform === 'win32' ? '.exe' : '';
  const candidate = path.join(directory, `ffprobe${extension}`);

  if (fs.existsSync(candidate)) return candidate;
  return 'ffprobe';
}

function resolveExecutable() {
  const explicit = process.env.SHORTSFLOW_FFMPEG_PATH;
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
  return process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
}

async function runFFmpeg(webContents, request) {
  const capabilities = await detectCapabilities();
  if (!capabilities.available || !capabilities.executable) throw new Error('FFmpeg executable bulunamadı.');
  if (active.has(request.jobId)) throw new Error('Aynı jobId ile aktif FFmpeg işlemi var.');

  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'shortsflow-ffmpeg-'));
  const subtitlePath = path.join(tempDir, 'subtitles.srt');
  const concatPath = path.join(tempDir, 'segments.txt');
  if (request.subtitleContent) {
    await fs.promises.writeFile(subtitlePath, request.subtitleContent, 'utf8');
  }
  if (request.concatContent) {
    await fs.promises.writeFile(concatPath, request.concatContent, 'utf8');
  }
  const outputPath = resolveOutputPath(request.outputPath, request.jobId);
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  const args = request.args.map((arg) =>
    arg
      .replaceAll('{{SUBTITLE_FILE}}', escapeFilterPath(subtitlePath))
      .replaceAll('{{CONCAT_FILE}}', concatPath)
      .replaceAll('{{OUTPUT_FILE}}', outputPath),
  );
  const started = Date.now();
  const stderrTail = [];

  return new Promise((resolve, reject) => {
    const child = spawn(capabilities.executable, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    active.set(request.jobId, child);
    let progress = {};
    let stdoutBuffer = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk;
      const lines = stdoutBuffer.split(/\r?\n/); stdoutBuffer = lines.pop() || '';
      for (const line of lines) {
        const i = line.indexOf('='); if (i < 0) continue;
        progress[line.slice(0,i)] = line.slice(i+1);
        if (line.startsWith('progress=')) {
          webContents.send('ffmpeg:progress', {
            jobId: request.jobId,
            frame: Number(progress.frame || 0), fps: Number(progress.fps || 0),
            outTimeMs: Math.round(Number(progress.out_time_us || 0) / 1000),
            speed: Number(String(progress.speed || '0').replace('x','')) || 0,
            progress: progress.progress === 'end' ? 'end' : 'continue',
          });
          progress = {};
        }
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      for (const line of chunk.split(/\r?\n/).filter(Boolean)) {
        stderrTail.push(line); if (stderrTail.length > 30) stderrTail.shift();
      }
    });
    child.on('error', finishError);
    child.on('close', async (code, signal) => {
      active.delete(request.jobId);
      try { await fs.promises.rm(tempDir, { recursive: true, force: true }); } catch {}
      if (code !== 0) {
        reject(new Error(signal ? `FFmpeg ${signal} sinyaliyle sonlandı.` : `FFmpeg ${code} koduyla sonlandı. ${stderrTail.slice(-5).join(' ')}`));
        return;
      }
      try {
        const stat = await fs.promises.stat(outputPath);
        resolve({ outputPath, sizeBytes: stat.size, elapsedMs: Date.now()-started, exitCode: code || 0, stderrTail });
      } catch (error) { reject(error); }
    });
    function finishError(error) { active.delete(request.jobId); reject(error); }
  });
}

function getSegmentDirectory() {
  return path.join(app.getPath('userData'), 'render-cache', 'segments');
}
function getSegmentPath(fingerprint) {
  const safe = sanitize(fingerprint);
  return path.join(getSegmentDirectory(), `v2-${safe}.mp4`);
}

function resolveOutputPath(requested, jobId) {
  if (requested && path.isAbsolute(requested)) return requested;
  const dir = path.join(app.getPath('videos'), 'ShortsFlow');
  return path.join(dir, `${sanitize(jobId)}.mp4`);
}
function sanitize(value) { return String(value).replace(/[^a-z0-9_-]/gi, '_'); }
function escapeFilterPath(value) { return value.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'"); }
function capture(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true }); let out=''; let err='';
    child.stdout.on('data', c => out += c); child.stderr.on('data', c => err += c);
    child.on('error', reject); child.on('close', code => code === 0 ? resolve(out || err) : reject(new Error(err || `Exit ${code}`)));
  });
}
module.exports = { registerFFmpegHandlers, verifyArtifactSnapshot };
