import { describe, expect, it } from 'vitest';
import { assessNarrationAlignment, buildSubtitleTimeline, type MediaScene } from '@/core/media';
import { buildCanonicalSubtitleRenderPlan } from '@/core/render';
import { normalizeNarrationCharacterAlignment } from '@/shared/voiceoverAlignment';

const scene = (id: string, index: number, text: string, startMs: number, endMs: number): MediaScene => ({
  id, index, text, subtitleText: text, startMs, endMs, durationMs: endMs - startMs, overlapBeforeMs: 0, overlapAfterMs: 0,
  role: 'setup', visualPrompt: '', keywords: [], assetIds: [], cameraMotion: 'none', transition: { type: 'cut', durationMs: 0 }, intensity: 0,
  sourceScene: { text, duration: (endMs - startMs) / 1000, visual: '' },
});

describe('aligned subtitle timeline', () => {
  const scenes = [scene('one', 0, 'Merhaba dünya', 0, 1_000), scene('two', 1, 'nasılsın?', 1_000, 2_000)];
  const characters = [...'Merhaba dünya nasılsın?'];
  const characterStartTimesMs = characters.map((_, index) => index < 7 ? index * 20 : index < 13 ? 200 + (index - 8) * 20 : index < 14 ? 320 : 1_050 + (index - 14) * 20);
  const alignment = { characters, characterStartTimesMs, characterEndTimesMs: characterStartTimesMs.map((time) => time + 20) };
  it('uses original aligned word timing when scene text is proven compatible', () => {
    const timeline = buildSubtitleTimeline(scenes, { fps: 30 } as never, { narrationAlignment: alignment });
    expect(timeline.source).toBe('word-timestamps');
    expect(timeline.words.map((word) => [word.text, word.startMs, word.endMs])).toEqual([
      ['Merhaba', 0, 140], ['dünya', 200, 300], ['nasılsın?', 1_050, 1_230],
    ]);
  });
  it('falls back deterministically when scene text was edited after narration', () => {
    const edited = [scene('one', 0, 'Edited text', 0, 1_000)];
    const timeline = buildSubtitleTimeline(edited, { fps: 30 } as never, { narrationAlignment: alignment });
    expect(timeline.source).toBe('estimated');
    expect(assessNarrationAlignment(edited, { fps: 30 } as never, alignment).reason).toBe('scene-text-mismatch');
  });
  it('maps unchanged ordered scene text to the original narration without reconstructing separators', () => {
    const sourceScenes = [scene('one', 0, 'Merhaba', 0, 1_000), scene('two', 1, 'dünya!', 1_000, 2_000)];
    const characters = [...'Merhaba\n\ndünya!'];
    const starts = characters.map((_, index) => index < 7 ? index * 50 : 1_000 + Math.max(0, index - 9) * 50);
    const alignment = { characters, characterStartTimesMs: starts, characterEndTimesMs: starts.map((time) => time + 40) };
    const timeline = buildSubtitleTimeline(sourceScenes, { fps: 30 } as never, { narrationAlignment: alignment, narrationDurationMs: 1_500 });
    expect(timeline.source).toBe('word-timestamps');
    expect(timeline.words.map((word) => word.text)).toEqual(['Merhaba', 'dünya!']);
  });
  it('rejects reordered scene text rather than attaching durable timing to different authored content', () => {
    const reordered = [scenes[1], scenes[0]];
    expect(assessNarrationAlignment(reordered, { fps: 30 } as never, alignment).reason).toBe('scene-text-mismatch');
    expect(buildSubtitleTimeline(reordered, { fps: 30 } as never, { narrationAlignment: alignment }).source).toBe('estimated');
  });
  it('keeps cross-scene words and out-of-window timings on the estimated fallback', () => {
    const boundaryScenes = [scene('one', 0, 'Hello', 0, 500), scene('two', 1, 'World', 500, 1_000)];
    const crossBoundary = {
      characters: [...'HelloWorld'],
      characterStartTimesMs: Array.from({ length: 10 }, (_, index) => index * 50),
      characterEndTimesMs: Array.from({ length: 10 }, (_, index) => index * 50 + 40),
    };
    expect(assessNarrationAlignment(boundaryScenes, { fps: 30 } as never, crossBoundary, 600).reason).toBe('scene-boundary-cross');

    const lateWord = { characters: ['H', 'i'], characterStartTimesMs: [1_000, 1_050], characterEndTimesMs: [1_040, 1_090] };
    const assessment = assessNarrationAlignment([scene('one', 0, 'Hi', 0, 500)], { fps: 30 } as never, lateWord, 1_100);
    expect(assessment.reason).toBe('scene-window');
    expect(assessment.sceneWindow).toEqual({
      detail: 'after-scene', sceneIndex: 0, wordStartMs: 1_000, wordEndMs: 1_090,
      sceneStartMs: 0, sceneEndMs: 500, narrationDurationMs: 1_100,
    });
  });
  it('keeps legacy narration without alignment on the deterministic estimated path', () => {
    expect(buildSubtitleTimeline(scenes, { fps: 30 } as never, {}).source).toBe('estimated');
  });
  it('feeds measured word onsets into karaoke while legacy timelines keep equal timing', () => {
    const timeline = buildSubtitleTimeline(scenes, { fps: 30 } as never, { narrationAlignment: alignment, canonical: { enabled: true, preset: 'karaoke', textColor: null, highlightColor: null } });
    const plan = buildCanonicalSubtitleRenderPlan({ cues: timeline.cues, words: timeline.words, source: timeline.source, width: 1080, height: 1920, style: timeline.style });
    expect(plan.assContent).toContain('{\\k20}');
    expect(plan.assContent).toContain('{\\k10}dünya');
  });
  it('keeps known provider times in project-global ASS dialogue coordinates', () => {
    const hello = scene('one', 0, 'Hello world', 0, 2_000);
    const starts = [...'Hello world'].map((_, index) => index < 5 ? 200 + index * 80 : index < 6 ? 650 : 800 + (index - 6) * 80);
    const timeline = buildSubtitleTimeline([hello], { fps: 30 } as never, {
      narrationAlignment: { characters: [...'Hello world'], characterStartTimesMs: starts, characterEndTimesMs: starts.map((time) => time + 80) },
      canonical: { enabled: true, preset: 'karaoke', textColor: null, highlightColor: null },
    });
    const plan = buildCanonicalSubtitleRenderPlan({ cues: timeline.cues, words: timeline.words, source: timeline.source, width: 1080, height: 1920, style: timeline.style });
    expect(timeline.words.map((word) => word.startMs)).toEqual([200, 800]);
    expect(plan.assContent).toContain('Dialogue: 0,0:00:00.20,0:00:01.20,Karaoke');
    expect(plan.assContent).toContain('{\\k60}');
  });
  it('validates against durable MP3 duration rather than fractional frame-snapped visual time', () => {
    const frameSnapped = [scene('one', 0, 'Hi', 0, 1_000 / 3)];
    const providerAlignment = { characters: ['H', 'i'], characterStartTimesMs: [0, 100], characterEndTimesMs: [100, 200] };
    // This is the production failure shape: visual end time is fractional at 30fps,
    // while durable narration duration is an integer MP3 contract.
    expect(normalizeNarrationCharacterAlignment(providerAlignment, 1_000 / 3)).toBeNull();
    expect(assessNarrationAlignment(frameSnapped, { fps: 30 } as never, providerAlignment, 300).reason).toBe('aligned');
    expect(buildSubtitleTimeline(frameSnapped, { fps: 30 } as never, { narrationAlignment: providerAlignment, narrationDurationMs: 300 }).source).toBe('word-timestamps');
  });
});
