import { snapMsToFrame } from './durationPlanner';
import type {
  MediaProjectSettings,
  MediaScene,
  TimelineMarker,
  TimelineMetrics,
} from './types';

export interface TimelineBuildResult {
  scenes: MediaScene[];
  durationMs: number;
  markers: TimelineMarker[];
  metrics: TimelineMetrics;
}

export function buildIntelligentTimeline(
  plannedScenes: MediaScene[],
  settings: MediaProjectSettings,
): TimelineBuildResult {
  let cursorMs = 0;
  const scenes = plannedScenes.map((scene, index) => {
    const overlapBeforeMs = index === 0
      ? 0
      : calculateOverlap(scene.transition.durationMs, settings.transitionOverlap, settings.fps);
    const startMs = Math.max(0, cursorMs - overlapBeforeMs);
    const endMs = startMs + scene.durationMs;
    cursorMs = endMs;
    return { ...scene, startMs, endMs, overlapBeforeMs, overlapAfterMs: 0 };
  });

  for (let index = 0; index < scenes.length - 1; index += 1) {
    scenes[index] = { ...scenes[index], overlapAfterMs: scenes[index + 1].overlapBeforeMs };
  }

  const durationMs = scenes.length > 0 ? scenes[scenes.length - 1].endMs : 0;
  const markers = buildMarkers(scenes, durationMs, settings);
  const metrics = calculateTimelineMetrics(scenes, durationMs);
  return { scenes, durationMs, markers, metrics };
}

function buildMarkers(
  scenes: MediaScene[],
  durationMs: number,
  settings: MediaProjectSettings,
): TimelineMarker[] {
  const markers: TimelineMarker[] = [];
  for (const scene of scenes) {
    markers.push(marker('scene-start', scene.startMs, `Scene ${scene.index + 1} start`, scene.id));
    markers.push(marker('scene-end', scene.endMs, `Scene ${scene.index + 1} end`, scene.id));
    if (scene.overlapBeforeMs > 0) {
      markers.push(marker('transition', scene.startMs, `${scene.transition.type} transition`, scene.id, {
        durationMs: scene.transition.durationMs,
        overlapMs: scene.overlapBeforeMs,
      }));
    }
    if (scene.intensity >= 0.75) {
      markers.push(marker('emphasis', scene.startMs + scene.durationMs * 0.45, 'Emphasis point', scene.id, {
        intensity: scene.intensity,
      }));
    }
  }
  for (let timeMs = settings.beatIntervalMs; timeMs < durationMs; timeMs += settings.beatIntervalMs) {
    markers.push(marker('beat', timeMs, 'Beat grid'));
  }
  return markers.sort((a, b) => a.timeMs - b.timeMs);
}

function calculateTimelineMetrics(scenes: MediaScene[], durationMs: number): TimelineMetrics {
  const durations = scenes.map((scene) => scene.durationMs);
  const totalTransitionMs = scenes.reduce((sum, scene) => sum + scene.overlapBeforeMs, 0);
  const averageSceneDurationMs = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  const cutsPerMinute = durationMs > 0 ? Math.max(0, scenes.length - 1) / (durationMs / 60_000) : 0;
  const targetCutsPerMinute = 12;
  const pacingScore = Math.round(Math.max(0, 100 - Math.abs(cutsPerMinute - targetCutsPerMinute) * 4));
  return {
    durationMs,
    averageSceneDurationMs: Math.round(averageSceneDurationMs),
    shortestSceneDurationMs: durations.length ? Math.min(...durations) : 0,
    longestSceneDurationMs: durations.length ? Math.max(...durations) : 0,
    cutsPerMinute: round(cutsPerMinute, 2),
    transitionCoverage: durationMs > 0 ? round(totalTransitionMs / durationMs, 4) : 0,
    pacingScore,
  };
}

function calculateOverlap(transitionMs: number, ratio: number, fps: number): number {
  return snapMsToFrame(Math.round(transitionMs * ratio), fps);
}

function marker(
  type: TimelineMarker['type'],
  timeMs: number,
  label: string,
  sceneId?: string,
  metadata: Readonly<Record<string, unknown>> = {},
): TimelineMarker {
  return {
    id: createId(`marker-${type}`),
    type,
    timeMs: Math.max(0, Math.round(timeMs)),
    sceneId,
    label,
    metadata,
  };
}

function createId(prefix: string): string {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function round(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}
