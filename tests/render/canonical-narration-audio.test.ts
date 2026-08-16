import { describe, expect, it } from 'vitest';
import { buildAudioMixCommand } from '@/core/render/audioMixCommandBuilder';
import { buildFFmpegCommand } from '@/core/render/ffmpegCommandBuilder';
import type { RenderManifest } from '@/core/media';

describe('canonical narration FFmpeg binding', () => {
  it('uses a real voice input once and pads a short narration instead of looping or shortening video', () => {
    const manifest = {
      assets: [{ id: 'voice-asset', type: 'voice', source: 'shortsflow-storage://media/owner/voiceovers/a.mp3', metadata: {} }],
      audio: {
        voice: [{ id: 'voice', type: 'voice', assetId: 'voice-asset', startMs: 0, endMs: 30_000, durationMs: 30_000, gain: 1, fadeInMs: 0, fadeOutMs: 0, metadata: {} }],
        music: [], sfx: [], settings: { masterGain: 1, voiceGain: 1, musicGain: .18, sfxGain: .72, duckingGain: .32, duckingAttackMs: 120, duckingReleaseMs: 260, musicFadeInMs: 900, musicFadeOutMs: 1200, targetLufs: -14 },
      },
    } as unknown as RenderManifest;

    const plan = buildAudioMixCommand(manifest, 1);
    expect(plan.inputArgs).toEqual(['-i', 'shortsflow-storage://media/owner/voiceovers/a.mp3']);
    expect(plan.voiceInputCount).toBe(1);
    expect(plan.filterComplex).toContain('[1:a]atrim=duration=30.000,apad=whole_dur=30.000');
    expect(plan.filterComplex).not.toContain('[1:a],atrim');
  });

  it('builds a separator-safe full graph for multi-scene required narration', () => {
    const manifest = { validation: { renderReady: true }, render: { fps: 30, width: 1080, height: 1920 }, durationMs: 30_000, timeline: { scenes: [{ durationMs: 12_000, assetIds: [] }, { durationMs: 18_000, assetIds: [] }] }, subtitles: { cues: [] }, assets: [{ id: 'voice-asset', type: 'voice', source: 'https://signed.example/voice.mp3', metadata: {} }], audio: { narrationMode: 'required', voice: [{ id: 'voice', type: 'voice', assetId: 'voice-asset', startMs: 0, endMs: 30_000, durationMs: 30_000, gain: 1, fadeInMs: 45, fadeOutMs: 70, metadata: {} }], music: [], sfx: [], settings: { masterGain: 1, voiceGain: 1, musicGain: .18, sfxGain: .72, duckingGain: .32, duckingAttackMs: 120, duckingReleaseMs: 260, musicFadeInMs: 900, musicFadeOutMs: 1200, targetLufs: -14 } } } as unknown as RenderManifest;
    const plan = buildFFmpegCommand({ manifest, preset: {} } as never);
    const filterGraph = plan.args[plan.args.indexOf('-filter_complex') + 1];
    expect(plan.args).toContain('https://signed.example/voice.mp3');
    expect(plan.args).toContain('[audioout]');
    expect(plan.args).not.toContain('anullsrc=channel_layout=stereo:sample_rate=48000');
    expect(filterGraph).toContain('[2:a]atrim=duration=30.000');
    expect(filterGraph).not.toContain('[2:a],atrim');
    expect(filterGraph).not.toContain(';;');
    expect(filterGraph.startsWith(';')).toBe(false);
    expect(filterGraph.endsWith(';')).toBe(false);
    expect(filterGraph.split(';').every(Boolean)).toBe(true);
  });
});
