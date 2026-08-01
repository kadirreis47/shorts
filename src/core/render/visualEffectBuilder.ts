import type { MediaScene } from '@/core/media';

export interface SceneVisualEffectPlan {
  filters: string[];
  cameraMotionApplied: boolean;
  transitionApplied: boolean;
  effectNames: string[];
}

export function buildSceneVisualEffectPlan(input: {
  scene: MediaScene;
  width: number;
  height: number;
  fps: number;
  durationSeconds: number;
}): SceneVisualEffectPlan {
  const { scene, width, height, fps, durationSeconds } = input;
  const totalFrames = Math.max(1, Math.ceil(durationSeconds * fps));
  const filters: string[] = [];
  const effectNames: string[] = [];

  applyCameraMotion(
    scene,
    filters,
    effectNames,
    width,
    height,
    fps,
    totalFrames,
    durationSeconds,
  );

  const transitionApplied = applyTransition(
    scene,
    filters,
    effectNames,
    durationSeconds,
  );

  filters.push('format=yuv420p');

  return {
    filters,
    cameraMotionApplied: scene.cameraMotion !== 'none',
    transitionApplied,
    effectNames,
  };
}

function applyCameraMotion(
  scene: MediaScene,
  filters: string[],
  effectNames: string[],
  width: number,
  height: number,
  fps: number,
  totalFrames: number,
  durationSeconds: number,
): void {
  const baseScale =
    `scale=${width}:${height}:force_original_aspect_ratio=increase`;

  switch (scene.cameraMotion) {
    case 'zoom_in':
      filters.push(
        baseScale,
        `crop=${width}:${height}`,
        `zoompan=z='min(zoom+0.0018,1.14)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${width}x${height}:fps=${fps}`,
      );
      effectNames.push('camera:zoom-in');
      return;

    case 'zoom_out':
      filters.push(
        baseScale,
        `crop=${width}:${height}`,
        `zoompan=z='if(eq(on,1),1.14,max(1.0,zoom-0.0018))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${width}x${height}:fps=${fps}`,
      );
      effectNames.push('camera:zoom-out');
      return;

    case 'pan_left':
      filters.push(
        `scale=${Math.ceil(width * 1.14)}:${height}:force_original_aspect_ratio=increase`,
        `crop=${width}:${height}:x='max(0,(in_w-out_w)*(1-min(t/${durationSeconds.toFixed(3)},1)))':y='(in_h-out_h)/2'`,
        `fps=${fps}`,
      );
      effectNames.push('camera:pan-left');
      return;

    case 'pan_right':
      filters.push(
        `scale=${Math.ceil(width * 1.14)}:${height}:force_original_aspect_ratio=increase`,
        `crop=${width}:${height}:x='min(in_w-out_w,(in_w-out_w)*min(t/${durationSeconds.toFixed(3)},1))':y='(in_h-out_h)/2'`,
        `fps=${fps}`,
      );
      effectNames.push('camera:pan-right');
      return;

    case 'ken_burns':
      filters.push(
        baseScale,
        `crop=${width}:${height}`,
        `zoompan=z='min(zoom+0.0012,1.10)':x='(iw-iw/zoom)*on/${totalFrames}':y='(ih-ih/zoom)*(1-on/${totalFrames})':d=${totalFrames}:s=${width}x${height}:fps=${fps}`,
      );
      effectNames.push('camera:ken-burns');
      return;

    case 'none':
    default:
      filters.push(baseScale, `crop=${width}:${height}`, `fps=${fps}`);
  }
}

function applyTransition(
  scene: MediaScene,
  filters: string[],
  effectNames: string[],
  durationSeconds: number,
): boolean {
  if (scene.transition.type === 'cut' || scene.transition.durationMs <= 0) {
    return false;
  }

  const requestedSeconds = scene.transition.durationMs / 1000;
  const transitionSeconds = clamp(
    requestedSeconds,
    0.08,
    Math.max(0.08, durationSeconds / 3),
  );
  const fadeOutStart = Math.max(0, durationSeconds - transitionSeconds);

  switch (scene.transition.type) {
    case 'fade':
    case 'crossfade':
      filters.push(
        `fade=t=in:st=0:d=${transitionSeconds.toFixed(3)}`,
        `fade=t=out:st=${fadeOutStart.toFixed(3)}:d=${transitionSeconds.toFixed(3)}`,
      );
      effectNames.push(`transition:${scene.transition.type}`);
      return true;

    case 'zoom':
      filters.push(
        `fade=t=in:st=0:d=${Math.min(0.18, transitionSeconds).toFixed(3)}`,
        `fade=t=out:st=${fadeOutStart.toFixed(3)}:d=${Math.min(
          0.18,
          transitionSeconds,
        ).toFixed(3)}`,
      );
      effectNames.push('transition:zoom');
      return true;

    case 'slide':
      filters.push(
        `fade=t=in:st=0:d=${Math.min(0.12, transitionSeconds).toFixed(3)}`,
        `fade=t=out:st=${fadeOutStart.toFixed(3)}:d=${Math.min(
          0.12,
          transitionSeconds,
        ).toFixed(3)}`,
      );
      effectNames.push('transition:slide-safe');
      return true;

    case 'blur':
      filters.push(
        'gblur=sigma=0.6',
        `fade=t=in:st=0:d=${transitionSeconds.toFixed(3)}`,
        `fade=t=out:st=${fadeOutStart.toFixed(3)}:d=${transitionSeconds.toFixed(3)}`,
      );
      effectNames.push('transition:blur');
      return true;

    default:
      return false;
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
