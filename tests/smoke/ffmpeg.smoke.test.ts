import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const commandAvailable = (command: string) =>
  spawnSync(command, ['-version'], { stdio: 'ignore', windowsHide: true }).status === 0;
const hasToolchain = commandAvailable('ffmpeg') && commandAvailable('ffprobe');

describe('FFmpeg smoke', () => {
  (hasToolchain ? it : it.skip)('sentetik kısa video üretir ve FFprobe ile doğrular', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'shortsflow-smoke-'));
    const output = path.join(directory, 'smoke.mp4');
    try {
      execFileSync('ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i',
        'color=c=black:s=160x90:d=0.2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', output,
      ], { windowsHide: true });
      const raw = execFileSync('ffprobe', [
        '-v', 'error', '-select_streams', 'v:0', '-show_entries',
        'stream=codec_name,width,height', '-of', 'json', output,
      ], { encoding: 'utf8', windowsHide: true });
      const probe = JSON.parse(raw) as { streams?: Array<{ codec_name?: string; width?: number; height?: number }> };
      expect(probe.streams?.[0]).toMatchObject({ codec_name: 'h264', width: 160, height: 90 });
      expect(readFileSync(output).byteLength).toBeGreaterThan(0);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
