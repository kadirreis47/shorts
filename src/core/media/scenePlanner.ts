import type { Scene } from '@/lib/types';
import { estimateSceneDurationMs } from './durationPlanner';
import type {
  CameraMotion,
  MediaProjectSettings,
  MediaScene,
  TransitionType,
} from './types';

export function planScenes(
  scenes: Scene[],
  settings: MediaProjectSettings,
): MediaScene[] {
  let cursorMs = 0;

  return scenes
    .filter((scene) => scene.text.trim().length > 0)
    .map((scene, index) => {
      const durationMs = estimateSceneDurationMs(scene.text, scene.duration, settings);
      const startMs = cursorMs;
      const endMs = startMs + durationMs;
      cursorMs = endMs;

      return {
        id: createId('scene'),
        index,
        text: scene.text.trim(),
        visualPrompt: scene.imagePrompt?.trim() || scene.visual?.trim() || scene.text.trim(),
        keywords: scene.keywords?.filter(Boolean) ?? [],
        startMs,
        endMs,
        durationMs,
        assetIds: [],
        cameraMotion: selectCameraMotion(index, scene.emphasis === true),
        transition: {
          type: selectTransition(index),
          durationMs: index === 0 ? 0 : settings.defaultTransitionMs,
        },
        subtitleText: scene.overlayText?.trim() || scene.text.trim(),
        sourceScene: scene,
      } satisfies MediaScene;
    });
}

function selectCameraMotion(index: number, emphasis: boolean): CameraMotion {
  if (emphasis) return 'zoom_in';
  const motions: CameraMotion[] = ['ken_burns', 'pan_right', 'zoom_in', 'pan_left', 'zoom_out'];
  return motions[index % motions.length];
}

function selectTransition(index: number): TransitionType {
  if (index === 0) return 'cut';
  const transitions: TransitionType[] = ['crossfade', 'fade', 'slide', 'zoom'];
  return transitions[(index - 1) % transitions.length];
}

function createId(prefix: string): string {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}
