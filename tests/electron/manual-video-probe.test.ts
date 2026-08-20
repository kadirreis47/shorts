import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { MAX_MANUAL_VIDEO_BYTES, PROBE_ARGS, normalizeProbe, probeManualMp4 } = require('../../electron/manual-video-probe.cjs') as {
  MAX_MANUAL_VIDEO_BYTES: number;
  PROBE_ARGS: readonly string[];
  normalizeProbe(input: unknown): unknown;
  probeManualMp4(bytes: ArrayBuffer, options: Record<string, unknown>): Promise<unknown>;
};

const valid = { format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '5' }, streams: [{ codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080, r_frame_rate: '30000/1001' }, { codec_type: 'audio', codec_name: 'aac' }] };

describe('manual MP4 trusted probe', () => {
  it('returns only allowlisted H.264 MP4 metadata and parses rational frame rates', () => {
    expect(normalizeProbe(valid)).toEqual({ container: 'mp4', codec: 'h264', width: 1920, height: 1080, fps: 30000 / 1001, durationMs: 5000, hasAudio: true });
    expect(JSON.stringify(normalizeProbe(valid))).not.toContain('format_name');
  });
  it.each([
    [{ ...valid, streams: [] }],
    [{ ...valid, streams: [{ ...valid.streams[0], codec_name: 'hevc' }] }],
    [{ ...valid, format: { ...valid.format, duration: '0' } }],
    [{ ...valid, streams: [{ ...valid.streams[0], width: 3841 }] }],
    [{ ...valid, streams: [{ ...valid.streams[0], r_frame_rate: '61/1' }] }],
    [{ ...valid, streams: [{ ...valid.streams[0], r_frame_rate: '30/1/2' }] }],
    [{ ...valid, streams: [{ ...valid.streams[0], r_frame_rate: '9007199254740992/1' }] }],
    [{ ...valid, streams: [valid.streams[0], valid.streams[0]] }],
  ])('rejects an unsafe or ambiguous probe result', (input) => expect(() => normalizeProbe(input)).toThrow(/manual-video-probe/));
  it('uses fixed probe arguments, bounded bytes, and always removes its main-owned temp directory', async () => {
    const removed: string[] = [];
    const fsApi = { promises: {
      mkdtemp: async () => 'C:/tmp/shortsflow-manual-video-test',
      writeFile: async () => undefined,
      rm: async (value: string) => { removed.push(value); },
    } };
    await expect(probeManualMp4(new Uint8Array([1]).buffer, { fsApi, resolveExecutable: () => 'trusted-ffprobe', runProbe: async (executable: string, filePath: string) => { expect(executable).toBe('trusted-ffprobe'); expect(filePath).toMatch(/\.mp4$/); return valid; } })).resolves.toMatchObject({ codec: 'h264' });
    expect(removed).toEqual(['C:/tmp/shortsflow-manual-video-test']);
    expect(PROBE_ARGS.join(' ')).not.toContain('path');
    await expect(probeManualMp4(new ArrayBuffer(MAX_MANUAL_VIDEO_BYTES + 1), { fsApi })).rejects.toThrow(/size/);
  });
  it('fails closed when successful probing cannot clean its main-owned temporary directory', async () => {
    const fsApi = { promises: { mkdtemp: async () => 'C:/tmp/probe', writeFile: async () => undefined, rm: async () => { throw new Error('locked'); } } };
    await expect(probeManualMp4(new Uint8Array([1]).buffer, { fsApi, resolveExecutable: () => 'trusted', runProbe: async () => valid })).rejects.toThrow(/cleanup/);
  });
});
