import { describe, expect, it } from 'vitest';
import {
  buildFFmpegCommand,
  buildSceneSegmentCommand,
  buildSegmentConcatCommand,
  createIncrementalRenderPlanner,
  type RenderPreset,
} from '@/core/render';
import type { RenderManifest } from '@/core/media';

const preset: RenderPreset = {
  id: 'parity', name: 'Parity', container: 'mp4', videoCodec: 'h264',
  audioCodec: 'aac', quality: 'standard', hardwareAcceleration: 'disabled',
};

function manifest(overrides: Record<string, unknown> = {}): RenderManifest {
  return {
    projectId: 'execution-parity-project',
    durationMs: 9_000,
    render: { fps: 30, width: 1080, height: 1920 },
    timeline: {
      scenes: [
        { id: 'one', index: 0, durationMs: 5_000, overlapBeforeMs: 0, overlapAfterMs: 1_000, assetIds: [], cameraMotion: 'zoom_in', transition: { type: 'fade', durationMs: 1_000 } },
        { id: 'two', index: 1, durationMs: 5_000, overlapBeforeMs: 1_000, overlapAfterMs: 0, assetIds: [], cameraMotion: 'none', transition: { type: 'fade', durationMs: 1_000 } },
      ], tracks: [],
    },
    assets: [],
    subtitles: {
      cues: [{ sceneId: 'one', startMs: 0, endMs: 1_000, text: 'Canonical subtitle', wordIds: [], emphasisWordIds: [], lineCount: 1 }],
      style: { fontFamily: 'Arial', fontSize: 64, fontWeight: 800, textColor: '#ffffff', highlightColor: '#ffff00', backgroundColor: '#000000', backgroundOpacity: 0, strokeWidth: 3, shadowDepth: 0, position: 'bottom', animation: 'none' },
    },
    audio: { narrationMode: 'silent', voice: [], music: [], sfx: [], settings: { masterGain: 1, voiceGain: 1, musicGain: .18, sfxGain: .72, duckingGain: .32, duckingAttackMs: 120, duckingReleaseMs: 260, musicFadeInMs: 900, musicFadeOutMs: 1200, targetLufs: -14 } },
    ...overrides,
  } as unknown as RenderManifest;
}

function filter(plan: { args: string[] }): string { return plan.args[plan.args.indexOf('-filter_complex') + 1] ?? ''; }

describe('full and incremental canonical execution parity', () => {
  it('uses the same baseline framing and suppresses hidden motion, visual operations, and transition approximations', () => {
    const value = manifest();
    const full = buildFFmpegCommand({ manifest: value, preset });
    const segment = buildSceneSegmentCommand({ manifest: value, scene: value.timeline.scenes[0], preset, outputPath: 'one.mp4' });
    const segmentFilter = segment.args[segment.args.indexOf('-vf') + 1];
    expect(filter(full)).toContain('scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30');
    expect(segmentFilter).toContain('scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30');
    expect(filter(full)).not.toMatch(/zoompan|gblur|fade=/);
    expect(segmentFilter).not.toMatch(/zoompan|gblur|fade=/);
  });

  it('uses hard-cut effective durations that equal the canonical overlapped timeline without truncating the final scene', () => {
    const value = manifest();
    const full = buildFFmpegCommand({ manifest: value, preset });
    const first = buildSceneSegmentCommand({ manifest: value, scene: value.timeline.scenes[0], preset, outputPath: 'one.mp4' });
    const second = buildSceneSegmentCommand({ manifest: value, scene: value.timeline.scenes[1], preset, outputPath: 'two.mp4' });
    expect(full.args).toEqual(expect.arrayContaining(['-t', '4.000', '-t', '5.000']));
    expect(first.args).toContain('4.000');
    expect(second.args).toContain('5.000');
    expect(full.totalFrames).toBe(270);
  });

  it('handles chained valid overlaps deterministically and rejects malformed overlap metadata', () => {
    const chained = manifest({
      durationMs: 11_000,
      timeline: { scenes: [
        { id: 'one', index: 0, durationMs: 5_000, overlapBeforeMs: 0, overlapAfterMs: 1_000, assetIds: [], cameraMotion: 'none', transition: { type: 'fade', durationMs: 1_000 } },
        { id: 'two', index: 1, durationMs: 5_000, overlapBeforeMs: 1_000, overlapAfterMs: 2_000, assetIds: [], cameraMotion: 'none', transition: { type: 'fade', durationMs: 2_000 } },
        { id: 'three', index: 2, durationMs: 4_000, overlapBeforeMs: 2_000, overlapAfterMs: 0, assetIds: [], cameraMotion: 'none', transition: { type: 'fade', durationMs: 2_000 } },
      ], tracks: [] },
    });
    const first = buildSceneSegmentCommand({ manifest: chained, scene: chained.timeline.scenes[0], preset, outputPath: 'one.mp4' });
    const second = buildSceneSegmentCommand({ manifest: chained, scene: chained.timeline.scenes[1], preset, outputPath: 'two.mp4' });
    const third = buildSceneSegmentCommand({ manifest: chained, scene: chained.timeline.scenes[2], preset, outputPath: 'three.mp4' });
    expect([first, second, third].map((plan) => plan.totalFrames)).toEqual([120, 90, 120]);
    const invalid = structuredClone(chained);
    invalid.timeline.scenes[1].overlapBeforeMs = 9_000;
    expect(() => buildFFmpegCommand({ manifest: invalid, preset })).toThrow('invalid hard-cut overlap');
  });

  it('burns one shared global ASS plan only at final composition in both strategies', () => {
    const value = manifest();
    const full = buildFFmpegCommand({ manifest: value, preset });
    const segment = buildSceneSegmentCommand({ manifest: value, scene: value.timeline.scenes[0], preset, outputPath: 'one.mp4' });
    const concat = buildSegmentConcatCommand({ manifest: value, preset, segmentPaths: ['one.mp4', 'two.mp4'] });
    expect(full.subtitleContent).toContain('[V4+ Styles]');
    expect(concat.subtitleContent).toBe(full.subtitleContent);
    expect(filter(full)).toContain('subtitles=filename={{SUBTITLE_FILE_FILTER_VALUE}}');
    expect(filter(concat)).toContain('subtitles=filename={{SUBTITLE_FILE_FILTER_VALUE}}');
    expect(segment.args[segment.args.indexOf('-vf') + 1]).not.toContain('subtitles=');
  });

  it('fails closed for unresolved required narration in both strategies', () => {
    const value = manifest({ audio: { ...manifest().audio, narrationMode: 'required', voice: [{ id: 'voice', assetId: 'missing', type: 'voice', startMs: 0, endMs: 9_000, durationMs: 9_000, gain: 1, fadeInMs: 0, fadeOutMs: 0, metadata: {} }] } });
    expect(() => buildFFmpegCommand({ manifest: value, preset })).toThrow('Required canonical narration');
    expect(() => buildSegmentConcatCommand({ manifest: value, preset, segmentPaths: ['one.mp4', 'two.mp4'] })).toThrow('Required canonical narration');
  });

  it('binds the same real durable narration in full and incremental final composition', () => {
    const value = manifest({
      assets: [{ id: 'voice-asset', type: 'voice', source: 'https://signed.example/owner/voice.mp3', metadata: {} }],
      audio: { ...manifest().audio, narrationMode: 'required', voice: [{ id: 'voice', assetId: 'voice-asset', type: 'voice', startMs: 0, endMs: 9_000, durationMs: 9_000, gain: 1, fadeInMs: 0, fadeOutMs: 0, metadata: {} }] },
    });
    const full = buildFFmpegCommand({ manifest: value, preset });
    const concat = buildSegmentConcatCommand({ manifest: value, preset, segmentPaths: ['one.mp4', 'two.mp4'] });
    expect(full.args).toContain('https://signed.example/owner/voice.mp3');
    expect(concat.args).toContain('https://signed.example/owner/voice.mp3');
    expect(filter(full)).toContain('[2:a]atrim=duration=9.000');
    expect(filter(concat)).toContain('[1:a]atrim=duration=9.000');
    expect(full.args).toContain('[audioout]');
    expect(concat.args).toContain('[audioout]');
  });

  it('keeps intentional silent output valid and shares AV1 output selection', () => {
    const value = manifest();
    const av1 = { ...preset, videoCodec: 'av1' as const, container: 'webm' as const };
    const full = buildFFmpegCommand({ manifest: value, preset: av1 });
    const segment = buildSceneSegmentCommand({ manifest: value, scene: value.timeline.scenes[0], preset: av1, outputPath: 'one.webm' });
    const concat = buildSegmentConcatCommand({ manifest: value, preset: av1, segmentPaths: ['one.webm', 'two.webm'] });
    expect(full.args).toContain('libaom-av1');
    expect(segment.args).toContain('libaom-av1');
    expect(concat.args).toContain('libaom-av1');
    expect(full.args).toContain('anullsrc=channel_layout=stereo:sample_rate=48000');
  });

  it('changes cache strategy after a hit without changing the shared semantic inputs', async () => {
    const value = manifest({ projectId: 'execution-parity-cache-project' });
    const planner = createIncrementalRenderPlanner();
    try {
      const first = await planner.createPlan({ manifest: value, preset, adapterId: 'ffmpeg' });
      expect(first.fullRenderRequired).toBe(true);
      planner.commit({ plan: first, adapterId: 'ffmpeg', presetId: preset.id, outputUri: 'first.mp4' });
      const second = await planner.createPlan({ manifest: value, preset, adapterId: 'ffmpeg' });
      expect(second.fullRenderRequired).toBe(false);
      expect(second.items.map((item) => item.fingerprint)).toEqual(first.items.map((item) => item.fingerprint));
      const full = buildFFmpegCommand({ manifest: value, preset });
      const segment = buildSceneSegmentCommand({ manifest: value, scene: value.timeline.scenes[0], preset, outputPath: 'one.mp4' });
      expect(filter(full)).toContain(segment.args[segment.args.indexOf('-vf') + 1]);
    } finally {
      planner.clear('execution-parity-cache-project');
    }
  });
});
