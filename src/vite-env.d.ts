/// <reference types="vite/client" />

import type { FFmpegBridge } from '@/core/render/ffmpegTypes';
import type { YouTubePublishingClient } from '@/core/publishing/adapters';
import type { AnalyticsAdapterResponse, AnalyticsWindow } from '@/core/analytics';

declare global {
  interface YouTubeConnectionResult {
    platform: 'youtube';
    credentialRef: string;
    accountRef: string;
    channelRef: string;
    displayName: string;
    authenticated: boolean;
    grantedScopes: string[];
  }
  interface YouTubeChannelSelection {
    channelId: string;
    displayName: string;
  }
  interface YouTubeSelectionRequired {
    platform: 'youtube';
    status: 'selection-required';
    selectionRef: string;
    channels: YouTubeChannelSelection[];
  }
  interface YouTubeStatusResult {
    ok: true;
    status: { credentialRef: string; authenticated: boolean };
  }
  interface YouTubeStatusFailure {
    ok: false;
    error: { code: string; message: string };
  }
  interface YouTubeAnalyticsRequest {
    credentialRef: string;
    channelRef: string;
    remotePublicationId: string;
    publishedAt: string;
    window: AnalyticsWindow;
  }
  interface YouTubeAnalyticsResult {
    ok: true;
    result: AnalyticsAdapterResponse;
  }
  interface YouTubeAnalyticsFailure {
    ok: false;
    error: { code: string; message: string; retryable: boolean; status: number; retryAfterMs: number | null };
  }
  interface Window {
    electronAPI?: {
      platform: string;
      version: string;
      ffmpeg: FFmpegBridge;
      youtube: Partial<YouTubePublishingClient> & {
        establishOwnerContext?(accessToken: string): Promise<{ ok: true; result: { ready: true; ownerId: string; changed: boolean } } | { ok: false; error: { code: string; message: string } }>;
        clearOwnerContext?(): Promise<{ ok: true; result: { ready: false; changed: boolean } }>;
        connect(): Promise<YouTubeConnectionResult | YouTubeSelectionRequired>;
        finalizeSelection(selectionRef: string, channelRef: string): Promise<YouTubeConnectionResult>;
        cancelSelection(selectionRef: string): Promise<{ selectionRef: string; cancelled: boolean }>;
        disconnect(credentialRef: string): Promise<{ credentialRef: string; disconnected: boolean }>;
        status(credentialRef: string): Promise<YouTubeStatusResult | YouTubeStatusFailure>;
        collectAnalytics?(request: YouTubeAnalyticsRequest): Promise<YouTubeAnalyticsResult | YouTubeAnalyticsFailure>;
      };
    };
  }
}

export {};
