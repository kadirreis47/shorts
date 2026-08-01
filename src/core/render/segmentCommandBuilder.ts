import type {
  MediaScene,
  RenderManifest,
  SubtitleCue,
} from '@/core/media';
import type { RenderPreset } from './types';

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
  const fps = manifest.render.fps;
  const width = manifest.render.width;
  const height = manifest.render.height;
  const durationSeconds = Math.max(0.1, scene.durationMs / 1000);
  const asset = scene.assetIds
    .map((assetId) =>
      manifest.assets.find((candidate) => candidate.id === assetId),
    )
    .find(Boolean);
  const localCues = sceneSubtitleCues(
    manifest.subtitles.cues,
    scene.startMs,
    scene.endMs,
  );
  const subtitleContent =
    localCues.length > 0 ? buildSrt(localCues) : undefined;

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

  const filters = [
    `scale=${width}:${height}:force_original_aspect_ratio=increase`,
    `crop=${width}:${height}`,
    `fps=${fps}`,
    'format=yuv420p',
    `trim=duration=${durationSeconds.toFixed(3)}`,
    'setpts=PTS-STARTPTS',
  ];

  if (subtitleContent) {
    filters.push(
      "subtitles={{SUBTITLE_FILE}}:force_style='Alignment=2,FontName=Arial,FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=3,Shadow=0,MarginV=90'",
    );
  }

  args.push(
    '-vf',
    filters.join(','),
    '-an',
    '-c:v',
    videoCodec(preset),
    ...qualityArgs(preset),
    '-pix_fmt',
    'yuv420p',
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

  const args: string[] = [
    '-hide_banner',
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    '{{CONCAT_FILE}}',
    '-f',
    'lavfi',
    '-t',
    durationSeconds.toFixed(3),
    '-i',
    'anullsrc=channel_layout=stereo:sample_rate=48000',
    '-map',
    '0:v:0',
    '-map',
    '1:a:0',
    '-c:v',
    'copy',
    '-c:a',
    preset.audioCodec === 'opus' ? 'libopus' : 'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    '-shortest',
    '-progress',
    'pipe:1',
    '-nostats',
    '{{OUTPUT_FILE}}',
  ];

  return {
    args,
    concatContent: segmentPaths
      .map((segmentPath) => `file '${escapeConcatPath(segmentPath)}'`)
      .join('\n'),
    totalFrames: Math.ceil(durationSeconds * manifest.render.fps),
  };
}

function sceneSubtitleCues(
  cues: SubtitleCue[],
  sceneStartMs: number,
  sceneEndMs: number,
): Array<{ startMs: number; endMs: number; text: string }> {
  return cues
    .filter((cue) => cue.startMs < sceneEndMs && cue.endMs > sceneStartMs)
    .map((cue) => ({
      startMs: Math.max(0, cue.startMs - sceneStartMs),
      endMs: Math.min(sceneEndMs, cue.endMs) - sceneStartMs,
      text: cue.text,
    }))
    .filter((cue) => cue.endMs > cue.startMs && cue.text.trim().length > 0);
}

function buildSrt(
  cues: Array<{ startMs: number; endMs: number; text: string }>,
): string {
  return cues
    .map(
      (cue, index) =>
        `${index + 1}\n${srtTime(cue.startMs)} --> ${srtTime(
          cue.endMs,
        )}\n${cue.text.trim()}\n`,
    )
    .join('\n');
}

function srtTime(ms: number): string {
  const safe = Math.max(0, Math.round(ms));
  const hours = Math.floor(safe / 3_600_000);
  const minutes = Math.floor((safe % 3_600_000) / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1_000);
  const millis = safe % 1_000;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${String(
    millis,
  ).padStart(3, '0')}`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function sceneColor(index: number): string {
  return ['0x0f172a', '0x111827', '0x1e293b', '0x172554', '0x312e81'][
    index % 5
  ];
}

function videoCodec(preset: RenderPreset): string {
  if (preset.hardwareAcceleration === 'nvenc') {
    return preset.videoCodec === 'hevc' ? 'hevc_nvenc' : 'h264_nvenc';
  }
  if (preset.videoCodec === 'hevc') return 'libx265';
  if (preset.videoCodec === 'vp9') return 'libvpx-vp9';
  return 'libx264';
}

function qualityArgs(preset: RenderPreset): string[] {
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
