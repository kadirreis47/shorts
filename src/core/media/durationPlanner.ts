import type { MediaProjectSettings } from './types';

export const DEFAULT_MEDIA_SETTINGS: MediaProjectSettings = {
  fps: 30,
  resolution: { width: 1080, height: 1920 },
  aspectRatio: '9:16',
  defaultTransitionMs: 350,
  wordsPerMinute: 155,
  minimumSceneDurationMs: 1_800,
  maximumSceneDurationMs: 15_000,
};

export function normalizeMediaSettings(
  settings: Partial<MediaProjectSettings> = {},
): MediaProjectSettings {
  return {
    ...DEFAULT_MEDIA_SETTINGS,
    ...settings,
    resolution: {
      ...DEFAULT_MEDIA_SETTINGS.resolution,
      ...settings.resolution,
    },
  };
}

export function estimateSceneDurationMs(
  text: string,
  explicitDurationSeconds: number | undefined,
  settings: MediaProjectSettings,
): number {
  if (typeof explicitDurationSeconds === 'number' && explicitDurationSeconds > 0) {
    return clamp(
      Math.round(explicitDurationSeconds * 1000),
      settings.minimumSceneDurationMs,
      settings.maximumSceneDurationMs,
    );
  }

  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const speechMs = words === 0
    ? settings.minimumSceneDurationMs
    : (words / settings.wordsPerMinute) * 60_000;
  const punctuationPauseMs = (text.match(/[.!?;:]/g)?.length ?? 0) * 170;

  return clamp(
    Math.round(speechMs + punctuationPauseMs),
    settings.minimumSceneDurationMs,
    settings.maximumSceneDurationMs,
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
