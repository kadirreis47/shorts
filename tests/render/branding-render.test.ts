import { describe, expect, it } from 'vitest';
import type { RenderManifest } from '@/core/media';
import {
  buildCanonicalBrandingRenderPlan,
  buildFFmpegCommand,
  buildSegmentConcatCommand,
  createRenderFingerprint,
  createSceneFingerprint,
  type RenderPreset,
} from '@/core/render';
import { escapeDrawtextText } from '@/core/render/brandingRenderBuilder';

const preset: RenderPreset = {
  id: 'branding', name: 'Branding', container: 'mp4', videoCodec: 'h264',
  audioCodec: 'aac', frameRate: 30, quality: 'standard', hardwareAcceleration: 'disabled',
};

function manifest(): RenderManifest {
  return {
    projectId: 'branding-project', durationMs: 9_000,
    render: { fps: 30, width: 1080, height: 1920, aspectRatio: '9:16' },
    timeline: {
      scenes: [
        { id: 'one', index: 0, durationMs: 5_000, overlapBeforeMs: 0, overlapAfterMs: 1_000, assetIds: [], cameraMotion: 'none', transition: { type: 'cut', durationMs: 0 } },
        { id: 'two', index: 1, durationMs: 5_000, overlapBeforeMs: 1_000, overlapAfterMs: 0, assetIds: [], cameraMotion: 'none', transition: { type: 'crossfade', durationMs: 1_000 } },
      ], tracks: [], durationMs: 9_000, markers: [], metrics: {},
    },
    assets: [],
    subtitles: {
      enabled: true,
      cues: [{ sceneId: 'one', startMs: 0, endMs: 1_000, text: 'Caption', wordIds: [], emphasisWordIds: [], lineCount: 1 }],
      style: { fontFamily: 'Arial', fontSize: 64, fontWeight: 800, textColor: '#ffffff', highlightColor: '#ffff00', backgroundColor: '#000000', backgroundOpacity: 0, strokeWidth: 3, shadowDepth: 0, position: 'bottom', animation: 'none' },
    },
    audio: { narrationMode: 'silent', voice: [], music: [], sfx: [], settings: { masterGain: 1, voiceGain: 1, musicGain: .18, sfxGain: .72, duckingGain: .32, duckingAttackMs: 120, duckingReleaseMs: 260, musicFadeInMs: 900, musicFadeOutMs: 1200, targetLufs: -14 } },
    branding: { watermark: { text: 'ShortsFlow', position: 'bottom-right' } },
    validation: null, metadata: { title: 'Branding', source: 'manual', createdAt: 'fixed', updatedAt: 'fixed', tags: [] }, schemaVersion: '1.4', createdAt: 'fixed',
  } as unknown as RenderManifest;
}

function filter(plan: { args: string[] }): string { return plan.args[plan.args.indexOf('-filter_complex') + 1] ?? ''; }

describe('canonical text watermark', () => {
  it('omits disabled branding and maps every bounded position deterministically', () => {
    expect(buildCanonicalBrandingRenderPlan({ branding: { watermark: null }, width: 1080, height: 1920, inputLabel: 'base' }))
      .toEqual({ filter: null, outputLabel: 'base' });
    expect(buildCanonicalBrandingRenderPlan({ branding: { watermark: { text: '  ', position: 'bottom-right' } }, width: 1080, height: 1920, inputLabel: 'base' }))
      .toEqual({ filter: null, outputLabel: 'base' });
    expect(buildCanonicalBrandingRenderPlan({ branding: { watermark: { text: 'A', position: 'top-left' } }, width: 1080, height: 1920, inputLabel: 'base' }).filter).toContain('x=43:y=43');
    expect(buildCanonicalBrandingRenderPlan({ branding: { watermark: { text: 'A', position: 'top-right' } }, width: 1080, height: 1920, inputLabel: 'base' }).filter).toContain('x=w-text_w-43:y=43');
    expect(buildCanonicalBrandingRenderPlan({ branding: { watermark: { text: 'A', position: 'bottom-left' } }, width: 1080, height: 1920, inputLabel: 'base' }).filter).toContain('x=43:y=h-text_h-43');
    expect(buildCanonicalBrandingRenderPlan({ branding: { watermark: { text: 'A', position: 'bottom-right' } }, width: 1080, height: 1920, inputLabel: 'base' }).filter).toContain('x=w-text_w-43:y=h-text_h-43');
    expect(buildCanonicalBrandingRenderPlan({ branding: { watermark: { text: 'A', position: 'bottom-right' } }, width: 1080, height: 1920, inputLabel: 'base' }).filter).toContain('fontcolor=white@0.72:fontsize=46');
  });

  it('escapes hostile text as bounded drawtext content rather than filter syntax', () => {
    const escaped = escapeDrawtextText("Brand: O'Reilly; [x], %{unsafe}\\next\nemoji ✨");
    expect(escaped).toBe("Brand\\: O\\'Reilly\\; \\[x\\]\\, %{unsafe}\\\\next\\nemoji ✨");
    const plan = buildCanonicalBrandingRenderPlan({ branding: { watermark: { text: "O'Reilly: %{x}", position: 'bottom-right' } }, width: 1080, height: 1920, inputLabel: 'base' });
    expect(plan.filter).toContain("text='O\\'Reilly\\: %{x}'");
    expect(plan.filter).toContain('expansion=none');
    expect(plan.filter).not.toContain('drawtext=text=evil');
  });

  it('applies one global watermark after crossfade and before global ASS in both strategies', () => {
    const value = manifest();
    const full = buildFFmpegCommand({ manifest: value, preset });
    const incremental = buildSegmentConcatCommand({ manifest: value, preset, segmentPaths: ['one.mp4', 'two.mp4'] });
    const fullFilter = filter(full);
    const incrementalFilter = filter(incremental);
    for (const graph of [fullFilter, incrementalFilter]) {
      expect(graph).toContain('xfade=transition=fade');
      expect(graph).toContain("drawtext=fontfile='C\\:/Windows/Fonts/arial.ttf'");
      expect(graph).toContain('subtitles=filename={{SUBTITLE_FILE_FILTER_VALUE}}');
      expect(graph.indexOf('xfade=')).toBeLessThan(graph.indexOf('drawtext='));
      expect(graph.indexOf('drawtext=')).toBeLessThan(graph.indexOf('subtitles='));
      expect((graph.match(/drawtext=/g) ?? [])).toHaveLength(1);
    }
  });

  it('does not add visual inputs or shift canonical narration binding', () => {
    const value = manifest();
    value.assets = [{ id: 'voice', type: 'voice', source: 'https://signed.example/voice.mp3', metadata: {} }];
    value.audio = { ...value.audio, narrationMode: 'required', voice: [{ id: 'voice-segment', assetId: 'voice', type: 'voice', startMs: 0, endMs: 9_000, durationMs: 9_000, gain: 1, fadeInMs: 0, fadeOutMs: 0, metadata: {} }] };
    const full = buildFFmpegCommand({ manifest: value, preset });
    const incremental = buildSegmentConcatCommand({ manifest: value, preset, segmentPaths: ['one.mp4', 'two.mp4'] });
    expect(filter(full)).toContain('[2:a]atrim=duration=9.000');
    expect(filter(incremental)).toContain('[2:a]atrim=duration=9.000');
    expect(full.args).toContain('https://signed.example/voice.mp3');
    expect(incremental.args).toContain('https://signed.example/voice.mp3');
  });

  it('does not emit a watermark filter when branding is disabled', () => {
    const value = manifest();
    value.branding = { watermark: null };
    expect(filter(buildFFmpegCommand({ manifest: value, preset }))).not.toContain('drawtext=');
    expect(filter(buildSegmentConcatCommand({ manifest: value, preset, segmentPaths: ['one.mp4', 'two.mp4'] }))).not.toContain('drawtext=');
  });

  it('reuses clean segments while invalidating final identity for branding-only changes', async () => {
    const before = manifest();
    const after = structuredClone(before);
    after.branding!.watermark = { text: 'Changed', position: 'top-left' };
    expect(await createSceneFingerprint(before.timeline.scenes[0], before, preset))
      .toBe(await createSceneFingerprint(after.timeline.scenes[0], after, preset));
    expect(await createRenderFingerprint({ manifest: before, preset, adapterId: 'ffmpeg' }))
      .not.toBe(await createRenderFingerprint({ manifest: after, preset, adapterId: 'ffmpeg' }));
  });
});
