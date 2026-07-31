import type { AudioTimeline } from './audioTypes';
import type { SubtitleTimeline } from './subtitleTypes';
import type { MediaClip, MediaScene, MediaTrack } from './types';

export function composeTracks(
  scenes: MediaScene[],
  subtitles?: SubtitleTimeline,
  audio?: AudioTimeline,
): MediaTrack[] {
  const videoClips = scenes.map((scene) => createClip(scene, scene.assetIds[0], {
    cameraMotion: scene.cameraMotion,
    transition: scene.transition,
  }));

  const voiceClips = audio
    ? audio.voice.map(audioSegmentToClip)
    : scenes.map((scene) => createClip(scene, undefined, {
        text: scene.text,
        role: 'voice-placeholder',
      }));

  const musicClips = audio ? audio.music.map(audioSegmentToClip) : [];
  const effectsClips = audio ? audio.sfx.map(audioSegmentToClip) : [];

  const subtitleClips = subtitles
    ? subtitles.cues.map((cue) => ({
        id: createId('clip-subtitle'),
        sceneId: cue.sceneId,
        startMs: cue.startMs,
        endMs: cue.endMs,
        durationMs: cue.durationMs,
        offsetMs: 0,
        metadata: {
          role: 'subtitle',
          text: cue.text,
          wordIds: cue.wordIds,
          emphasisWordIds: cue.emphasisWordIds,
          lineCount: cue.lineCount,
          style: subtitles.style,
        },
      }))
    : scenes.map((scene) => createClip(scene, undefined, {
        text: scene.subtitleText,
        role: 'subtitle',
      }));

  return [
    createTrack('video', 0, videoClips, 1),
    createTrack('voice', 10, voiceClips, audio?.settings.voiceGain ?? 1),
    createTrack('music', 20, musicClips, audio?.settings.musicGain ?? 0.18),
    createTrack('subtitle', 30, subtitleClips, 1),
    createTrack('overlay', 40, [], 1),
    createTrack('effects', 50, effectsClips, audio?.settings.sfxGain ?? 1),
  ];
}

function audioSegmentToClip(segment: AudioTimeline['voice'][number]): MediaClip {
  return {
    id: createId(`clip-${segment.type}`),
    sceneId: segment.sceneId ?? 'global',
    assetId: segment.assetId,
    startMs: segment.startMs,
    endMs: segment.endMs,
    durationMs: segment.durationMs,
    offsetMs: 0,
    metadata: {
      ...segment.metadata,
      audioType: segment.type,
      gain: segment.gain,
      fadeInMs: segment.fadeInMs,
      fadeOutMs: segment.fadeOutMs,
    },
  };
}

function createTrack(
  type: MediaTrack['type'],
  order: number,
  clips: MediaClip[],
  volume: number,
): MediaTrack {
  return {
    id: createId(`track-${type}`),
    type,
    order,
    muted: false,
    volume,
    clips,
  };
}

function createClip(
  scene: MediaScene,
  assetId: string | undefined,
  metadata: Readonly<Record<string, unknown>>,
): MediaClip {
  return {
    id: createId('clip'),
    sceneId: scene.id,
    assetId,
    startMs: scene.startMs,
    endMs: scene.endMs,
    durationMs: scene.durationMs,
    offsetMs: 0,
    metadata,
  };
}

function createId(prefix: string): string {
  const suffix = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}
