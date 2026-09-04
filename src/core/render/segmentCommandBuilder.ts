import type {
  MediaScene,
  RenderManifest,
  SubtitleCue,
} from '@/core/media';
import type { RenderPreset } from './types';
import { assertRequiredNarrationBound, buildAudioMixCommand } from './audioMixCommandBuilder';
import { buildCanonicalSceneExecutionPlan, canonicalSceneColor, commandFiltersForCanonicalScene } from './canonicalSceneExecutionPlan';
import type { FFmpegImageGeometryAuthorityDeclaration } from './ffmpegTypes';
import { assertCanonicalTransitionTimeline, buildCanonicalTransitionCompositionPlan } from './canonicalTransitionPlan';
import { buildCanonicalBrandingRenderPlan } from './brandingRenderBuilder';
import { canonicalQualityArgs, canonicalVideoCodec, canonicalVideoSettings } from './encodingContract';
import { buildCanonicalSubtitleRenderPlan } from './subtitleRenderBuilder';

export interface SceneSegmentCommandPlan {
  args: string[];
  subtitleContent?: string;
  totalFrames: number;
  imageGeometryAuthorities: FFmpegImageGeometryAuthorityDeclaration[];
}

export interface SegmentConcatCommandPlan {
  args: string[];
  usesConcatManifest: boolean;
  subtitleContent?: string;
  totalFrames: number;
}

export function buildSceneSegmentCommand(input: {
  manifest: RenderManifest;
  scene: MediaScene;
  preset: RenderPreset;
  outputPath: string;
}): SceneSegmentCommandPlan {
  const { manifest, scene, preset, outputPath } = input;
  const fps = preset.frameRate ?? manifest.render.fps;
  const width = manifest.render.width;
  const height = manifest.render.height;
  const execution = buildCanonicalSceneExecutionPlan(manifest, scene, preset);
  assertCanonicalTransitionTimeline(manifest);

  const args: string[] = ['-hide_banner', '-y'];

  if (execution.input.source) {
    if (execution.input.kind === 'image') {
      args.push(
        ...(execution.imageGeometryAuthority ? ['-noautorotate'] : []),
        '-framerate',
        String(fps),
        '-loop',
        '1',
        '-t',
        execution.durationSeconds,
        '-i',
        execution.input.source,
      );
    } else {
      args.push(
        '-stream_loop',
        '-1',
        '-t',
        execution.durationSeconds,
        '-i',
        execution.input.source,
      );
    }
  } else {
    args.push(
      '-f',
      'lavfi',
      '-t',
      execution.durationSeconds,
      '-i',
      `color=c=${canonicalSceneColor(scene.index)}:s=${width}x${height}:r=${fps}`,
    );
  }

  args.push(
    '-vf',
    commandFiltersForCanonicalScene(execution, 0).join(','),
    '-an',
    '-c:v',
    canonicalVideoCodec(preset),
    ...canonicalQualityArgs(preset),
    ...canonicalVideoSettings(preset),
    '-pix_fmt',
    preset.pixelFormat ?? 'yuv420p',
    '-movflags',
    '+faststart',
    '-progress',
    'pipe:1',
    '-nostats',
    outputPath,
  );

  return {
    args,
    totalFrames: Math.ceil((execution.durationMs / 1000) * fps),
    imageGeometryAuthorities: execution.imageGeometryAuthority
      ? [{ inputIndex: 0, ...execution.imageGeometryAuthority }]
      : [],
  };
}

export function buildSegmentConcatCommand(input: {
  manifest: RenderManifest;
  preset: RenderPreset;
  segmentPaths: string[];
}): SegmentConcatCommandPlan {
  const { manifest, preset, segmentPaths } = input;
  assertCanonicalTransitionTimeline(manifest);
  const durationSeconds = Math.max(0.1, manifest.durationMs / 1000);
  const subtitlePlan = buildCanonicalSubtitleRenderPlan({
    cues: manifest.subtitles.cues,
    width: manifest.render.width,
    height: manifest.render.height,
    style: manifest.subtitles.style,
    enabled: manifest.subtitles.enabled,
    words: manifest.subtitles.words,
    source: manifest.subtitles.source,
  });

  const needsFinalVisualComposition = manifest.timeline.scenes.length > 1 && manifest.timeline.scenes.some((scene) =>
    scene.overlapBeforeMs > 0 || scene.transition?.type === 'crossfade',
  );
  // Real incremental execution supplies one verified segment per scene. Keep
  // the existing concat-plan contract usable for legacy/unit callers that
  // intentionally supply a partial list solely to inspect subtitle output.
  // A partial list cannot execute a canonical crossfade, so it must not enter
  // the direct-input composition path.
  const canComposeTransitions = needsFinalVisualComposition && segmentPaths.length === manifest.timeline.scenes.length;
  const transitionPlan = canComposeTransitions
    ? buildCanonicalTransitionCompositionPlan(manifest, segmentPaths.map((_, index) => `${index}:v`))
    : null;
  const brandingPlan = buildCanonicalBrandingRenderPlan({
    branding: manifest.branding,
    width: manifest.render.width,
    height: manifest.render.height,
    inputLabel: transitionPlan?.outputLabel ?? '0:v',
  });
  const videoInputCount = canComposeTransitions ? segmentPaths.length : 1;
  const audio = buildAudioMixCommand(manifest, videoInputCount);
  assertRequiredNarrationBound(manifest, audio);
  const args: string[] = ['-hide_banner', '-y'];
  if (canComposeTransitions) {
    for (const segmentPath of segmentPaths) args.push('-i', segmentPath);
  } else {
    args.push('-f', 'concat', '-safe', '0', '-i', '{{CONCAT_FILE}}');
  }

  const filters: string[] = [];
  if (transitionPlan) filters.push(...transitionPlan.filters);
  if (brandingPlan.filter) filters.push(brandingPlan.filter);
  const visualLabel = brandingPlan.outputLabel;
  if (subtitlePlan.assContent) filters.push(`[${visualLabel}]subtitles=filename={{SUBTITLE_FILE_FILTER_VALUE}}[videoout]`);
  else if (transitionPlan || brandingPlan.filter) filters.push(`[${visualLabel}]null[videoout]`);

  if (audio.realInputCount > 0) {
    args.push(...audio.inputArgs);
    if (audio.filterComplex) filters.push(audio.filterComplex);
    if (filters.length > 0) args.push('-filter_complex', filters.join(';'));
    args.push('-map', subtitlePlan.assContent || transitionPlan || brandingPlan.filter ? '[videoout]' : '0:v:0', '-map', audio.outputLabel ?? '[audioout]');
  } else {
    args.push(
      '-f',
      'lavfi',
      '-t',
      durationSeconds.toFixed(3),
      '-i',
      `anullsrc=channel_layout=${(preset.audioChannels ?? 2) === 1 ? 'mono' : 'stereo'}:sample_rate=${preset.sampleRate ?? 48000}`,
      ...(filters.length > 0 ? ['-filter_complex', filters.join(';')] : []),
      '-map',
      subtitlePlan.assContent || transitionPlan || brandingPlan.filter ? '[videoout]' : '0:v:0',
      '-map',
      '1:a:0',
    );
  }

  args.push(
    '-c:v',
    subtitlePlan.assContent || transitionPlan || brandingPlan.filter ? canonicalVideoCodec(preset) : 'copy',
    ...(subtitlePlan.assContent || transitionPlan || brandingPlan.filter ? canonicalQualityArgs(preset) : []),
    ...(subtitlePlan.assContent || transitionPlan || brandingPlan.filter ? canonicalVideoSettings(preset) : []),
    '-c:a',
    preset.audioCodec === 'opus' ? 'libopus' : 'aac',
    '-b:a',
    `${preset.audioBitrateKbps ?? 192}k`,
    '-ar',
    String(preset.sampleRate ?? 48000),
    '-ac',
    String(preset.audioChannels ?? 2),
    '-movflags',
    '+faststart',
    '-shortest',
    '-progress',
    'pipe:1',
    '-nostats',
    '{{OUTPUT_FILE}}',
  );

  return {
    args,
    usesConcatManifest: !canComposeTransitions,
    subtitleContent: subtitlePlan.assContent,
    totalFrames: Math.ceil(durationSeconds * (preset.frameRate ?? manifest.render.fps)),
  };
}
