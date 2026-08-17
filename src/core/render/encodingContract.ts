import type { RenderPreset } from './types';

export function canonicalVideoCodec(preset: RenderPreset): string {
  if (preset.encoder) return preset.encoder;
  if (preset.hardwareAcceleration === 'nvenc') return preset.videoCodec === 'hevc' ? 'hevc_nvenc' : 'h264_nvenc';
  if (preset.videoCodec === 'hevc') return 'libx265';
  if (preset.videoCodec === 'vp9') return 'libvpx-vp9';
  if (preset.videoCodec === 'av1') return 'libaom-av1';
  return 'libx264';
}

export function canonicalQualityArgs(preset: RenderPreset): string[] {
  if (preset.encoderPreset || preset.crf !== undefined) return [
    ...(preset.encoderPreset ? ['-preset', preset.encoderPreset] : []),
    ...(preset.crf !== undefined ? ['-crf', String(preset.crf)] : []),
  ];
  if (preset.bitrateKbps !== undefined) {
    if (preset.encoderMode === 'hardware') return [];
    return ['-preset', preset.quality === 'draft' ? 'veryfast' : preset.quality === 'high' ? 'slow' : 'medium'];
  }
  if (preset.hardwareAcceleration === 'nvenc') return ['-preset', preset.quality === 'draft' ? 'p1' : preset.quality === 'high' ? 'p6' : 'p4', '-cq', preset.quality === 'high' ? '18' : '23'];
  return ['-preset', preset.quality === 'draft' ? 'veryfast' : preset.quality === 'high' ? 'slow' : 'medium', '-crf', preset.quality === 'draft' ? '30' : preset.quality === 'high' ? '18' : '23'];
}

export function canonicalVideoSettings(preset: RenderPreset): string[] {
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
