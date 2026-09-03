import { describe, expect, it } from 'vitest';
import {
  createAssetProviderEngine,
  createMediaEngine,
  formatCanonicalSrtTime,
  serializeCanonicalSubtitleSrt,
  type SubtitleTimeline,
} from '@/core/media';
import { TypedEventBus, type ApplicationEventMap } from '@/core/events';

describe('canonical subtitle SRT export', () => {
  it('serializes the canonical word-aligned timeline instead of authored scene-duration proportions', async () => {
    const build = await buildProject({ alignment: productionAlignment() });
    const srt = serializeCanonicalSubtitleSrt(build.subtitleTimeline);

    expect(build.subtitleTimeline.source).toBe('word-timestamps');
    expect(build.subtitleTimeline.cues.map((cue) => [cue.startMs, cue.endMs])).toEqual([[0, 300], [2043, 2345], [5000, 5450]]);
    expect(srt).toBe([
      '1', '00:00:00,000 --> 00:00:00,300', 'One', '',
      '2', '00:00:02,043 --> 00:00:02,345', 'Two', '',
      '3', '00:00:05,000 --> 00:00:05,450', 'Three', '',
    ].join('\n'));
    expect(srt).not.toContain('00:00:02,431');
  });

  it('uses the same estimated canonical cue timeline for legacy narration without alignment', async () => {
    const build = await buildProject();
    const srt = serializeCanonicalSubtitleSrt(build.subtitleTimeline);

    expect(build.subtitleTimeline.source).toBe('estimated');
    expect(build.subtitleTimeline.cues.map((cue) => [cue.startMs, cue.endMs])).toEqual([[0, 4_500], [4_500, 9_000], [9_000, 13_500]]);
    expect(srt).toContain('2\n00:00:04,500 --> 00:00:09,000\nTwo');
    expect(srt).toBe(serializeCanonicalSubtitleSrt(build.project.subtitles));
  });

  it('formats bounded canonical cue timestamps deterministically and preserves Unicode text', () => {
    const timeline: SubtitleTimeline = {
      enabled: true, source: 'word-timestamps', language: 'tr', durationMs: 2_340,
      words: [], style: {} as SubtitleTimeline['style'], metrics: {} as SubtitleTimeline['metrics'],
      cues: [{ id: 'cue', sceneId: 'scene', text: "İstanbul'da\r\ngüzel!", startMs: 120, endMs: 2_340, durationMs: 2_220, wordIds: [], lineCount: 2, emphasisWordIds: [] }],
    };

    expect(formatCanonicalSrtTime(0)).toBe('00:00:00,000');
    expect(formatCanonicalSrtTime(120)).toBe('00:00:00,120');
    expect(formatCanonicalSrtTime(1_000)).toBe('00:00:01,000');
    expect(formatCanonicalSrtTime(1_250)).toBe('00:00:01,250');
    expect(formatCanonicalSrtTime(2_340)).toBe('00:00:02,340');
    expect(serializeCanonicalSubtitleSrt(timeline)).toBe("1\n00:00:00,120 --> 00:00:02,340\nİstanbul'da\ngüzel!\n");
  });

  it('fails closed for malformed canonical cue timing', () => {
    const invalid = { enabled: true, source: 'estimated', language: 'tr', durationMs: 1_000, words: [], style: {} as never, metrics: {} as never,
      cues: [{ id: 'bad', sceneId: 'scene', text: 'Bad', startMs: 500, endMs: 500, durationMs: 0, wordIds: [], lineCount: 1, emphasisWordIds: [] }] } as SubtitleTimeline;
    expect(() => serializeCanonicalSubtitleSrt(invalid)).toThrow(/invalid SRT cue/i);
  });
});

async function buildProject({ alignment }: { alignment?: { characters: string[]; characterStartTimesMs: number[]; characterEndTimesMs: number[] } } = {}) {
  const bus = new TypedEventBus<ApplicationEventMap>();
  return createMediaEngine(bus, createAssetProviderEngine(bus)).buildProject({
    projectId: 'canonical-srt',
    title: 'Canonical SRT',
    scenes: [
      { sceneId: 'visual-scene-00000000-0000-4000-8000-000000000001', text: 'One', duration: 5, visual: 'One' },
      { sceneId: 'visual-scene-00000000-0000-4000-8000-000000000002', text: 'Two', duration: 5, visual: 'Two' },
      { sceneId: 'visual-scene-00000000-0000-4000-8000-000000000003', text: 'Three', duration: 5, visual: 'Three' },
    ],
    subtitles: { enabled: true, preset: 'classic', textColor: null, highlightColor: null },
    transition: { type: 'cut' },
    narration: alignment ? {
      storage: { bucket: 'media', objectPath: 'owner/voiceovers/00000000-0000-4000-8000-000000000000.mp3' },
      durationMs: 7_497,
      scriptRevision: 'revision',
      voiceId: 'voice',
      alignment,
    } : undefined,
  });
}

function productionAlignment() {
  const characters = [...'One Two Three'];
  const characterStartTimesMs = [0, 100, 200, 300, 2043, 2143, 2243, 2345, 5000, 5100, 5200, 5300, 5400];
  const characterEndTimesMs = [100, 200, 300, 350, 2143, 2243, 2345, 2390, 5100, 5200, 5300, 5400, 5450];
  return { characters, characterStartTimesMs, characterEndTimesMs };
}
