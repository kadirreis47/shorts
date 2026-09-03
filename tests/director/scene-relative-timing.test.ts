import { describe, expect, it } from 'vitest';
import { createMediaEngine, type AssetProviderEngine } from '@/core/media';
import { TypedEventBus, type ApplicationEventMap } from '@/core/events';
import { createDirectorInput } from '@/services/directorApplicationService';
import { earliestSceneRelativeOffset, toSceneRelativeOffset } from '@/services/sceneRelativeTiming';

const assetEngine: AssetProviderEngine = {
  async resolve() {
    return { assets: [], report: { resolutions: [], providerUsage: {}, cacheHits: 0, cacheMisses: 0,
      resolvedCount: 0, unresolvedCount: 2, duplicateCandidatesRejected: 0 } };
  },
  clearCache() {},
};

describe('scene-relative cue timing', () => {
  it('0 ms başlangıçlı hook cue zamanını korur', () => {
    expect(toSceneRelativeOffset({ startMs: 400 }, { startMs: 0, endMs: 3_000 })).toBe(400);
  });

  it('10.000 ms başlangıçlı sahnede absolute cue değerini 400 ms yapar', () => {
    expect(toSceneRelativeOffset({ startMs: 10_400 }, { startMs: 10_000, endMs: 13_000 })).toBe(400);
  });

  it('sahne öncesinde başlayıp sahneye taşan segmenti 0 ms değerine clamp eder', () => {
    expect(toSceneRelativeOffset({ startMs: 9_000, endMs: 10_500 }, { startMs: 10_000, endMs: 13_000 })).toBe(0);
  });

  it('sahneyle kesişmeyen cue ve segmentleri dışlar', () => {
    const scene = { startMs: 10_000, endMs: 13_000 };
    expect(earliestSceneRelativeOffset([{ startMs: 0, endMs: 9_999 }, { startMs: 13_001 }], scene)).toBeNull();
  });

  it('timeline boyunca süren background music sonraki hook sahnesinde 0 ms aktif audio olarak görülür', async () => {
    const manifest = await buildManifest();
    const second = manifest.timeline.scenes[1];
    manifest.audio.voice = [];
    manifest.audio.sfx = [];
    manifest.audio.music = [{ id: 'background', type: 'music', startMs: 0, endMs: manifest.durationMs,
      durationMs: manifest.durationMs, gain: 1, fadeInMs: 0, fadeOutMs: 0, metadata: {} }];
    expect(createDirectorInput(manifest).scenes.find((scene) => scene.id === second.id)?.firstAudioCueMs).toBe(0);
  });

  it('sahne başlamadan önce biten background music segmentini hesaba katmaz', async () => {
    const manifest = await buildManifest();
    const second = manifest.timeline.scenes[1];
    manifest.audio.voice = [];
    manifest.audio.sfx = [];
    manifest.audio.music = [{ id: 'old-music', type: 'music', startMs: 0, endMs: second.startMs,
      durationMs: second.startMs, gain: 1, fadeInMs: 0, fadeOutMs: 0, metadata: {} }];
    expect(createDirectorInput(manifest).scenes.find((scene) => scene.id === second.id)?.firstAudioCueMs).toBeNull();
  });

  it('sahne başladıktan sonra başlayan background music için doğru relative offset üretir', async () => {
    const manifest = await buildManifest();
    const second = manifest.timeline.scenes[1];
    manifest.audio.voice = [];
    manifest.audio.sfx = [];
    manifest.audio.music = [{ id: 'later-music', type: 'music', startMs: second.startMs + 700, endMs: second.endMs,
      durationMs: second.durationMs - 700, gain: 1, fadeInMs: 0, fadeOutMs: 0, metadata: {} }];
    expect(createDirectorInput(manifest).scenes.find((scene) => scene.id === second.id)?.firstAudioCueMs).toBe(700);
  });

  it('ilk sahnede timeline başlangıçlı background music değerini 0 ms tutar', async () => {
    const manifest = await buildManifest();
    const first = manifest.timeline.scenes[0];
    manifest.audio.voice = [];
    manifest.audio.sfx = [];
    manifest.audio.music = [{ id: 'music', type: 'music', startMs: 0, endMs: manifest.durationMs,
      durationMs: manifest.durationMs, gain: 1, fadeInMs: 0, fadeOutMs: 0, metadata: {} }];
    expect(createDirectorInput(manifest).scenes.find((scene) => scene.id === first.id)?.firstAudioCueMs).toBe(0);
  });

  it('subtitle, audio ve cut değerlerini sahne koordinatına dönüştürür', async () => {
    const manifest = await buildManifest();
    const scene = manifest.timeline.scenes[1];
    scene.role = 'hook';
    scene.transition.type = 'cut';
    manifest.subtitles.cues = [{ id: 'cue', sceneId: scene.id, text: 'Hook', startMs: scene.startMs + 400,
      endMs: scene.startMs + 900, durationMs: 500, wordIds: [], lineCount: 1, emphasisWordIds: [] }];
    manifest.audio.voice = [];
    manifest.audio.music = [];
    manifest.audio.sfx = [{ id: 'sfx', type: 'sfx', sceneId: scene.id, startMs: scene.startMs + 600,
      endMs: scene.startMs + 800, durationMs: 200, gain: 1, fadeInMs: 0, fadeOutMs: 0, metadata: {} }];
    const input = createDirectorInput(manifest).scenes.find((item) => item.id === scene.id);
    expect(input).toMatchObject({ firstSubtitleMs: 400, firstAudioCueMs: 600, firstCutMs: 0 });
  });
});

async function buildManifest() {
  const engine = createMediaEngine(new TypedEventBus<ApplicationEventMap>(), assetEngine);
  return (await engine.buildProject({ projectId: 'timing', title: 'Timing', scenes: [
    { sceneId: 'visual-scene-00000000-0000-4000-8000-000000000001', text: 'İlk sahne', duration: 10, visual: 'İlk' },
    { sceneId: 'visual-scene-00000000-0000-4000-8000-000000000002', text: 'Hook sahnesi', duration: 3, visual: 'Hook' },
  ] })).manifest;
}
