import type { AudioPlatformProfile, LoudnessPlan } from './types';

export const AUDIO_PLAN_VERSION = '1.0' as const;
export const AUDIO_PROFILES: Readonly<Record<AudioPlatformProfile, LoudnessPlan>> = Object.freeze({
  'generic-short-video': profile('generic-short-video', -14, -1),
  'youtube-shorts': profile('youtube-shorts', -14, -1),
  tiktok: profile('tiktok', -15, -1),
  'instagram-reels': profile('instagram-reels', -14, -1),
});
function profile(name: AudioPlatformProfile, finalTargetLufs: number, peak: number): LoudnessPlan { return Object.freeze({ profile: name, voiceTargetLufs: -16, musicTargetLufs: -24, sfxTargetLufs: -20, finalTargetLufs, truePeakDb: peak, limiterCeilingDb: peak, normalizationMode: 'ebu-r128', risks: [] }); }
