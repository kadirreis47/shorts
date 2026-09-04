import type { MediaAsset, MediaScene, RenderManifest } from '@/core/media';
import { normalizeCanonicalBrandingConfiguration } from '@/core/media/brandingTypes';
import { buildCanonicalSceneExecutionPlan } from './canonicalSceneExecutionPlan';
import { buildCanonicalSubtitleRenderPlan } from './subtitleRenderBuilder';
import type { FFmpegImageGeometryAuthorityDeclaration } from './ffmpegTypes';
import type { RenderPreset } from './types';
import type { ImageFramingBindingV1, ImageFramingV1 } from '@/core/media/imageFraming';

export interface CanonicalNativeEncodingIntent {
  readonly videoCodec: RenderPreset['videoCodec'];
  readonly audioCodec: RenderPreset['audioCodec'];
  readonly quality: RenderPreset['quality'];
  readonly hardwareAcceleration: RenderPreset['hardwareAcceleration'];
  readonly encoder: string | null;
  readonly encoderMode: RenderPreset['encoderMode'] | null;
  readonly bitrateKbps: number | null;
  readonly maxBitrateKbps: number | null;
  readonly bufferSizeKbps: number | null;
  readonly crf: number | null;
  readonly encoderPreset: string | null;
  readonly frameRate: number;
  readonly pixelFormat: 'yuv420p' | 'yuv444p';
  readonly gopFrames: number | null;
  readonly keyframeInterval: number | null;
  readonly threads: number | null;
  readonly audioBitrateKbps: number;
  readonly sampleRate: number;
  readonly audioChannels: number;
  readonly colorSpace: string | null;
  readonly profile: string | null;
}

export interface CanonicalNativeSceneIntent {
  readonly durationMs: number;
  readonly cameraMotion: MediaScene['cameraMotion'];
  readonly source: Readonly<
    | { kind: 'color'; paletteIndex: number }
    | { kind: 'private-image'; url: string; geometry: Omit<FFmpegImageGeometryAuthorityDeclaration, 'framingBinding'>; framing?: ImageFramingV1; framingBinding?: ImageFramingBindingV1 }
    | { kind: 'external-video'; url: string }
  >;
}

export interface CanonicalNativeAudioTrackIntent {
  readonly kind: 'voice' | 'music' | 'sfx';
  readonly url: string;
  readonly startMs: number;
  readonly durationMs: number;
  readonly fadeInMs: number;
  readonly fadeOutMs: number;
  readonly gain: number;
}

export interface CanonicalNativeRenderIntent {
  readonly version: 3;
  readonly kind: 'full' | 'segment' | 'concat-segments';
  readonly width: number;
  readonly height: number;
  readonly durationMs: number;
  readonly scenes: readonly CanonicalNativeSceneIntent[];
  readonly sceneDurationsMs: readonly number[];
  readonly transitions: readonly { type: 'cut' | 'crossfade'; overlapMs: number }[];
  readonly segmentReferences: readonly string[];
  readonly branding: Readonly<{ text: string; position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' }> | null;
  readonly subtitleContent: string;
  readonly audioTracks: readonly CanonicalNativeAudioTrackIntent[];
  readonly audioSettings: Readonly<{ masterGain: number; targetLufs: number; duckingAttackMs: number; duckingReleaseMs: number }>;
  readonly encoding: CanonicalNativeEncodingIntent;
}

export function buildFullNativeRenderIntent(manifest: RenderManifest, preset: RenderPreset): CanonicalNativeRenderIntent {
  return buildIntent('full', manifest, preset, manifest.timeline.scenes);
}

export function buildSegmentNativeRenderIntent(manifest: RenderManifest, preset: RenderPreset, scene: MediaScene): CanonicalNativeRenderIntent {
  return buildIntent('segment', manifest, preset, [scene]);
}

export function buildConcatNativeRenderIntent(
  manifest: RenderManifest,
  preset: RenderPreset,
  segmentReferences: readonly string[],
): CanonicalNativeRenderIntent {
  return { ...buildIntent('concat-segments', manifest, preset, []), segmentReferences: [...segmentReferences] };
}

function buildIntent(
  kind: CanonicalNativeRenderIntent['kind'],
  manifest: RenderManifest,
  preset: RenderPreset,
  scenes: readonly MediaScene[],
): CanonicalNativeRenderIntent {
  const subtitle = buildCanonicalSubtitleRenderPlan({
    cues: manifest.subtitles.cues,
    width: manifest.render.width,
    height: manifest.render.height,
    style: manifest.subtitles.style,
    enabled: manifest.subtitles.enabled,
    words: manifest.subtitles.words,
    source: manifest.subtitles.source,
  });
  const watermark = normalizeCanonicalBrandingConfiguration(manifest.branding).watermark;
  return {
    version: 3,
    kind,
    width: manifest.render.width,
    height: manifest.render.height,
    durationMs: kind === 'segment' ? scenes[0].durationMs : manifest.durationMs,
    scenes: scenes.map((scene) => sceneIntent(manifest, preset, scene)),
    sceneDurationsMs: kind === 'segment' ? [scenes[0].durationMs] : manifest.timeline.scenes.map((scene) => scene.durationMs),
    transitions: kind === 'segment' ? [{ type: 'cut', overlapMs: 0 }] : manifest.timeline.scenes.map((scene) => ({
      type: scene.transition?.type === 'crossfade' ? 'crossfade' : 'cut',
      overlapMs: scene.overlapBeforeMs,
    })),
    segmentReferences: [],
    branding: kind === 'segment' || !watermark ? null : { text: watermark.text, position: watermark.position },
    subtitleContent: kind === 'segment' ? '' : subtitle.assContent ?? '',
    audioTracks: kind === 'segment' ? [] : audioTracks(manifest),
    audioSettings: {
      masterGain: manifest.audio.settings.masterGain,
      targetLufs: manifest.audio.settings.targetLufs,
      duckingAttackMs: manifest.audio.settings.duckingAttackMs,
      duckingReleaseMs: manifest.audio.settings.duckingReleaseMs,
    },
    encoding: encodingIntent(manifest, preset),
  };
}

function sceneIntent(manifest: RenderManifest, preset: RenderPreset, scene: MediaScene): CanonicalNativeSceneIntent {
  const execution = buildCanonicalSceneExecutionPlan(manifest, scene, preset);
  if (execution.input.kind === 'color' || !execution.input.source) {
    return { durationMs: execution.durationMs, cameraMotion: 'none', source: { kind: 'color', paletteIndex: scene.index } };
  }
  if (execution.input.kind === 'image') {
    if (!execution.imageGeometryAuthority) throw new Error('Canonical private image authority is required for native rendering.');
    return {
      durationMs: execution.durationMs,
      cameraMotion: scene.cameraMotion,
      source: {
        kind: 'private-image',
        url: execution.input.source,
        geometry: { inputIndex: 0, ...execution.imageGeometryAuthority },
        ...(execution.imageFraming ? {
          framing: execution.imageFraming,
          framingBinding: execution.imageFramingBinding!,
        } : {}),
      },
    };
  }
  return { durationMs: execution.durationMs, cameraMotion: 'none', source: { kind: 'external-video', url: execution.input.source } };
}

function audioTracks(manifest: RenderManifest): CanonicalNativeAudioTrackIntent[] {
  const tracks: CanonicalNativeAudioTrackIntent[] = [];
  for (const kind of ['voice', 'music', 'sfx'] as const) {
    for (const segment of manifest.audio[kind]) {
      if (!segment.assetId) continue;
      const asset = manifest.assets.find((candidate: MediaAsset) => candidate.id === segment.assetId && candidate.source.trim());
      if (!asset) continue;
      tracks.push({ kind, url: asset.source, startMs: segment.startMs, durationMs: segment.durationMs, fadeInMs: segment.fadeInMs, fadeOutMs: segment.fadeOutMs, gain: segment.gain });
    }
  }
  return tracks;
}

function encodingIntent(manifest: RenderManifest, preset: RenderPreset): CanonicalNativeEncodingIntent {
  return {
    videoCodec: preset.videoCodec,
    audioCodec: preset.audioCodec,
    quality: preset.quality,
    hardwareAcceleration: preset.hardwareAcceleration,
    encoder: preset.encoder ?? null,
    encoderMode: preset.encoderMode ?? null,
    bitrateKbps: preset.bitrateKbps ?? null,
    maxBitrateKbps: preset.maxBitrateKbps ?? null,
    bufferSizeKbps: preset.bufferSizeKbps ?? null,
    crf: preset.crf ?? null,
    encoderPreset: preset.encoderPreset ?? null,
    frameRate: preset.frameRate ?? manifest.render.fps,
    pixelFormat: preset.pixelFormat ?? 'yuv420p',
    gopFrames: preset.gopFrames ?? null,
    keyframeInterval: preset.keyframeInterval ?? null,
    threads: preset.threads ?? null,
    audioBitrateKbps: preset.audioBitrateKbps ?? 192,
    sampleRate: preset.sampleRate ?? 48_000,
    audioChannels: preset.audioChannels ?? 2,
    colorSpace: preset.colorSpace ?? null,
    profile: preset.profile ?? null,
  };
}
