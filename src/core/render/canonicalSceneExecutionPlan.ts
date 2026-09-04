import type { MediaAsset, MediaScene, RenderManifest } from '@/core/media';
import type { RenderPreset } from './types';
import { imageOrientationFilters } from '@/core/media/imageDisplayGeometry';

export const CANONICAL_SCENE_EXECUTION_VERSION = 4;
const IMAGE_MOTION_OVERSCAN = 1.15;
const IMAGE_MOTION_DELTA = 0.15;
const KEN_BURNS_ZOOM_DELTA = 0.12;

/**
 * Shared execution semantics for a scene. This deliberately represents the
 * currently supported canonical baseline: hard cuts and bounded, explicit
 * still-image camera motion. Visual-production operations remain unsupported.
 */
export interface CanonicalSceneExecutionPlan {
  readonly sceneId: string;
  readonly input: {
    readonly source: string | null;
    readonly kind: 'image' | 'video' | 'color';
  };
  readonly durationMs: number;
  readonly durationSeconds: string;
  readonly filters: readonly string[];
  readonly imageGeometryAuthority: MediaScene['imageGeometryAuthority'];
}

export function buildCanonicalSceneExecutionPlan(
  manifest: RenderManifest,
  scene: MediaScene,
  preset: RenderPreset,
): CanonicalSceneExecutionPlan {
  const asset = scene.assetIds
    .map((assetId) => manifest.assets.find((candidate) => candidate.id === assetId))
    .find((candidate): candidate is MediaAsset => Boolean(candidate));
  const durationMs = Math.round(scene.durationMs);
  const fps = preset.frameRate ?? manifest.render.fps;
  const width = manifest.render.width;
  const height = manifest.render.height;
  const kind = asset?.source
    ? (asset.type === 'image' || asset.type === 'ai_image' ? 'image' : 'video')
    : 'color';

  const imageGeometryAuthority = kind === 'image' ? scene.imageGeometryAuthority : undefined;
  return {
    sceneId: scene.id,
    input: { source: asset?.source || null, kind },
    durationMs,
    durationSeconds: (durationMs / 1000).toFixed(3),
    filters: canonicalSceneFilters({ scene, kind, width, height, fps, durationMs, pixelFormat: preset.pixelFormat ?? 'yuv420p' }),
    imageGeometryAuthority,
  };
}

/** FFmpeg receives a non-semantic placeholder; Electron main alone expands it. */
export function commandFiltersForCanonicalScene(
  plan: CanonicalSceneExecutionPlan,
  inputIndex: number,
): readonly string[] {
  if (!plan.imageGeometryAuthority) return plan.filters;
  const orientationFilterCount = imageOrientationFilters(plan.imageGeometryAuthority.expectedOrientation).length;
  return [
    `{{IMAGE_DISPLAY_GEOMETRY_INPUT_${inputIndex}}}`,
    ...plan.filters.slice(orientationFilterCount),
  ];
}

function canonicalSceneFilters(input: {
  scene: MediaScene;
  kind: CanonicalSceneExecutionPlan['input']['kind'];
  width: number;
  height: number;
  fps: number;
  durationMs: number;
  pixelFormat: string;
}): string[] {
  const { scene, kind, width, height, fps, durationMs, pixelFormat } = input;
  const durationSeconds = (durationMs / 1000).toFixed(3);
  const orientation = kind === 'image' && scene.imageGeometryAuthority
    ? imageOrientationFilters(scene.imageGeometryAuthority.expectedOrientation)
    : [];
  const motion = kind === 'image' ? imageMotionFilter(scene.cameraMotion, width, height, fps, durationMs) : null;
  if (motion) {
    return [
      ...orientation,
      `scale=${motion.sourceWidth}:${motion.sourceHeight}:force_original_aspect_ratio=increase`,
      `crop=${motion.sourceWidth}:${motion.sourceHeight}`,
      motion.filter,
      `format=${pixelFormat}`,
      `trim=duration=${durationSeconds}`,
      'setpts=PTS-STARTPTS',
    ];
  }
  return [
    ...orientation,
    `scale=${width}:${height}:force_original_aspect_ratio=increase`,
    `crop=${width}:${height}`,
    `fps=${fps}`,
    `format=${pixelFormat}`,
    `trim=duration=${durationSeconds}`,
    'setpts=PTS-STARTPTS',
  ];
}

/**
 * FFmpeg zoompan receives a stable, overscanned still frame and derives every
 * output frame from its ordinal. Videos intentionally remain static in V1.1:
 * applying image-loop zoompan assumptions to their timestamps would be a
 * separate, unsupported production feature.
 */
function imageMotionFilter(
  motion: MediaScene['cameraMotion'],
  width: number,
  height: number,
  fps: number,
  durationMs: number,
): { sourceWidth: number; sourceHeight: number; filter: string } | null {
  if (motion === 'none') return null;
  const sourceWidth = even(Math.ceil(width * IMAGE_MOTION_OVERSCAN));
  const sourceHeight = even(Math.ceil(height * IMAGE_MOTION_OVERSCAN));
  // `-t` with an image input can emit the partial final frame. Ceil keeps the
  // final zoom/pan position within the overscan bounds for fractional scenes.
  const frameCount = Math.max(1, Math.ceil(durationMs * fps / 1000));
  const denominator = Math.max(1, frameCount - 1);
  const centeredX = 'iw/2-iw/zoom/2';
  const centeredY = 'ih/2-ih/zoom/2';
  let zoom: string;
  let x = centeredX;
  const y = centeredY;
  switch (motion) {
    case 'ken_burns':
      zoom = `1+${KEN_BURNS_ZOOM_DELTA}*on/${denominator}`;
      // A bounded centre-biased drift makes Ken Burns distinct from Zoom In
      // without adding user-configurable keyframes or any random state.
      x = `(iw-iw/zoom)*(0.35+0.3*on/${denominator})`;
      break;
    case 'zoom_in':
      zoom = `1+${IMAGE_MOTION_DELTA}*on/${denominator}`;
      break;
    case 'zoom_out':
      zoom = `${IMAGE_MOTION_OVERSCAN}-${IMAGE_MOTION_DELTA}*on/${denominator}`;
      break;
    case 'pan_left':
      zoom = String(IMAGE_MOTION_OVERSCAN);
      x = `(iw-iw/zoom)*(1-on/${denominator})`;
      break;
    case 'pan_right':
      zoom = String(IMAGE_MOTION_OVERSCAN);
      x = `(iw-iw/zoom)*on/${denominator}`;
      break;
    default:
      return null;
  }
  return {
    sourceWidth,
    sourceHeight,
    filter: `zoompan=z='${zoom}':x='${x}':y='${y}':d=1:s=${width}x${height}:fps=${fps}`,
  };
}

function even(value: number): number { return value % 2 === 0 ? value : value + 1; }

export function canonicalSceneColor(index: number): string {
  return ['0x0f172a', '0x111827', '0x1e293b', '0x172554', '0x312e81'][index % 5];
}
