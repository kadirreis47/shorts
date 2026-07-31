import type { TimelineMarker } from './types';
import type { MediaScene } from './types';
import type {
  AudioAutomationPoint,
  AudioBuildOptions,
  AudioMixMetrics,
  AudioMixSettings,
  AudioSegment,
  AudioTimeline,
} from './audioTypes';

const DEFAULT_SETTINGS: AudioMixSettings = {
  masterGain: 1,
  voiceGain: 1,
  musicGain: 0.18,
  sfxGain: 0.72,
  duckingGain: 0.32,
  duckingAttackMs: 120,
  duckingReleaseMs: 260,
  musicFadeInMs: 900,
  musicFadeOutMs: 1200,
  targetLufs: -14,
};

export function buildAudioTimeline(
  scenes: MediaScene[],
  markers: TimelineMarker[],
  durationMs: number,
  options: AudioBuildOptions = {},
): AudioTimeline {
  const settings = normalizeAudioSettings(options.settings);
  const voice = buildVoiceSegments(scenes, settings, options.voiceAssetIdsByScene);
  const music = buildMusicSegments(durationMs, settings, options.musicAssetId);
  const sfx = buildSfxSegments(scenes, markers, settings);
  const automation = buildDuckingAutomation(voice, settings);

  return {
    durationMs,
    settings,
    voice,
    music,
    sfx,
    automation,
    metrics: calculateMetrics(durationMs, voice, music, sfx, automation, settings),
  };
}

export function normalizeAudioSettings(
  settings: Partial<AudioMixSettings> | undefined,
): AudioMixSettings {
  return {
    masterGain: clamp(settings?.masterGain ?? DEFAULT_SETTINGS.masterGain, 0, 1.5),
    voiceGain: clamp(settings?.voiceGain ?? DEFAULT_SETTINGS.voiceGain, 0, 1.5),
    musicGain: clamp(settings?.musicGain ?? DEFAULT_SETTINGS.musicGain, 0, 1),
    sfxGain: clamp(settings?.sfxGain ?? DEFAULT_SETTINGS.sfxGain, 0, 1.5),
    duckingGain: clamp(settings?.duckingGain ?? DEFAULT_SETTINGS.duckingGain, 0, 1),
    duckingAttackMs: Math.max(0, settings?.duckingAttackMs ?? DEFAULT_SETTINGS.duckingAttackMs),
    duckingReleaseMs: Math.max(0, settings?.duckingReleaseMs ?? DEFAULT_SETTINGS.duckingReleaseMs),
    musicFadeInMs: Math.max(0, settings?.musicFadeInMs ?? DEFAULT_SETTINGS.musicFadeInMs),
    musicFadeOutMs: Math.max(0, settings?.musicFadeOutMs ?? DEFAULT_SETTINGS.musicFadeOutMs),
    targetLufs: clamp(settings?.targetLufs ?? DEFAULT_SETTINGS.targetLufs, -30, -5),
  };
}

function buildVoiceSegments(
  scenes: MediaScene[],
  settings: AudioMixSettings,
  assetIdsByScene: Readonly<Record<string, string>> | undefined,
): AudioSegment[] {
  return scenes.map((scene) => ({
    id: createId('audio-voice'),
    type: 'voice',
    sceneId: scene.id,
    assetId: assetIdsByScene?.[scene.id],
    startMs: scene.startMs,
    endMs: scene.endMs,
    durationMs: scene.durationMs,
    gain: settings.voiceGain,
    fadeInMs: Math.min(45, Math.round(scene.durationMs * 0.05)),
    fadeOutMs: Math.min(70, Math.round(scene.durationMs * 0.08)),
    metadata: {
      text: scene.text,
      role: scene.role,
      source: assetIdsByScene?.[scene.id] ? 'asset' : 'tts-placeholder',
    },
  }));
}

function buildMusicSegments(
  durationMs: number,
  settings: AudioMixSettings,
  assetId: string | undefined,
): AudioSegment[] {
  if (durationMs <= 0) return [];

  return [{
    id: createId('audio-music'),
    type: 'music',
    assetId,
    startMs: 0,
    endMs: durationMs,
    durationMs,
    gain: settings.musicGain,
    fadeInMs: Math.min(settings.musicFadeInMs, durationMs / 2),
    fadeOutMs: Math.min(settings.musicFadeOutMs, durationMs / 2),
    metadata: {
      role: 'background-music',
      source: assetId ? 'asset' : 'music-placeholder',
      loop: true,
    },
  }];
}

function buildSfxSegments(
  scenes: MediaScene[],
  markers: TimelineMarker[],
  settings: AudioMixSettings,
): AudioSegment[] {
  const byScene = new Map(scenes.map((scene) => [scene.id, scene]));
  const usable = markers.filter((marker) => marker.type === 'transition' || marker.type === 'emphasis');

  return usable.map((marker) => {
    const scene = marker.sceneId ? byScene.get(marker.sceneId) : undefined;
    const durationMs = marker.type === 'transition' ? 320 : 180;
    const startMs = Math.max(0, marker.timeMs - Math.round(durationMs * 0.35));
    const endMs = startMs + durationMs;

    return {
      id: createId('audio-sfx'),
      type: 'sfx',
      sceneId: marker.sceneId,
      startMs,
      endMs,
      durationMs,
      gain: settings.sfxGain * (scene ? clamp(0.65 + scene.intensity * 0.35, 0.65, 1) : 1),
      fadeInMs: 20,
      fadeOutMs: 80,
      metadata: {
        role: marker.type === 'transition' ? 'transition-sfx' : 'emphasis-sfx',
        markerId: marker.id,
        suggestedEffect: marker.type === 'transition' ? suggestTransitionSfx(scene?.transition.type) : 'pop',
      },
    };
  });
}

function buildDuckingAutomation(
  voice: AudioSegment[],
  settings: AudioMixSettings,
): AudioAutomationPoint[] {
  return voice.flatMap((segment) => {
    const attackStart = Math.max(0, segment.startMs - settings.duckingAttackMs);
    const releaseEnd = segment.endMs + settings.duckingReleaseMs;

    return [
      createAutomationPoint(attackStart, settings.musicGain, segment.sceneId, 'ducking-attack-start'),
      createAutomationPoint(segment.startMs, settings.musicGain * settings.duckingGain, segment.sceneId, 'ducking-active'),
      createAutomationPoint(segment.endMs, settings.musicGain * settings.duckingGain, segment.sceneId, 'ducking-release-start'),
      createAutomationPoint(releaseEnd, settings.musicGain, segment.sceneId, 'ducking-release-end'),
    ];
  }).sort((a, b) => a.timeMs - b.timeMs);
}

function createAutomationPoint(
  timeMs: number,
  gain: number,
  sceneId: string | undefined,
  phase: string,
): AudioAutomationPoint {
  return {
    id: createId('audio-automation'),
    type: 'ducking',
    trackType: 'music',
    timeMs,
    gain,
    sceneId,
    metadata: { phase },
  };
}

function calculateMetrics(
  durationMs: number,
  voice: AudioSegment[],
  music: AudioSegment[],
  sfx: AudioSegment[],
  automation: AudioAutomationPoint[],
  settings: AudioMixSettings,
): AudioMixMetrics {
  const voiceDuration = voice.reduce((sum, segment) => sum + segment.durationMs, 0);
  const eventTimes = [0, durationMs, ...voice.flatMap((segment) => [segment.startMs, segment.endMs]), ...sfx.flatMap((segment) => [segment.startMs, segment.endMs])];
  let peakConcurrentLayers = music.length > 0 ? 1 : 0;

  for (const timeMs of eventTimes) {
    const concurrent = Number(music.some((segment) => contains(segment, timeMs)))
      + Number(voice.some((segment) => contains(segment, timeMs)))
      + Number(sfx.some((segment) => contains(segment, timeMs)));
    peakConcurrentLayers = Math.max(peakConcurrentLayers, concurrent);
  }

  return {
    durationMs,
    voiceCoverage: durationMs > 0 ? round(clamp(voiceDuration / durationMs, 0, 1)) : 0,
    duckingEventCount: Math.floor(automation.length / 4),
    sfxCount: sfx.length,
    peakConcurrentLayers,
    estimatedIntegratedLufs: settings.targetLufs,
  };
}

function contains(segment: AudioSegment, timeMs: number): boolean {
  return timeMs >= segment.startMs && timeMs < segment.endMs;
}

function suggestTransitionSfx(transition: MediaScene['transition']['type'] | undefined): string {
  switch (transition) {
    case 'slide': return 'whoosh';
    case 'zoom': return 'zoom-hit';
    case 'blur': return 'glitch-swish';
    case 'fade':
    case 'crossfade': return 'soft-sweep';
    default: return 'click';
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function createId(prefix: string): string {
  const suffix = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}
