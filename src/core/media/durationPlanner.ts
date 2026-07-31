import type { MediaProjectSettings, PacingPreset } from './types';

export const DEFAULT_MEDIA_SETTINGS: MediaProjectSettings = {
  fps: 30,
  resolution: { width: 1080, height: 1920 },
  aspectRatio: '9:16',
  defaultTransitionMs: 350,
  wordsPerMinute: 155,
  minimumSceneDurationMs: 1_800,
  maximumSceneDurationMs: 15_000,
  pacingPreset: 'dynamic',
  transitionOverlap: 0.65,
  beatIntervalMs: 500,
  snapToFrames: true,
};

const PACING_MULTIPLIER: Record<PacingPreset, number> = {
  calm: 1.16,
  balanced: 1,
  dynamic: 0.9,
  viral: 0.8,
};

export function normalizeMediaSettings(settings: Partial<MediaProjectSettings> = {}): MediaProjectSettings {
  const merged: MediaProjectSettings = {
    ...DEFAULT_MEDIA_SETTINGS,
    ...settings,
    resolution: { ...DEFAULT_MEDIA_SETTINGS.resolution, ...settings.resolution },
  };
  return {
    ...merged,
    fps: clamp(Math.round(merged.fps), 12, 120),
    wordsPerMinute: clamp(merged.wordsPerMinute, 80, 260),
    defaultTransitionMs: clamp(Math.round(merged.defaultTransitionMs), 0, 2_000),
    transitionOverlap: clamp(merged.transitionOverlap, 0, 1),
    beatIntervalMs: clamp(Math.round(merged.beatIntervalMs), 150, 2_000),
  };
}

export function estimateSceneDurationMs(
  text: string,
  explicitDurationSeconds: number | undefined,
  settings: MediaProjectSettings,
): number {
  const rawDuration = typeof explicitDurationSeconds === 'number' && explicitDurationSeconds > 0
    ? explicitDurationSeconds * 1_000
    : estimateFromSpeech(text, settings);
  const pacedDuration = rawDuration * PACING_MULTIPLIER[settings.pacingPreset];
  const bounded = clamp(Math.round(pacedDuration), settings.minimumSceneDurationMs, settings.maximumSceneDurationMs);
  return settings.snapToFrames ? snapMsToFrame(bounded, settings.fps) : bounded;
}

export function snapMsToFrame(valueMs: number, fps: number): number {
  const frameDurationMs = 1_000 / fps;
  return Math.round(valueMs / frameDurationMs) * frameDurationMs;
}

function estimateFromSpeech(text: string, settings: MediaProjectSettings): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const speechMs = words === 0 ? settings.minimumSceneDurationMs : (words / settings.wordsPerMinute) * 60_000;
  const sentencePauseMs = (text.match(/[.!?]/g)?.length ?? 0) * 190;
  const clausePauseMs = (text.match(/[,;:—-]/g)?.length ?? 0) * 95;
  const emphasisPauseMs = (text.match(/[!?]{2,}|\.{3}/g)?.length ?? 0) * 220;
  return speechMs + sentencePauseMs + clausePauseMs + emphasisPauseMs;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
