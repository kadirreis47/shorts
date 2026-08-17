import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { buildFFmpegCommand, buildSceneSegmentCommand, type RenderPreset } from '@/core/render';
import type { RenderManifest } from '@/core/media';
import { editingFixture } from '../editing/fixtures';

const require = createRequire(import.meta.url);
const { serializeSubtitleFilterFilename } = require('../../electron/ffmpeg-service.cjs') as {
  serializeSubtitleFilterFilename: (value: string) => string;
};

const preset: RenderPreset = { id: 'test', name: 'Test', container: 'mp4', videoCodec: 'h264', audioCodec: 'aac', quality: 'standard', hardwareAcceleration: 'disabled' };
const manifest = {
  durationMs: 2_000,
  render: { fps: 30, width: 1080, height: 1920 },
  timeline: { scenes: [{ id: 'scene-1', index: 0, durationMs: 2_000, assetIds: [] }], tracks: [] },
  assets: [],
  subtitles: { cues: [{ sceneId: 'scene-1', startMs: 0, endMs: 2_000, text: 'Test' }], style: {} },
} as unknown as RenderManifest;

describe('FFmpeg subtitles filter filename serialization', () => {
  it.each([
    ['Windows temporary path', 'C:\\Users\\Test\\AppData\\Local\\Temp\\shortsflow-ffmpeg-123\\subtitles.srt', "'C\\:/Users/Test/AppData/Local/Temp/shortsflow-ffmpeg-123/subtitles.srt'"],
    ['Windows path with spaces', 'C:\\Temp Folder\\Shorts Flow\\subtitles.srt', "'C\\:/Temp Folder/Shorts Flow/subtitles.srt'"],
    ['POSIX path', '/tmp/shortsflow/subtitles.srt', "'/tmp/shortsflow/subtitles.srt'"],
    ['apostrophe', "C:\\Temp\\O'Brien\\subtitles.srt", "'C\\:/Temp/O\\'Brien/subtitles.srt'"],
  ])('serializes %s as one quoted filtergraph filename value', (_name, input, expected) => {
    expect(serializeSubtitleFilterFilename(input)).toBe(expected);
  });

  it('keeps the canonical ASS subtitle filename as a safely serialized filter option', () => {
    const filter = buildFFmpegCommand({ manifest, preset }).args[buildFFmpegCommand({ manifest, preset }).args.indexOf('-filter_complex') + 1];
    const resolved = filter.replace('{{SUBTITLE_FILE_FILTER_VALUE}}', serializeSubtitleFilterFilename('C:\\Temp Folder\\Shorts Flow\\subtitles.srt'));
    expect(resolved).toContain("subtitles=filename='C\\:/Temp Folder/Shorts Flow/subtitles.srt'");
    expect(resolved).not.toContain('subtitles=C');
    expect(resolved).not.toContain('original_size=');
  });

  it('defers segment subtitles to the canonical final concat stage', async () => {
    const fixture = await editingFixture();
    const scene = fixture.manifest.timeline.scenes[0];
    const command = buildSceneSegmentCommand({ manifest: fixture.manifest, scene, preset, outputPath: 'out.mp4' });
    const filter = command.args[command.args.indexOf('-vf') + 1];
    expect(filter).not.toContain('subtitles=');
  });
});
