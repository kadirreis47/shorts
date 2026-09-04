import { describe, expect, it } from 'vitest';
import {
  buildFFmpegCommand,
  buildSceneSegmentCommand,
  buildSegmentConcatCommand,
  createRenderFingerprint,
  createSceneFingerprint,
  createIncrementalRenderPlanner,
  buildCanonicalSceneExecutionPlan,
  type RenderPreset,
} from '@/core/render';
import type { RenderManifest } from '@/core/media';
import { buildSubtitleTimeline } from '@/core/media';

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
        { id: 'one', index: 0, durationMs: 5_000, overlapBeforeMs: 0, overlapAfterMs: 1_000, assetIds: [], cameraMotion: 'none', transition: { type: 'fade', durationMs: 1_000 } },
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
  it('uses the same static baseline framing and suppresses unsupported visual operations and transition approximations', () => {
    const value = manifest();
    const full = buildFFmpegCommand({ manifest: value, preset });
    const segment = buildSceneSegmentCommand({ manifest: value, scene: value.timeline.scenes[0], preset, outputPath: 'one.mp4' });
    const segmentFilter = segment.args[segment.args.indexOf('-vf') + 1];
    expect(filter(full)).toContain('scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30');
    expect(segmentFilter).toContain('scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30');
    expect(filter(full)).not.toMatch(/zoompan|gblur|fade=/);
    expect(segmentFilter).not.toMatch(/zoompan|gblur|fade=/);
  });

  it.each(['ken_burns', 'zoom_in', 'zoom_out', 'pan_left', 'pan_right'] as const)('uses deterministic shared image motion for %s', async (motion) => {
    const value = manifest({
      assets: [{ id: 'image', type: 'image', source: 'https://media.example/image.png', metadata: {} }],
      timeline: { scenes: [
        { ...manifest().timeline.scenes[0], assetIds: ['image'], cameraMotion: motion },
        manifest().timeline.scenes[1],
      ], tracks: [] },
    });
    const full = buildFFmpegCommand({ manifest: value, preset });
    const segment = buildSceneSegmentCommand({ manifest: value, scene: value.timeline.scenes[0], preset, outputPath: 'one.mp4' });
    const segmentFilter = segment.args[segment.args.indexOf('-vf') + 1];
    expect(filter(full)).toContain(segmentFilter);
    expect(segmentFilter).toContain("zoompan=z='");
    expect(segmentFilter).toContain('s=1080x1920:fps=30');
    expect(await createSceneFingerprint(value.timeline.scenes[0], value, preset))
      .toBe(await createSceneFingerprint(value.timeline.scenes[0], value, preset));
  });

  it.each([
    ['static', 'none'],
    ['moving', 'zoom_in'],
  ] as const)('uses identical focal crop semantics for full and segment %s execution', async (_label, cameraMotion) => {
    const imageFraming = { version: 1 as const, mode: 'focal-cover' as const, anchor: { x: 0.1, y: 0.9 } };
    const value = manifest({
      assets: [{ id: 'image', type: 'image', source: 'image.png', metadata: {} }],
      timeline: { scenes: [{
        ...manifest().timeline.scenes[0], assetIds: ['image'], cameraMotion, imageFraming,
        imageFramingBinding: { version: 1, mediaIdentity: 'media:00000000-0000-4000-8000-000000000001/generated-images/00000000-0000-4000-8000-000000000002.jpg', contentDigest: 'a'.repeat(64), encodedDimensions: { width: 3, height: 2 }, displayDimensions: { width: 3, height: 2 }, encodedToDisplay: 'identity' },
        imageGeometryAuthority: { authorityReference: 'idga1_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', mediaIdentity: 'media:00000000-0000-4000-8000-000000000001/generated-images/00000000-0000-4000-8000-000000000002.jpg', expectedOrientation: 'identity', contentDigest: 'a'.repeat(64), encodedDimensions: { width: 3, height: 2 }, displayDimensions: { width: 3, height: 2 } },
        sourceScene: { sceneId: 'framed-scene', text: 'framed', duration: 5, visual: '', imageStorage: { bucket: 'media', objectPath: '00000000-0000-4000-8000-000000000001/generated-images/00000000-0000-4000-8000-000000000002.jpg' }, imageFraming, imageFramingBinding: { version: 1, mediaIdentity: 'media:00000000-0000-4000-8000-000000000001/generated-images/00000000-0000-4000-8000-000000000002.jpg', contentDigest: 'a'.repeat(64), encodedDimensions: { width: 3, height: 2 }, displayDimensions: { width: 3, height: 2 }, encodedToDisplay: 'identity' } },
      }, manifest().timeline.scenes[1]], tracks: [] },
    });
    const scene = value.timeline.scenes[0];
    const full = buildFFmpegCommand({ manifest: value, preset });
    const segment = buildSceneSegmentCommand({ manifest: value, scene, preset, outputPath: 'one.mp4' });
    const segmentFilter = segment.args[segment.args.indexOf('-vf') + 1];
    expect(filter(full)).toContain(segmentFilter);
    expect(segmentFilter).toContain("x='min(max(0.1*iw-");
    expect(segmentFilter).toContain("y='min(max(0.9*ih-");

    const centered = structuredClone(value);
    centered.timeline.scenes[0].imageFraming = undefined;
    centered.timeline.scenes[0].imageFramingBinding = undefined;
    expect(await createSceneFingerprint(scene, value, preset))
      .not.toBe(await createSceneFingerprint(centered.timeline.scenes[0], centered, preset));
  });

  it('keeps fractional-duration motion bounded and makes Ken Burns distinct from Zoom In', () => {
    const base = manifest({
      assets: [{ id: 'image', type: 'image', source: 'image.png', metadata: {} }],
      durationMs: 1_001,
      timeline: { scenes: [
        { ...manifest().timeline.scenes[0], durationMs: 1_001, overlapAfterMs: 0, assetIds: ['image'], cameraMotion: 'ken_burns' },
      ], tracks: [] },
    });
    const zoom = structuredClone(base);
    zoom.timeline.scenes[0].cameraMotion = 'zoom_in';
    const kenArgs = buildSceneSegmentCommand({ manifest: base, scene: base.timeline.scenes[0], preset, outputPath: 'ken.mp4' }).args;
    const zoomArgs = buildSceneSegmentCommand({ manifest: zoom, scene: zoom.timeline.scenes[0], preset, outputPath: 'zoom.mp4' }).args;
    const kenFilter = kenArgs[kenArgs.indexOf('-vf') + 1];
    const zoomFilter = zoomArgs[zoomArgs.indexOf('-vf') + 1];
    expect(kenFilter).toContain('on/30');
    expect(kenFilter).toContain('0.35+0.3*on/30');
    expect(zoomFilter).toContain("z='1+0.15*on/30'");
  });

  it('keeps video and static-image scenes free from still-image zoompan', () => {
    const image = manifest({ assets: [{ id: 'image', type: 'image', source: 'image.png', metadata: {} }], timeline: { scenes: [{ ...manifest().timeline.scenes[0], assetIds: ['image'], cameraMotion: 'none' }, manifest().timeline.scenes[1]], tracks: [] } });
    const video = manifest({ assets: [{ id: 'video', type: 'video', source: 'video.mp4', metadata: {} }], timeline: { scenes: [{ ...manifest().timeline.scenes[0], assetIds: ['video'], cameraMotion: 'zoom_in' }, manifest().timeline.scenes[1]], tracks: [] } });
    expect(buildSceneSegmentCommand({ manifest: image, scene: image.timeline.scenes[0], preset, outputPath: 'one.mp4' }).args).not.toContain(expect.stringContaining('zoompan'));
    expect(buildSceneSegmentCommand({ manifest: video, scene: video.timeline.scenes[0], preset, outputPath: 'one.mp4' }).args).not.toContain(expect.stringContaining('zoompan'));
  });

  it('rejects framing on video or image execution without geometry authority', () => {
    const imageFraming = { version: 1 as const, mode: 'focal-cover' as const, anchor: { x: 0.1, y: 0.9 } };
    const video = manifest({ assets: [{ id: 'video', type: 'video', source: 'video.mp4', metadata: {} }], timeline: { scenes: [{ ...manifest().timeline.scenes[0], assetIds: ['video'], imageFraming }, manifest().timeline.scenes[1]], tracks: [] } });
    expect(() => buildCanonicalSceneExecutionPlan(video, video.timeline.scenes[0], preset)).toThrow(/verified private image/i);
    const image = manifest({ assets: [{ id: 'image', type: 'image', source: 'image.png', metadata: {} }], timeline: { scenes: [{ ...manifest().timeline.scenes[0], assetIds: ['image'], imageFraming }, manifest().timeline.scenes[1]], tracks: [] } });
    expect(() => buildCanonicalSceneExecutionPlan(image, image.timeline.scenes[0], preset)).toThrow(/verified private image/i);
  });

  it.each([
    ['identity', 'scale=1080:1920'],
    ['mirror-horizontal', 'hflip,scale=1080:1920'],
    ['rotate-180', 'hflip,vflip,scale=1080:1920'],
    ['mirror-vertical', 'vflip,scale=1080:1920'],
    ['transpose', 'transpose=clock,hflip,scale=1080:1920'],
    ['rotate-90-cw', 'transpose=clock,scale=1080:1920'],
    ['transverse', 'transpose=clock,vflip,scale=1080:1920'],
    ['rotate-90-ccw', 'transpose=cclock,scale=1080:1920'],
  ] as const)('pins and applies image orientation %s before cover geometry', (orientation, expected) => {
    const value = manifest({ assets: [{ id: 'image', type: 'image', source: 'image.jpg', metadata: {} }], timeline: { scenes: [{
      ...manifest().timeline.scenes[0], assetIds: ['image'],
      imageGeometryAuthority: { authorityReference: 'idga1_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', mediaIdentity: 'media:00000000-0000-4000-8000-000000000001/generated-images/00000000-0000-4000-8000-000000000002.jpg', expectedOrientation: orientation, contentDigest: 'a'.repeat(64), encodedDimensions: { width: 3, height: 2 }, displayDimensions: ['transpose', 'rotate-90-cw', 'transverse', 'rotate-90-ccw'].includes(orientation) ? { width: 2, height: 3 } : { width: 3, height: 2 } },
    }, manifest().timeline.scenes[1]], tracks: [] } });
    const full = buildFFmpegCommand({ manifest: value, preset });
    const segment = buildSceneSegmentCommand({ manifest: value, scene: value.timeline.scenes[0], preset, outputPath: 'one.mp4' });
    expect(full.args.slice(0, full.args.indexOf('image.jpg'))).toContain('-noautorotate');
    expect(segment.args.slice(0, segment.args.indexOf('image.jpg'))).toContain('-noautorotate');
    expect(filter(full)).toContain('{{IMAGE_DISPLAY_GEOMETRY_INPUT_0}},scale=');
    expect(segment.args[segment.args.indexOf('-vf') + 1]).toContain('{{IMAGE_DISPLAY_GEOMETRY_INPUT_0}},scale=');
    expect(buildCanonicalSceneExecutionPlan(value, value.timeline.scenes[0], preset).filters.join(',')).toContain(expected);
    expect(full.imageGeometryAuthorities[0].expectedOrientation).toBe(orientation);
  });

  it('does not alter video input orientation behavior', () => {
    const value = manifest({ assets: [{ id: 'video', type: 'video', source: 'video.mp4', metadata: {} }], timeline: { scenes: [{ ...manifest().timeline.scenes[0], assetIds: ['video'], imageOrientation: 'identity' }, manifest().timeline.scenes[1]], tracks: [] } });
    const full = buildFFmpegCommand({ manifest: value, preset });
    const segment = buildSceneSegmentCommand({ manifest: value, scene: value.timeline.scenes[0], preset, outputPath: 'one.mp4' });
    expect(full.args.slice(0, full.args.indexOf('video.mp4'))).not.toContain('-noautorotate');
    expect(segment.args.slice(0, segment.args.indexOf('video.mp4'))).not.toContain('-noautorotate');
  });

  it('preserves the pre-slice implicit behavior for legacy non-authoritative external images', () => {
    const value = manifest({ assets: [{ id: 'image', type: 'image', source: 'legacy.jpg', metadata: {} }], timeline: { scenes: [{ ...manifest().timeline.scenes[0], assetIds: ['image'] }, manifest().timeline.scenes[1]], tracks: [] } });
    const full = buildFFmpegCommand({ manifest: value, preset });
    const segment = buildSceneSegmentCommand({ manifest: value, scene: value.timeline.scenes[0], preset, outputPath: 'one.mp4' });
    expect(full.args.slice(0, full.args.indexOf('legacy.jpg'))).not.toContain('-noautorotate');
    expect(segment.args.slice(0, segment.args.indexOf('legacy.jpg'))).not.toContain('-noautorotate');
  });

  it('composes the same canonical crossfade in full and cache-assisted final rendering', () => {
    const value = manifest({
      durationMs: 9_000,
      timeline: { scenes: [
        { ...manifest().timeline.scenes[0], transition: { type: 'cut', durationMs: 0 }, overlapBeforeMs: 0, overlapAfterMs: 1_000 },
        { ...manifest().timeline.scenes[1], transition: { type: 'crossfade', durationMs: 1_000 }, overlapBeforeMs: 1_000 },
      ], tracks: [] },
    });
    const full = buildFFmpegCommand({ manifest: value, preset });
    const segment = buildSceneSegmentCommand({ manifest: value, scene: value.timeline.scenes[0], preset, outputPath: 'one.mp4' });
    const concat = buildSegmentConcatCommand({ manifest: value, preset, segmentPaths: ['one.mp4', 'two.mp4'] });
    expect(filter(full)).toContain('xfade=transition=fade:duration=1.000:offset=4.000');
    expect(filter(concat)).toContain('xfade=transition=fade:duration=1.000:offset=4.000');
    expect(segment.totalFrames).toBe(150);
    expect(concat.args).toEqual(expect.arrayContaining(['-i', 'one.mp4', '-i', 'two.mp4']));
    expect(concat.args).toContain('libx264');
  });

  it('invalidates final identity while retaining clean segment identity for a transition-only edit', async () => {
    const cut = manifest({
      timeline: { scenes: [
        { ...manifest().timeline.scenes[0], transition: { type: 'cut', durationMs: 0 }, overlapAfterMs: 0 },
        { ...manifest().timeline.scenes[1], transition: { type: 'cut', durationMs: 0 }, overlapBeforeMs: 0 },
      ], tracks: [] },
      durationMs: 10_000,
    });
    const fade = structuredClone(cut);
    fade.durationMs = 9_000;
    fade.timeline.scenes[0].overlapAfterMs = 1_000;
    fade.timeline.scenes[1].transition = { type: 'crossfade', durationMs: 1_000 };
    fade.timeline.scenes[1].overlapBeforeMs = 1_000;
    expect(await createSceneFingerprint(cut.timeline.scenes[0], cut, preset))
      .toBe(await createSceneFingerprint(fade.timeline.scenes[0], fade, preset));
    expect(await createRenderFingerprint({ manifest: cut, preset, adapterId: 'ffmpeg' }))
      .not.toBe(await createRenderFingerprint({ manifest: fade, preset, adapterId: 'ffmpeg' }));
  });

  it('invalidates pre-motion and changed-motion clean scene cache identities', async () => {
    const base = manifest({ assets: [{ id: 'image', type: 'image', source: 'image.png', metadata: {} }], timeline: { scenes: [{ ...manifest().timeline.scenes[0], assetIds: ['image'], cameraMotion: 'none' }, manifest().timeline.scenes[1]], tracks: [] } });
    const changed = structuredClone(base);
    changed.timeline.scenes[0].cameraMotion = 'zoom_in';
    expect(await createSceneFingerprint(base.timeline.scenes[0], base, preset))
      .not.toBe(await createSceneFingerprint(changed.timeline.scenes[0], changed, preset));
  });

  it('keeps clean scene segments full-length and applies legacy hard-cut overlap only during final composition', () => {
    const value = manifest();
    const full = buildFFmpegCommand({ manifest: value, preset });
    const first = buildSceneSegmentCommand({ manifest: value, scene: value.timeline.scenes[0], preset, outputPath: 'one.mp4' });
    const second = buildSceneSegmentCommand({ manifest: value, scene: value.timeline.scenes[1], preset, outputPath: 'two.mp4' });
    expect(full.args).toEqual(expect.arrayContaining(['-t', '5.000', '-t', '5.000']));
    expect(filter(full)).toContain('[v0]trim=duration=4.000');
    expect(first.args).toContain('5.000');
    expect(second.args).toContain('5.000');
    expect(full.totalFrames).toBe(270);
  });

  it('bounds global subtitle cues to the same hard-cut scene boundaries', () => {
    const value = manifest();
    const scenes = value.timeline.scenes.map((scene, index) => ({
      ...scene,
      startMs: index === 0 ? 0 : 4_000,
      endMs: index === 0 ? 5_000 : 9_000,
      subtitleText: index === 0 ? 'First scene subtitle words' : 'Second scene subtitle words',
      sourceScene: { sceneId: `visual-scene-00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, text: 'source', duration: 5, visual: 'source' },
    }));
    const timeline = buildSubtitleTimeline(scenes, { fps: 30 } as never, {
      canonical: { enabled: true, preset: 'minimal', textColor: null, highlightColor: null },
    });
    const firstSceneCues = timeline.cues.filter((cue) => cue.sceneId === 'one');

    expect(firstSceneCues.length).toBeGreaterThan(0);
    expect(Math.max(...firstSceneCues.map((cue) => cue.endMs))).toBeLessThanOrEqual(4_000);
    expect(Math.min(...timeline.cues.filter((cue) => cue.sceneId === 'two').map((cue) => cue.startMs))).toBeGreaterThanOrEqual(4_000);
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
    expect([first, second, third].map((plan) => plan.totalFrames)).toEqual([150, 150, 120]);
    const invalid = structuredClone(chained);
    invalid.timeline.scenes[1].overlapBeforeMs = 9_000;
    expect(() => buildFFmpegCommand({ manifest: invalid, preset })).toThrow('invalid transition overlap');
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
    expect(filter(concat)).toContain('[2:a]atrim=duration=9.000');
    expect(full.args).toContain('[audioout]');
    expect(concat.args).toContain('[audioout]');
  });

  it('derives voice and looping-music input indices from each crossfade composition input count', () => {
    const value = manifest({
      assets: [
        { id: 'voice-asset', type: 'voice', source: 'https://signed.example/voice.mp3', metadata: {} },
        { id: 'music-asset', type: 'music', source: 'https://signed.example/music.mp3', metadata: {} },
      ],
      audio: {
        ...manifest().audio,
        narrationMode: 'required',
        voice: [{ id: 'voice', type: 'voice', assetId: 'voice-asset', startMs: 0, endMs: 9_000, durationMs: 9_000, gain: 1, fadeInMs: 0, fadeOutMs: 0, metadata: {} }],
        music: [{ id: 'music', type: 'music', assetId: 'music-asset', startMs: 0, endMs: 9_000, durationMs: 9_000, gain: .25, fadeInMs: 900, fadeOutMs: 1200, metadata: {} }],
      },
    });
    const full = buildFFmpegCommand({ manifest: value, preset });
    const incremental = buildSegmentConcatCommand({ manifest: value, preset, segmentPaths: ['one.mp4', 'two.mp4'] });

    expect(full.args).toEqual(expect.arrayContaining(['-i', 'https://signed.example/voice.mp3', '-stream_loop', '-1', '-i', 'https://signed.example/music.mp3']));
    expect(incremental.args).toEqual(expect.arrayContaining(['-i', 'https://signed.example/voice.mp3', '-stream_loop', '-1', '-i', 'https://signed.example/music.mp3']));
    expect(filter(full)).toContain('[2:a]atrim=duration=9.000');
    expect(filter(full)).toContain('[3:a]atrim=duration=9.000');
    expect(filter(incremental)).toContain('[2:a]atrim=duration=9.000');
    expect(filter(incremental)).toContain('[3:a]atrim=duration=9.000');
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

  it('never bypasses native image authority through an incremental cache hit', async () => {
    const value = manifest({
      projectId: 'execution-parity-private-image-cache',
      assets: [{ id: 'image', type: 'image', source: 'image.jpg', metadata: {} }],
      timeline: { scenes: [{
        ...manifest().timeline.scenes[0], assetIds: ['image'],
        imageGeometryAuthority: {
          authorityReference: 'idga1_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          mediaIdentity: 'media:00000000-0000-4000-8000-000000000001/generated-images/00000000-0000-4000-8000-000000000002.jpg',
          expectedOrientation: 'transverse', contentDigest: 'a'.repeat(64),
          encodedDimensions: { width: 3, height: 2 }, displayDimensions: { width: 2, height: 3 },
        },
      }, manifest().timeline.scenes[1]], tracks: [] },
    });
    const planner = createIncrementalRenderPlanner();
    try {
      const first = await planner.createPlan({ manifest: value, preset, adapterId: 'ffmpeg' });
      planner.commit({ plan: first, adapterId: 'ffmpeg', presetId: preset.id, outputUri: 'first.mp4' });
      const second = await planner.createPlan({ manifest: value, preset, adapterId: 'ffmpeg' });
      expect(second.fullRenderRequired).toBe(true);
      expect(second.reusableScenes).toBe(0);
    } finally { planner.clear('execution-parity-private-image-cache'); }
  });

  it('associates incremental snapshots by stable scene ID without hashing the opaque ID', async () => {
    const firstId = 'visual-scene-11111111-1111-4111-8111-111111111111';
    const replacementId = 'visual-scene-22222222-2222-4222-8222-222222222222';
    const firstAssetId = `${firstId}-source`;
    const firstManifest = manifest({
      projectId: 'canonical-scene-association-project',
      assets: [{ id: firstAssetId, type: 'video', source: 'https://media.example/same.mp4', metadata: { sceneId: firstId } }],
      timeline: {
        scenes: [{ ...manifest().timeline.scenes[0], id: firstId, assetIds: [firstAssetId] }, manifest().timeline.scenes[1]],
        tracks: [{ id: 'video-track-a', type: 'video', order: 0, muted: false, volume: 1, clips: [{ id: 'random-clip-a', sceneId: firstId, assetId: firstAssetId, startMs: 0, endMs: 5_000, durationMs: 5_000, offsetMs: 0, metadata: { visualProduction: [{ operationId: `${firstId}-operation`, type: 'brightness', scope: 'scene', parameters: { delta: .1 } }] } }] }],
      },
    });
    const planner = createIncrementalRenderPlanner();
    try {
      const first = await planner.createPlan({ manifest: firstManifest, preset, adapterId: 'ffmpeg' });
      planner.commit({ plan: first, adapterId: 'ffmpeg', presetId: preset.id, outputUri: 'first.mp4' });

      const sameScene = await planner.createPlan({ manifest: firstManifest, preset, adapterId: 'ffmpeg' });
      expect(sameScene.items[0].decision).toBe('reuse');
      const replacement = structuredClone(firstManifest);
      replaceSceneIdentity(replacement, firstId, replacementId);
      replacement.assets[0].id = `${replacementId}-source`;
      replacement.timeline.scenes[0].assetIds = [replacement.assets[0].id];
      replacement.timeline.tracks[0].clips[0].id = 'random-clip-b';
      replacement.timeline.tracks[0].clips[0].assetId = replacement.assets[0].id;
      (replacement.timeline.tracks[0].clips[0].metadata.visualProduction as Array<{ operationId: string }>)[0].operationId = `${replacementId}-operation`;
      expect(await createSceneFingerprint(firstManifest.timeline.scenes[0], firstManifest, preset))
        .toBe(await createSceneFingerprint(replacement.timeline.scenes[0], replacement, preset));
      const replacementPlan = await planner.createPlan({ manifest: replacement, preset, adapterId: 'ffmpeg' });
      expect(replacementPlan.items[0]).toMatchObject({ sceneId: replacementId, previousFingerprint: null, decision: 'render' });
    } finally {
      planner.clear('canonical-scene-association-project');
    }
  });

  it('reuses clean subtitle-free segments for subtitle-only changes while final identity remains separate', async () => {
    const value = manifest();
    const changed = structuredClone(value);
    changed.subtitles.style.textColor = '#ff00aa';
    changed.subtitles.cues[0].text = 'Changed subtitle';

    expect(await createSceneFingerprint(value.timeline.scenes[0], value, preset))
      .toBe(await createSceneFingerprint(changed.timeline.scenes[0], changed, preset));
  });
});

function replaceSceneIdentity(value: RenderManifest, oldId: string, newId: string): void {
  const scene = value.timeline.scenes.find((candidate) => candidate.id === oldId);
  if (!scene) throw new Error('Scene fixture identity is missing.');
  scene.id = newId;
  if (scene.sourceScene) scene.sourceScene.sceneId = newId;
  value.assets.forEach((asset) => { if (asset.metadata.sceneId === oldId) Object.assign(asset.metadata, { sceneId: newId }); });
  value.timeline.tracks.forEach((track) => track.clips.forEach((clip) => { if (clip.sceneId === oldId) clip.sceneId = newId; }));
  value.subtitles.cues.forEach((cue) => { if (cue.sceneId === oldId) cue.sceneId = newId; });
  value.audio.voice.forEach((cue) => { if (cue.sceneId === oldId) cue.sceneId = newId; });
  value.audio.sfx.forEach((cue) => { if (cue.sceneId === oldId) cue.sceneId = newId; });
}
