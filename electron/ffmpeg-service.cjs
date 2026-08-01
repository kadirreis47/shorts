const { app, ipcMain } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const active = new Map();
let cachedCapabilities = null;

function registerFFmpegHandlers() {
  ipcMain.handle('ffmpeg:capabilities', async (_event, forceRefresh = false) => {
    if (cachedCapabilities && !forceRefresh) return cachedCapabilities;
    cachedCapabilities = await detectCapabilities();
    return cachedCapabilities;
  });

  ipcMain.handle('ffmpeg:run', async (event, request) => runFFmpeg(event.sender, request));
  ipcMain.handle('ffmpeg:file-exists', async (_event, targetPath) => {
    if (!targetPath || typeof targetPath !== 'string') return false;
    try {
      const stat = await fs.promises.stat(targetPath);
      return stat.isFile();
    } catch {
      return false;
    }
  });
  ipcMain.handle('ffmpeg:cancel', async (_event, jobId) => {
    const child = active.get(jobId);
    if (!child) return false;
    child.kill('SIGTERM');
    setTimeout(() => { if (!child.killed) child.kill('SIGKILL'); }, 1500).unref();
    return true;
  });
}

async function detectCapabilities() {
  const executable = process.env.SHORTSFLOW_FFMPEG_PATH || 'ffmpeg';
  try {
    const versionOutput = await capture(executable, ['-version']);
    const encodersOutput = await capture(executable, ['-hide_banner', '-encoders']);
    const encoders = encodersOutput.split(/\r?\n/).filter((line) => /^\s*[VAS\.]{6}\s+\S+/.test(line)).map((line) => line.trim().split(/\s+/)[1]).filter(Boolean);
    const hardwareEncoders = encoders.filter((name) => /nvenc|qsv|vaapi|videotoolbox|amf/i.test(name));
    const gpuDevices = await detectNvidiaGpus();
    return { available: true, executable, version: versionOutput.split(/\r?\n/)[0] || null, encoders, hardwareEncoders, gpuDevices };
  } catch {
    return { available: false, executable: null, version: null, encoders: [], hardwareEncoders: [], gpuDevices: [] };
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

async function runFFmpeg(webContents, request) {
  const capabilities = await detectCapabilities();
  if (!capabilities.available || !capabilities.executable) throw new Error('FFmpeg executable bulunamadı.');
  if (active.has(request.jobId)) throw new Error('Aynı jobId ile aktif FFmpeg işlemi var.');

  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'shortsflow-ffmpeg-'));
  const subtitlePath = path.join(tempDir, 'subtitles.srt');
  if (request.subtitleContent) await fs.promises.writeFile(subtitlePath, request.subtitleContent, 'utf8');
  const outputPath = resolveOutputPath(request.outputPath, request.jobId);
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  const args = request.args.map((arg) => arg.replaceAll('{{SUBTITLE_FILE}}', escapeFilterPath(subtitlePath)).replaceAll('{{OUTPUT_FILE}}', outputPath));
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
module.exports = { registerFFmpegHandlers };
