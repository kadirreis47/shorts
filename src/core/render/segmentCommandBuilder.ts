import type {
  MediaScene,
  RenderManifest,
  SubtitleCue,
} from '@/core/media';
import type { RenderPreset } from './types';
import { buildAudioMixCommand } from './audioMixCommandBuilder';
import { buildSceneVisualEffectPlan } from './visualEffectBuilder';
import { getSceneVisualOperations } from '@/core/visual-production/visualState';
import { buildSceneSubtitleRenderPlan } from './subtitleRenderBuilder';

export interface SceneSegmentCommandPlan {
  args: string[];
  subtitleContent?: string;
  totalFrames: number;
}

export interface SegmentConcatCommandPlan {
  args: string[];
  concatContent: string;
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
  const durationSeconds = Math.max(0.1, scene.durationMs / 1000);
  const asset = scene.assetIds
    .map((assetId) =>
      manifest.assets.find((candidate) => candidate.id === assetId),
    )
    .find(Boolean);
  const subtitlePlan = buildSceneSubtitleRenderPlan({
    scene,
    cues: manifest.subtitles.cues,
    width,
    height,
    style: manifest.subtitles.style,
  });
  const subtitleContent = subtitlePlan.assContent;

  const args: string[] = ['-hide_banner', '-y'];

  if (asset?.source) {
    if (asset.type === 'image' || asset.type === 'ai_image') {
      args.push(
        '-loop',
        '1',
        '-t',
        durationSeconds.toFixed(3),
        '-i',
        asset.source,
      );
    } else {
      args.push(
        '-stream_loop',
        '-1',
        '-t',
        durationSeconds.toFixed(3),
        '-i',
        asset.source,
      );
    }
  } else {
    args.push(
      '-f',
      'lavfi',
      '-t',
      durationSeconds.toFixed(3),
      '-i',
      `color=c=${sceneColor(scene.index)}:s=${width}x${height}:r=${fps}`,
    );
  }

  const visualPlan = buildSceneVisualEffectPlan({
    scene,
    width,
    height,
    fps,
    durationSeconds,
    visualProduction: getSceneVisualOperations(manifest, scene.id),
  });
  const filters = [
    ...visualPlan.filters,
    `trim=duration=${durationSeconds.toFixed(3)}`,
    'setpts=PTS-STARTPTS',
  ];

  if (subtitleContent) {
    filters.push(
      'subtitles=filename={{SUBTITLE_FILE_FILTER_VALUE}}',
    );
  }

  args.push(
    '-vf',
    filters.join(','),
    '-an',
    '-c:v',
    videoCodec(preset),
    ...qualityArgs(preset),
    ...(preset.frameRate !== undefined ? ['-r', String(preset.frameRate)] : []),
    ...(preset.bitrateKbps !== undefined ? ['-b:v', `${preset.bitrateKbps}k`] : []),
    ...(preset.gopFrames !== undefined ? ['-g', String(preset.gopFrames)] : []),
    ...(preset.threads !== undefined ? ['-threads', String(preset.threads)] : []),
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
    subtitleContent,
    totalFrames: Math.ceil(durationSeconds * fps),
  };
}

export function buildSegmentConcatCommand(input: {
  manifest: RenderManifest;
  preset: RenderPreset;
  segmentPaths: string[];
}): SegmentConcatCommandPlan {
  const { manifest, preset, segmentPaths } = input;
  const durationSeconds = Math.max(0.1, manifest.durationMs / 1000);
  const audio = buildAudioMixCommand(manifest, 1);

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

  if (audio.realInputCount > 0) {
    args.push(...audio.inputArgs);
    if (audio.filterComplex) {
      args.push('-filter_complex', audio.filterComplex);
    }
    args.push('-map', '0:v:0', '-map', audio.outputLabel ?? '[audioout]');
  } else {
    args.push(
      '-f',
      'lavfi',
      '-t',
      durationSeconds.toFixed(3),
      '-i',
      `anullsrc=channel_layout=${(preset.audioChannels ?? 2) === 1 ? 'mono' : 'stereo'}:sample_rate=${preset.sampleRate ?? 48000}`,
      '-map',
      '0:v:0',
      '-map',
      '1:a:0',
    );
  }

  args.push(
    '-c:v',
    'copy',
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
    totalFrames: Math.ceil(durationSeconds * (preset.frameRate ?? manifest.render.fps)),
  };
}

function sceneColor(index: number): string {
  return ['0x0f172a', '0x111827', '0x1e293b', '0x172554', '0x312e81'][
    index % 5
  ];
}

function videoCodec(preset: RenderPreset): string {
  if (preset.encoder) return preset.encoder;
  if (preset.hardwareAcceleration === 'nvenc') {
    return preset.videoCodec === 'hevc' ? 'hevc_nvenc' : 'h264_nvenc';
  }
  if (preset.videoCodec === 'hevc') return 'libx265';
  if (preset.videoCodec === 'vp9') return 'libvpx-vp9';
  return 'libx264';
}

function qualityArgs(preset: RenderPreset): string[] {
  if (preset.encoderPreset || preset.crf !== undefined) {
    return [
      ...(preset.encoderPreset ? ['-preset', preset.encoderPreset] : []),
      ...(preset.crf !== undefined ? ['-crf', String(preset.crf)] : []),
    ];
  }
  if (preset.bitrateKbps !== undefined) return preset.encoderMode === 'hardware' ? [] : ['-preset', preset.quality === 'draft' ? 'veryfast' : preset.quality === 'high' ? 'slow' : 'medium'];
  if (preset.hardwareAcceleration === 'nvenc') {
    return [
      '-preset',
      preset.quality === 'draft'
        ? 'p1'
        : preset.quality === 'high'
          ? 'p6'
          : 'p4',
      '-cq',
      preset.quality === 'high' ? '18' : '23',
    ];
  }

  const crf =
    preset.quality === 'draft'
      ? '30'
      : preset.quality === 'high'
        ? '18'
        : '23';
  const speed =
    preset.quality === 'draft'
      ? 'veryfast'
      : preset.quality === 'high'
        ? 'slow'
        : 'medium';

  return ['-preset', speed, '-crf', crf];
}

function escapeConcatPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/'/g, "'\\''");
}
