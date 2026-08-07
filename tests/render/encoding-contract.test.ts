import { describe, expect, it } from 'vitest';
import { buildFFmpegCommand } from '@/core/render/ffmpegCommandBuilder';
import type { RenderManifest } from '@/core/media';
import type { RenderPreset } from '@/core/render';

const manifest = {
  durationMs: 2_000,
  render: { fps: 30, width: 1080, height: 1920 },
  timeline: { scenes: [{ durationMs: 2_000, assetIds: [] }] },
  assets: [],
  subtitles: { cues: [] },
} as unknown as RenderManifest;

describe('planner to renderer encoding contract', () => {
  it('uses the planned non-NVENC encoder and propagates effective settings', () => {
    const preset: RenderPreset = {
      id: 'qsv', name: 'QSV', container: 'mp4', videoCodec: 'h264', audioCodec: 'aac',
      quality: 'standard', hardwareAcceleration: 'auto', encoder: 'h264_qsv', encoderMode: 'hardware',
      bitrateKbps: 4_000, audioBitrateKbps: 160, sampleRate: 44_100, frameRate: 25,
      pixelFormat: 'yuv420p', threads: 6, gopFrames: 50, keyframeInterval: 50,
    };
    const command = buildFFmpegCommand({ manifest, preset });
    expect(command.args).toContain('-c:v');
    expect(command.args).toContain('h264_qsv');
    expect(command.args).toEqual(expect.arrayContaining([
      '-b:v', '4000k', '-b:a', '160k', '-ar', '44100', '-r', '25',
      '-threads', '6', '-g', '50', '-pix_fmt', 'yuv420p',
    ]));
    expect(command.args).not.toContain('h264_nvenc');
    expect(command.args).not.toContain('-crf');
  });

  it('does not derive an explicit AV1 encoder from a coarse hardware flag', () => {
    const preset: RenderPreset = {
      id: 'av1', name: 'AV1', container: 'webm', videoCodec: 'av1', audioCodec: 'opus',
      quality: 'high', hardwareAcceleration: 'auto', encoder: 'libsvtav1',
    };
    const command = buildFFmpegCommand({ manifest, preset });
    expect(command.args).toContain('libsvtav1');
    expect(command.args).not.toContain('h264_nvenc');
  });
});
