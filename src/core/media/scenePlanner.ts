import type { Scene } from '@/lib/types';
import { estimateSceneDurationMs } from './durationPlanner';
import type {
  CameraMotion,
  MediaProjectSettings,
  MediaScene,
  SceneRole,
  TransitionType,
} from './types';

export function planScenes(scenes: Scene[], settings: MediaProjectSettings): MediaScene[] {
  const usableScenes = scenes.filter((scene) => scene.text.trim().length > 0);
  return usableScenes.map((scene, index) => {
    const durationMs = estimateSceneDurationMs(scene.text, scene.duration, settings);
    const role = selectRole(index, usableScenes.length, scene.text);
    const intensity = calculateIntensity(scene.text, scene.emphasis === true, role);
    return {
      id: createId('scene'),
      index,
      role,
      text: scene.text.trim(),
      visualPrompt: scene.imagePrompt?.trim() || scene.visual?.trim() || scene.text.trim(),
      keywords: scene.keywords?.filter(Boolean) ?? [],
      startMs: 0,
      endMs: durationMs,
      durationMs,
      overlapBeforeMs: 0,
      overlapAfterMs: 0,
      assetIds: [],
      cameraMotion: selectCameraMotion(index, intensity),
      transition: {
        type: selectTransition(index, role, intensity),
        durationMs: index === 0 ? 0 : Math.round(settings.defaultTransitionMs * transitionMultiplier(role, intensity)),
      },
      subtitleText: scene.overlayText?.trim() || scene.text.trim(),
      intensity,
      sourceScene: scene,
    } satisfies MediaScene;
  });
}

function selectRole(index: number, count: number, text: string): SceneRole {
  if (index === 0) return 'hook';
  if (index === count - 1) return /abone|takip|yorum|like|beğen|izle/i.test(text) ? 'cta' : 'outro';
  const progress = index / Math.max(1, count - 1);
  if (progress < 0.3) return 'setup';
  if (progress < 0.78) return 'development';
  return 'payoff';
}

function calculateIntensity(text: string, emphasis: boolean, role: SceneRole): number {
  let score = emphasis ? 0.82 : 0.42;
  if (role === 'hook' || role === 'payoff') score += 0.16;
  if (/[!?]{2,}|\b(şok|inanılmaz|asla|sır|gerçek|dikkat)\b/i.test(text)) score += 0.14;
  if (text.length < 70) score += 0.06;
  return Math.min(1, Math.max(0, score));
}

function selectCameraMotion(index: number, intensity: number): CameraMotion {
  if (intensity >= 0.8) return 'zoom_in';
  const motions: CameraMotion[] = ['ken_burns', 'pan_right', 'zoom_in', 'pan_left', 'zoom_out'];
  return motions[index % motions.length];
}

function selectTransition(index: number, role: SceneRole, intensity: number): TransitionType {
  if (index === 0) return 'cut';
  if (intensity >= 0.85) return 'zoom';
  if (role === 'payoff') return 'blur';
  const transitions: TransitionType[] = ['crossfade', 'fade', 'slide', 'zoom'];
  return transitions[(index - 1) % transitions.length];
}

function transitionMultiplier(role: SceneRole, intensity: number): number {
  if (role === 'hook') return 0;
  if (intensity >= 0.85) return 0.75;
  if (role === 'outro' || role === 'cta') return 1.15;
  return 1;
}

function createId(prefix: string): string {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}
