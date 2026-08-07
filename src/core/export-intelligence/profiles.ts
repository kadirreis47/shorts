import type { ExportPreset } from './types';
const common = { version: '2026.1', container: 'mp4' as const, videoCodec: 'h264' as const, audioCodec: 'aac' as const, pixelFormat: 'yuv420p' as const, bitrateKbps: 8000, audioBitrateKbps: 192, sampleRate: 48000, frameRate: 30, encoder: 'libx264', hardware: 'cpu' as const, threads: 0, gopFrames: 60 };
const presets: readonly ExportPreset[] = [
  { ...common, id: 'youtube-shorts', name: 'YouTube Shorts', platformId: 'youtube-shorts', quality: 'standard' },
  { ...common, id: 'tiktok', name: 'TikTok', platformId: 'tiktok', quality: 'standard', bitrateKbps: 7000 },
  { ...common, id: 'instagram-reels', name: 'Instagram Reels', platformId: 'instagram-reels', quality: 'standard', bitrateKbps: 7000 },
  { ...common, id: 'generic-short-video', name: 'Generic short video', platformId: 'generic-short-video', quality: 'standard' },
  { ...common, id: 'high-quality', name: 'High Quality', platformId: null, quality: 'high', bitrateKbps: 16000 },
  { ...common, id: 'archive', name: 'Archive', platformId: null, quality: 'archive', videoCodec: 'hevc', bitrateKbps: 30000 },
  { ...common, id: 'fast-preview', name: 'Fast Preview', platformId: null, quality: 'preview', bitrateKbps: 2500, frameRate: 24, encoder: 'libx264' },
];
export function listExportPresets(): readonly ExportPreset[] { return presets; }
export function getExportPreset(id = 'generic-short-video'): ExportPreset { return presets.find((preset) => preset.id === id) ?? presets[3]; }
