import type { FFmpegBridge } from './ffmpegTypes';

export function getFFmpegBridge(): FFmpegBridge | null {
  return window.electronAPI?.ffmpeg ?? null;
}
