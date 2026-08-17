import type {
  MediaScene,
  RenderManifest,
  SubtitleCue,
} from '@/core/media';
import type { RenderPreset } from './types';
import { assertRequiredNarrationBound, buildAudioMixCommand } from './audioMixCommandBuilder';
import { assertCanonicalHardCutTimeline, buildCanonicalSceneExecutionPlan, canonicalSceneColor } from './canonicalSceneExecutionPlan';
import { canonicalQualityArgs, canonicalVideoCodec, canonicalVideoSettings } from './encodingContract';
import { buildCanonicalSubtitleRenderPlan } from './subtitleRenderBuilder';

export interface SceneSegmentCommandPlan {
  args: string[];
  subtitleContent?: string;
  totalFrames: number;
}

export interface SegmentConcatCommandPlan {
  args: string[];
  concatContent: string;
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
  assertCanonicalHardCutTimeline(manifest);

  const args: string[] = ['-hide_banner', '-y'];

  if (execution.input.source) {
    if (execution.input.kind === 'image') {
      args.push(
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
    execution.filters.join(','),
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
  };
}

export function buildSegmentConcatCommand(input: {
  manifest: RenderManifest;
  preset: RenderPreset;
  segmentPaths: string[];
}): SegmentConcatCommandPlan {
  const { manifest, preset, segmentPaths } = input;
  assertCanonicalHardCutTimeline(manifest);
  const durationSeconds = Math.max(0.1, manifest.durationMs / 1000);
  const audio = buildAudioMixCommand(manifest, 1);
  assertRequiredNarrationBound(manifest, audio);
  const subtitlePlan = buildCanonicalSubtitleRenderPlan({
    cues: manifest.subtitles.cues,
    width: manifest.render.width,
    height: manifest.render.height,
    style: manifest.subtitles.style,
    enabled: manifest.subtitles.enabled,
  });

  const args: string[] = [
    '-hide_banner',
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    '{{CONCAT_FILE}}',
  ];

  const filters: string[] = [];
  if (subtitlePlan.assContent) filters.push('[0:v]subtitles=filename={{SUBTITLE_FILE_FILTER_VALUE}}[videoout]');

  if (audio.realInputCount > 0) {
    args.push(...audio.inputArgs);
    if (audio.filterComplex) filters.push(audio.filterComplex);
    if (filters.length > 0) args.push('-filter_complex', filters.join(';'));
    args.push('-map', subtitlePlan.assContent ? '[videoout]' : '0:v:0', '-map', audio.outputLabel ?? '[audioout]');
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
      subtitlePlan.assContent ? '[videoout]' : '0:v:0',
      '-map',
      '1:a:0',
    );
  }

  args.push(
    '-c:v',
    subtitlePlan.assContent ? canonicalVideoCodec(preset) : 'copy',
    ...(subtitlePlan.assContent ? canonicalQualityArgs(preset) : []),
    ...(subtitlePlan.assContent ? canonicalVideoSettings(preset) : []),
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
    concatContent: segmentPaths
      .map((segmentPath) => `file '${escapeConcatPath(segmentPath)}'`)
      .join('\n'),
    subtitleContent: subtitlePlan.assContent,
    totalFrames: Math.ceil(durationSeconds * (preset.frameRate ?? manifest.render.fps)),
  };
}

function escapeConcatPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/'/g, "'\\''");
}
