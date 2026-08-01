/// <reference types="vite/client" />

import type { FFmpegBridge } from '@/core/render/ffmpegTypes';

declare global {
  interface Window {
    electronAPI?: {
      platform: string;
      version: string;
      ffmpeg: FFmpegBridge;
    };
  }
}

export {};
