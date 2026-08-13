import type { RenderExecutionContext } from './types';

export interface FFmpegCommandPlan {
  args: string[];
  subtitleContent: string;
  totalFrames: number;
}

export function buildFFmpegCommand(
  context: Pick<RenderExecutionContext, 'manifest' | 'preset'>,
): FFmpegCommandPlan {
  const { manifest, preset } = context;
  const fps = preset.frameRate ?? manifest.render.fps;
  const width = manifest.render.width;
  const height = manifest.render.height;
  const scenes = manifest.timeline.scenes;
  const args: string[] = ['-hide_banner', '-y'];
  const filters: string[] = [];

  scenes.forEach((scene, index) => {
    const durationSeconds = Math.max(0.1, scene.durationMs / 1000);
    const asset = scene.assetIds
      .map((assetId) => manifest.assets.find((item) => item.id === assetId))
      .find(Boolean);

    if (asset?.source) {
      if (asset.type === 'image' || asset.type === 'ai_image') {
        args.push('-loop', '1', '-t', durationSeconds.toFixed(3), '-i', asset.source);
      } else {
        args.push('-stream_loop', '-1', '-t', durationSeconds.toFixed(3), '-i', asset.source);
      }
    } else {
      args.push(
        '-f', 'lavfi',
        '-t', durationSeconds.toFixed(3),
        '-i', `color=c=${sceneColor(index)}:s=${width}x${height}:r=${fps}`,
      );
    }

    filters.push(
      `[${index}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,` +
      `crop=${width}:${height},fps=${fps},format=${preset.pixelFormat ?? 'yuv420p'},` +
      `trim=duration=${durationSeconds.toFixed(3)},setpts=PTS-STARTPTS[v${index}]`,
    );
  });

  const concatInputs = scenes.map((_, index) => `[v${index}]`).join('');
  filters.push(`${concatInputs}concat=n=${scenes.length}:v=1:a=0[basevideo]`);
  filters.push(
    `[basevideo]subtitles=filename={{SUBTITLE_FILE_FILTER_VALUE}}:force_style='Alignment=2,FontName=Arial,` +
    `FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,` +
    `BorderStyle=1,Outline=3,Shadow=0,MarginV=90'[videoout]`,
  );

  const durationSeconds = Math.max(0.1, manifest.durationMs / 1000);
  args.push(
    '-f', 'lavfi',
    '-t', durationSeconds.toFixed(3),
    '-i', `anullsrc=channel_layout=${(preset.audioChannels ?? 2) === 1 ? 'mono' : 'stereo'}:sample_rate=${preset.sampleRate ?? 48000}`,
    '-filter_complex', filters.join(';'),
    '-map', '[videoout]',
    '-map', `${scenes.length}:a`,
    '-c:v', videoCodec(preset),
    ...qualityArgs(preset),
    ...videoSettings(preset),
    '-c:a', preset.audioCodec === 'opus' ? 'libopus' : 'aac',
    '-b:a', `${preset.audioBitrateKbps ?? 192}k`,
    '-ar', String(preset.sampleRate ?? 48000),
    '-ac', String(preset.audioChannels ?? 2),
    '-pix_fmt', preset.pixelFormat ?? 'yuv420p',
    '-movflags', '+faststart',
    '-shortest',
    '-progress', 'pipe:1',
    '-nostats',
    '{{OUTPUT_FILE}}',
  );

  return {
    args,
    subtitleContent: buildSrt(manifest.subtitles.cues),
    totalFrames: Math.ceil(durationSeconds * fps),
  };
}

function buildSrt(cues: Array<{ startMs: number; endMs: number; text: string }>): string {
  return cues.map((cue, index) =>
    `${index + 1}\n${srtTime(cue.startMs)} --> ${srtTime(cue.endMs)}\n${cue.text.trim()}\n`,
  ).join('\n');
}

function srtTime(ms: number): string {
  const safe = Math.max(0, Math.round(ms));
  const hours = Math.floor(safe / 3_600_000);
  const minutes = Math.floor((safe % 3_600_000) / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1_000);
  const millis = safe % 1_000;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${String(millis).padStart(3, '0')}`;
}

function pad(value: number): string { return String(value).padStart(2, '0'); }
function sceneColor(index: number): string {
  return ['0x0f172a','0x111827','0x1e293b','0x172554','0x312e81'][index % 5];
}
function videoCodec(preset: RenderExecutionContext['preset']): string {
  if (preset.encoder) return preset.encoder;
  if (preset.hardwareAcceleration === 'nvenc') return preset.videoCodec === 'hevc' ? 'hevc_nvenc' : 'h264_nvenc';
  if (preset.videoCodec === 'hevc') return 'libx265';
  if (preset.videoCodec === 'vp9') return 'libvpx-vp9';
  if (preset.videoCodec === 'av1') return 'libaom-av1';
  return 'libx264';
}
function qualityArgs(preset: RenderExecutionContext['preset']): string[] {
  if (preset.encoderPreset || preset.crf !== undefined) {
    return [
      ...(preset.encoderPreset ? ['-preset', preset.encoderPreset] : []),
      ...(preset.crf !== undefined ? ['-crf', String(preset.crf)] : []),
    ];
  }
  if (preset.bitrateKbps !== undefined) {
    if (preset.encoderMode === 'hardware') return [];
    const speed = preset.quality === 'draft' ? 'veryfast' : preset.quality === 'high' ? 'slow' : 'medium';
    return ['-preset', speed];
  }
  if (preset.hardwareAcceleration === 'nvenc') {
    return ['-preset', preset.quality === 'draft' ? 'p1' : preset.quality === 'high' ? 'p6' : 'p4', '-cq', preset.quality === 'high' ? '18' : '23'];
  }
  const crf = preset.quality === 'draft' ? '30' : preset.quality === 'high' ? '18' : '23';
  const speed = preset.quality === 'draft' ? 'veryfast' : preset.quality === 'high' ? 'slow' : 'medium';
  return ['-preset', speed, '-crf', crf];
}

function videoSettings(preset: RenderExecutionContext['preset']): string[] {
  return [
    ...(preset.bitrateKbps !== undefined ? ['-b:v', `${preset.bitrateKbps}k`] : []),
    ...(preset.maxBitrateKbps !== undefined ? ['-maxrate', `${preset.maxBitrateKbps}k`] : []),
    ...(preset.bufferSizeKbps !== undefined ? ['-bufsize', `${preset.bufferSizeKbps}k`] : []),
    ...(preset.frameRate !== undefined ? ['-r', String(preset.frameRate)] : []),
    ...(preset.gopFrames !== undefined ? ['-g', String(preset.gopFrames)] : []),
    ...(preset.keyframeInterval !== undefined ? ['-keyint_min', String(preset.keyframeInterval)] : []),
    ...(preset.threads !== undefined ? ['-threads', String(preset.threads)] : []),
    ...(preset.colorSpace ? ['-colorspace', preset.colorSpace] : []),
    ...(preset.profile ? ['-profile:v', preset.profile] : []),
  ];
}
