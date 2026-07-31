import type { MediaClip, MediaScene, MediaTrack } from './types';

export function composeTracks(scenes: MediaScene[]): MediaTrack[] {
  const videoClips = scenes.map((scene) => createClip(scene, scene.assetIds[0], {
    cameraMotion: scene.cameraMotion,
    transition: scene.transition,
  }));

  const voiceClips = scenes.map((scene) => createClip(scene, undefined, {
    text: scene.text,
    role: 'voice-placeholder',
  }));

  const subtitleClips = scenes.map((scene) => createClip(scene, undefined, {
    text: scene.subtitleText,
    role: 'subtitle',
  }));

  return [
    createTrack('video', 0, videoClips, 1),
    createTrack('voice', 10, voiceClips, 1),
    createTrack('music', 20, [], 0.18),
    createTrack('subtitle', 30, subtitleClips, 1),
    createTrack('overlay', 40, [], 1),
    createTrack('effects', 50, [], 1),
  ];
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
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}
