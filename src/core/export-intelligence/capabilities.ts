import { getFFmpegBridge } from '@/core/render';
import type { ExportBenchmark, ExportCapability, ExportHardware } from './types';
export async function detectExportCapabilities(forceRefresh = false): Promise<ExportCapability> { const bridge = getFFmpegBridge(); if (!bridge) return { ffmpeg: false, ffprobe: false, version: null, encoders: [], hardwareEncoders: [], supports: {}, raw: null, detectedAt: new Date().toISOString() }; const raw = await bridge.getCapabilities(forceRefresh); const encoders = raw.encoders.map((encoder) => encoder.toLowerCase()); const hardware = raw.hardwareEncoders.map((encoder) => encoder.toLowerCase()); const supports = Object.fromEntries(['libx264', 'libx265', 'h264_nvenc', 'hevc_nvenc', 'h264_amf', 'hevc_amf', 'h264_qsv', 'hevc_qsv', 'h264_videotoolbox', 'hevc_videotoolbox', 'libsvtav1', 'libvpx-vp9'].map((encoder) => [encoder, encoders.includes(encoder) || hardware.includes(encoder)])); return { ffmpeg: raw.available, ffprobe: raw.ffprobeAvailable === true, version: raw.version, encoders: raw.encoders, hardwareEncoders: raw.hardwareEncoders, supports, raw, detectedAt: new Date().toISOString() }; }
export function isHardwareEncoder(encoder: string): boolean { return /(?:_nvenc|_qsv|_amf|_videotoolbox|vaapi)$/i.test(encoder); }
export function isSoftwareEncoder(encoder: string): boolean { return !isHardwareEncoder(encoder) && encoder !== 'auto'; }
const softwarePriority = ['libx264', 'libx265', 'libsvtav1', 'libaom-av1', 'libvpx-vp9'];
const hardwarePriority = ['nvenc', 'qsv', 'amf', 'videotoolbox', 'vaapi'];
function deterministicEncoderOrder(left: string, right: string): number {
  const leftHardware = isHardwareEncoder(left); const rightHardware = isHardwareEncoder(right);
  if (leftHardware !== rightHardware) return leftHardware ? 1 : -1;
  const priorities = leftHardware ? hardwarePriority : softwarePriority;
  const leftIndex = priorities.findIndex((item) => left.toLowerCase().includes(item));
  const rightIndex = priorities.findIndex((item) => right.toLowerCase().includes(item));
  return (leftIndex < 0 ? 999 : leftIndex) - (rightIndex < 0 ? 999 : rightIndex) || left.localeCompare(right);
}
export function selectEncoder(capability: ExportCapability, codec: 'h264' | 'hevc' | 'av1' | 'vp9', requested: ExportHardware = 'cpu'): { hardware: ExportHardware; encoder: string; reason: string } {
  const candidates = compatibleEncoders(codec, capability);
  const software = candidates.filter(isSoftwareEncoder).sort(deterministicEncoderOrder);
  const hardware = candidates.filter(isHardwareEncoder).sort(deterministicEncoderOrder);
  if (requested === 'cpu') return software[0] ? { hardware: 'cpu', encoder: software[0], reason: 'CPU policy selected a compatible software encoder.' } : { hardware: 'cpu', encoder: 'auto', reason: 'CPU policy requires a software encoder, but none is available.' };
  if (requested === 'gpu') return hardware[0] ? { hardware: 'gpu', encoder: hardware[0], reason: 'GPU policy selected a compatible hardware encoder.' } : software[0] ? { hardware: 'cpu', encoder: software[0], reason: 'GPU encoder unavailable; explicit software fallback selected.' } : { hardware: 'gpu', encoder: 'auto', reason: 'GPU policy found no compatible encoder.' };
  return hardware[0] ? { hardware: 'gpu', encoder: hardware[0], reason: 'Deterministic automatic hardware selection.' } : software[0] ? { hardware: 'cpu', encoder: software[0], reason: 'Deterministic automatic software fallback.' } : { hardware: 'cpu', encoder: 'auto', reason: 'No compatible encoder detected.' };
}
export function encoderSupportsCodec(encoder: string, codec: ExportCapability['raw'] extends never ? string : 'h264' | 'hevc' | 'av1' | 'vp9'): boolean { const normalized = encoder.toLowerCase(); if (codec === 'h264') return normalized === 'libx264' || normalized.startsWith('h264_'); if (codec === 'hevc') return normalized === 'libx265' || normalized.startsWith('hevc_'); if (codec === 'av1') return normalized.includes('av1') || normalized.includes('svtav1'); if (codec === 'vp9') return normalized.includes('vp9'); return false; }
export function compatibleEncoders(codec: 'h264' | 'hevc' | 'av1' | 'vp9', capability: ExportCapability): string[] { return [...new Set([...capability.encoders, ...capability.hardwareEncoders].map((encoder) => encoder.toLowerCase()))].filter((encoder) => encoderSupportsCodec(encoder, codec)).sort(deterministicEncoderOrder); }
export function estimateExportBenchmark(capability: ExportCapability, hardware: ExportHardware, encoder: string, now = new Date().toISOString()): ExportBenchmark { const gpu = hardware === 'gpu' || hardware === 'mixed'; return { hardware, encoder, estimatedFps: gpu ? 60 : 30, cpuPercent: gpu ? 45 : 90, gpuPercent: gpu ? 70 : null, measuredAt: now, confidence: 'capability' }; }
