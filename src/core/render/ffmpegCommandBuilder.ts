import type { RenderExecutionContext } from './types';
import { assertRequiredNarrationBound, buildAudioMixCommand } from './audioMixCommandBuilder';
import { buildCanonicalSceneExecutionPlan, canonicalSceneColor } from './canonicalSceneExecutionPlan';
import { buildCanonicalTransitionCompositionPlan } from './canonicalTransitionPlan';
import { buildCanonicalBrandingRenderPlan } from './brandingRenderBuilder';
import { canonicalQualityArgs, canonicalVideoCodec, canonicalVideoSettings } from './encodingContract';
import { buildCanonicalSubtitleRenderPlan } from './subtitleRenderBuilder';

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
    const plan = buildCanonicalSceneExecutionPlan(manifest, scene, preset);
    if (plan.input.source) {
      if (plan.input.kind === 'image') args.push('-framerate', String(fps), '-loop', '1', '-t', plan.durationSeconds, '-i', plan.input.source);
      else args.push('-stream_loop', '-1', '-t', plan.durationSeconds, '-i', plan.input.source);
    } else {
      args.push(
        '-f', 'lavfi',
        '-t', plan.durationSeconds,
        '-i', `color=c=${canonicalSceneColor(index)}:s=${width}x${height}:r=${fps}`,
      );
    }
    filters.push(`[${index}:v]${plan.filters.join(',')}[v${index}]`);
  });

  const transitionPlan = buildCanonicalTransitionCompositionPlan(manifest, scenes.map((_, index) => `v${index}`));
  filters.push(...transitionPlan.filters);
  const brandingPlan = buildCanonicalBrandingRenderPlan({
    branding: manifest.branding,
    width,
    height,
    inputLabel: transitionPlan.outputLabel,
  });
  if (brandingPlan.filter) filters.push(brandingPlan.filter);
  const subtitlePlan = buildCanonicalSubtitleRenderPlan({
    cues: manifest.subtitles.cues,
    width,
    height,
    style: manifest.subtitles.style,
    enabled: manifest.subtitles.enabled,
  });
  filters.push(subtitlePlan.assContent
    ? `[${brandingPlan.outputLabel}]subtitles=filename={{SUBTITLE_FILE_FILTER_VALUE}}[videoout]`
    : `[${brandingPlan.outputLabel}]null[videoout]`);

  const durationSeconds = Math.max(0.1, manifest.durationMs / 1000);
  const hasAudioTimeline = Boolean(manifest.audio);
  const audio = hasAudioTimeline ? buildAudioMixCommand(manifest, scenes.length) : null;
  if (hasAudioTimeline) assertRequiredNarrationBound(manifest, audio!);
  if (audio?.realInputCount) args.push(...audio.inputArgs);
  else args.push('-f', 'lavfi', '-t', durationSeconds.toFixed(3), '-i', `anullsrc=channel_layout=${(preset.audioChannels ?? 2) === 1 ? 'mono' : 'stereo'}:sample_rate=${preset.sampleRate ?? 48000}`);
  args.push(
    '-filter_complex', [...filters, ...(audio?.filterComplex ? [audio.filterComplex] : [])].join(';'),
    '-map', '[videoout]',
    '-map', audio?.realInputCount ? (audio.outputLabel ?? '[audioout]') : `${scenes.length}:a`,
    '-c:v', canonicalVideoCodec(preset),
    ...canonicalQualityArgs(preset),
    ...canonicalVideoSettings(preset),
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
    subtitleContent: subtitlePlan.assContent ?? '',
    totalFrames: Math.ceil(durationSeconds * fps),
  };
}
