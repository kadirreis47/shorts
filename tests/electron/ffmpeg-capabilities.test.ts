import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { selectEncoder } from '@/core/export-intelligence';

const require = createRequire(import.meta.url);
const { parseEncoderRows, sanitizeFFmpegDiagnostic } = require('../../electron/ffmpeg-service.cjs') as {
  parseEncoderRows: (output: string) => string[];
  sanitizeFFmpegDiagnostic: (output: string) => string;
};

const realSample = `Encoders:
 V....D libx264              libx264 H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10
 V....D libx264rgb           libx264 H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10 RGB
 V....D h264_amf             AMD AMF H.264 Encoder
 V....D h264_nvenc           NVIDIA NVENC H.264 encoder
 V..... h264_qsv             H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10 (Intel Quick Sync Video acceleration)
 A....D aac                  AAC (Advanced Audio Coding)
 S..... srt                  SubRip subtitle
 ------
not an encoder row
 V....D missing-description`;

function capability(encoders: string[]) {
  const hardwareEncoders = encoders.filter((name) => /nvenc|qsv|vaapi|videotoolbox|amf/i.test(name));
  return { ffmpeg: true, ffprobe: true, version: 'test', encoders, hardwareEncoders, supports: Object.fromEntries(encoders.map((name) => [name, true])), raw: null, detectedAt: 'now' };
}

describe('FFmpeg encoder capability parsing', () => {
  it('parses the confirmed packaged FFmpeg sample without dropping D-flag rows', () => {
    expect(parseEncoderRows(realSample)).toEqual([
      'libx264', 'libx264rgb', 'h264_amf', 'h264_nvenc', 'h264_qsv', 'aac', 'srt',
    ]);
  });

  it('ignores headers, separators, blank lines, malformed rows, and arbitrary text', () => {
    expect(parseEncoderRows('Encoders:\n------\n\nrandom V....D libx264 text\n V....D no-description')).toEqual([]);
  });

  it('keeps hardware classification and deterministic encoder selection unchanged', () => {
    const encoders = parseEncoderRows(realSample);
    const detected = capability(encoders);
    expect(detected.hardwareEncoders).toEqual(['h264_amf', 'h264_nvenc', 'h264_qsv']);
    expect(detected.encoders).toContain('libx264');
    expect(selectEncoder(detected, 'h264', 'cpu')).toMatchObject({ encoder: 'libx264', hardware: 'cpu' });
    expect(selectEncoder(detected, 'h264', 'gpu')).toMatchObject({ encoder: 'h264_nvenc', hardware: 'gpu' });
    expect(selectEncoder(capability(['libx264']), 'h264')).toMatchObject({ encoder: 'libx264', hardware: 'cpu' });
  });

  it('redacts signed remote media URLs from persisted FFmpeg diagnostics', () => {
    const diagnostic = sanitizeFFmpegDiagnostic('Error opening https://project.supabase.co/storage/v1/object/sign/media/user/image.png?token=signed-secret-token');
    expect(diagnostic).toBe('Error opening [remote-media-url]');
    expect(diagnostic).not.toContain('signed-secret-token');
  });
});
