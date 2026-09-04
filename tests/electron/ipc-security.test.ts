import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { ALLOWED_FFMPEG_API_KEYS, ALLOWED_YOUTUBE_API_KEYS, createFFmpegBridge, createYouTubeBridge, installPreloadBridge } = require('../../electron/preload-api.cjs') as {
  ALLOWED_FFMPEG_API_KEYS: readonly string[];
  ALLOWED_YOUTUBE_API_KEYS: readonly string[];
  createFFmpegBridge: (ipc: ElectronIpcMock) => Record<string, unknown>;
  createYouTubeBridge: (ipc: ElectronIpcMock) => Record<string, unknown>;
  installPreloadBridge: (input: { contextBridge: { exposeInMainWorld: ReturnType<typeof vi.fn> }; ipcRenderer: ElectronIpcMock; platform: string; version: string }) => Record<string, unknown>;
};
const { validateFFmpegRunRequest, validateTargetPath, validateArtifactIntegrityRequest } = require('../../electron/ffmpeg-security.cjs') as {
  validateFFmpegRunRequest: (request: unknown) => unknown;
  validateTargetPath: (targetPath: unknown) => string;
  validateArtifactIntegrityRequest: (request: unknown) => unknown;
};
const { registerYouTubeHandlers, safePublishError } = require('../../electron/youtube-ipc.cjs') as { registerYouTubeHandlers: (input: any) => () => void; safePublishError: (error: Error) => { code: string; retryable: boolean; status: number } };
const { YouTubeCredentialError } = require('../../electron/youtube-credentials.cjs') as { YouTubeCredentialError: new (code: string, message: string) => Error };
const owner = { ownerId: '11111111-1111-4111-8111-111111111111', generation: 1, signal: new AbortController().signal };
const readyOwnerContext = { capture: () => owner, assertCurrent: vi.fn(), isCurrent: () => true, establish: vi.fn(), clear: vi.fn() };

interface ElectronIpcMock {
  invoke: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  removeListener: ReturnType<typeof vi.fn>;
}

describe('Electron FFmpeg IPC güvenliği', () => {
  it('installs the packaged-safe preload bridge without sibling module loading', async () => {
    const ipc: ElectronIpcMock = { invoke: vi.fn(), on: vi.fn(), removeListener: vi.fn() };
    const contextBridge = { exposeInMainWorld: vi.fn() };
    const api = installPreloadBridge({ contextBridge, ipcRenderer: ipc, platform: 'win32', version: '43.2.0' }) as { youtube: Record<string, unknown>; version: string; appVersion: () => Promise<unknown> };
    expect(contextBridge.exposeInMainWorld).toHaveBeenCalledWith('electronAPI', api);
    expect(Object.keys(api.youtube).sort()).toEqual([...ALLOWED_YOUTUBE_API_KEYS].sort());
    expect(api.youtube).not.toHaveProperty('resolveExecutionCredential');
    expect(JSON.stringify(api)).not.toContain('accessToken');
    expect(JSON.stringify(api)).not.toContain('refreshToken');
    expect(JSON.stringify(api)).not.toMatch(/client_?secret/i);
    expect(api.version).toBe('43.2.0');
    await api.appVersion();
    expect(ipc.invoke).toHaveBeenCalledWith('app:get-version');
    const preloadSource = readFileSync(path.resolve('electron/preload.cjs'), 'utf8');
    expect(preloadSource).not.toContain("require('./preload-api.cjs')");
    expect(preloadSource).not.toMatch(/client_?secret/i);
  });

  it('preload yalnızca izin verilen ve frozen API yüzeyini oluşturur', () => {
    const ipc: ElectronIpcMock = { invoke: vi.fn(), on: vi.fn(), removeListener: vi.fn() };
    const bridge = createFFmpegBridge(ipc);
    expect(Object.keys(bridge).sort()).toEqual([...ALLOWED_FFMPEG_API_KEYS].sort());
    expect(Object.isFrozen(bridge)).toBe(true);
    expect(bridge).not.toHaveProperty('send');
    expect(bridge).not.toHaveProperty('invoke');
    expect(bridge).not.toHaveProperty('run');
    expect(bridge).not.toHaveProperty('copyFile');
    expect(bridge).not.toHaveProperty('fileExists');
    expect(bridge).not.toHaveProperty('artifactDigest');
    expect(bridge).not.toHaveProperty('analyzeOutput');
  });

  it('bridge yalnızca sabit kanal adlarına invoke yapar', async () => {
    const ipc: ElectronIpcMock = { invoke: vi.fn().mockResolvedValue(true), on: vi.fn(), removeListener: vi.fn() };
    const bridge = createFFmpegBridge(ipc) as {
      cancel: (id: string) => Promise<boolean>;
      createCanonicalRenderPlan: (request: unknown) => Promise<unknown>;
      executeCanonicalRenderPlan: (reference: string) => Promise<unknown>;
      openVerifiedExport: (artifact: { artifactPath: string; sizeBytes: number; contentDigest: string }) => Promise<unknown>;
      revealVerifiedExport: (artifact: { artifactPath: string; sizeBytes: number; contentDigest: string }) => Promise<unknown>;
      saveVerifiedExportAs: (artifact: { artifactPath: string; sizeBytes: number; contentDigest: string }, destinationPath: string) => Promise<unknown>;
      issueSegmentResource: (fingerprint: string) => Promise<unknown>;
    };
    const artifact = { artifactPath: path.resolve('output.mp4'), sizeBytes: 1, contentDigest: 'a'.repeat(64) };
    await bridge.cancel('job-1');
    expect(ipc.invoke).toHaveBeenCalledWith('ffmpeg:cancel', 'job-1');
    await bridge.openVerifiedExport(artifact);
    expect(ipc.invoke).toHaveBeenCalledWith('ffmpeg:open-verified-export', artifact);
    await bridge.revealVerifiedExport(artifact);
    expect(ipc.invoke).toHaveBeenCalledWith('ffmpeg:reveal-verified-export', artifact);
    await bridge.saveVerifiedExportAs(artifact, path.resolve('copy.mp4'));
    expect(ipc.invoke).toHaveBeenCalledWith('ffmpeg:save-verified-export-as', { artifact, destinationPath: path.resolve('copy.mp4') });
    await expect(bridge.openVerifiedExport({ ...artifact, contentDigest: 'invalid' })).rejects.toThrow('Invalid verified export artifact');
    const renderRequest = semanticRenderRequest(path.resolve('output.mp4'));
    await bridge.createCanonicalRenderPlan(renderRequest);
    expect(ipc.invoke).toHaveBeenCalledWith('ffmpeg:create-render-plan', renderRequest);
    await bridge.issueSegmentResource('a'.repeat(16));
    expect(ipc.invoke).toHaveBeenCalledWith('ffmpeg:issue-segment-resource', 'a'.repeat(16));
    const reference = `crp1_${'A'.repeat(43)}`;
    await bridge.executeCanonicalRenderPlan(reference);
    expect(ipc.invoke).toHaveBeenCalledWith('ffmpeg:execute-render-plan', reference);
    await expect(bridge.executeCanonicalRenderPlan('forged')).rejects.toThrow('Invalid canonical render plan reference');
    const serviceSource = readFileSync(path.resolve('electron/ffmpeg-service.cjs'), 'utf8');
    expect(serviceSource).not.toContain("ipcMain.handle('ffmpeg:run'");
    expect(serviceSource).not.toContain("ipcMain.handle('ffmpeg:file-exists'");
    expect(serviceSource).not.toContain("ipcMain.handle('ffmpeg:copy-file'");
    expect(serviceSource).not.toContain("ipcMain.handle('ffmpeg:artifact-digest'");
  });

  it('run request şekli, jobId ve argümanları doğrular', () => {
    expect(() => validateFFmpegRunRequest(null)).toThrow();
    expect(() => validateFFmpegRunRequest({ ...semanticRenderRequest(path.resolve('output.mp4')), jobId: '../bad' })).toThrow(/job/i);
    expect(() => validateFFmpegRunRequest({ ...semanticRenderRequest(path.resolve('output.mp4')), args: [] })).toThrow();
    expect(validateFFmpegRunRequest(semanticRenderRequest(path.resolve('output.mp4')))).toBeTruthy();
  });

  it('path girdilerinde absolute path zorunlu kılar ve NUL girdisini reddeder', () => {
    expect(() => validateTargetPath('../relative.mp4')).toThrow('absolute');
    expect(() => validateTargetPath(`bad\0path`)).toThrow();
    const absolute = path.resolve('output.mp4');
    expect(validateTargetPath(absolute)).toBe(path.normalize(absolute));
  });
  it('allows only a bounded semantic artifact integrity request', () => {
    const absolute = path.resolve('output.mp4');
    expect(validateArtifactIntegrityRequest({ artifactPath: absolute, sizeBytes: 1, contentDigest: 'a'.repeat(64) })).toEqual({ artifactPath: path.normalize(absolute), sizeBytes: 1, contentDigest: 'a'.repeat(64) });
    expect(() => validateArtifactIntegrityRequest({ artifactPath: absolute, sizeBytes: -1, contentDigest: 'a'.repeat(64) })).toThrow('size');
    expect(() => validateArtifactIntegrityRequest({ artifactPath: absolute, sizeBytes: 1, contentDigest: 'bad' })).toThrow('digest');
  });
  it('exposes only semantic YouTube account operations and never a credential resolver', async () => {
    const ipc: ElectronIpcMock = { invoke: vi.fn().mockResolvedValue(true), on: vi.fn(), removeListener: vi.fn() };
    const bridge = createYouTubeBridge(ipc) as { establishOwnerContext: (token: string) => Promise<unknown>; connect: () => Promise<unknown>; disconnect: (ref: string) => Promise<unknown>; finalizeSelection: (selection: string, channel: string) => Promise<unknown>; resolve?: unknown };
    expect(Object.keys(bridge).sort()).toEqual([...ALLOWED_YOUTUBE_API_KEYS].sort());
    expect(bridge.resolve).toBeUndefined();
    await bridge.connect();
    expect(ipc.invoke).toHaveBeenCalledWith('youtube:connect');
    await bridge.establishOwnerContext('header.payload.signature');
    expect(ipc.invoke).toHaveBeenCalledWith('youtube:owner-context', { accessToken: 'header.payload.signature' });
    await expect(bridge.disconnect('token-value')).rejects.toThrow('Invalid YouTube credential reference');
    await expect(bridge.finalizeSelection('invalid', 'UC-A')).rejects.toThrow('Invalid YouTube channel selection');
  });
  it('preload rejects raw YouTube artifact paths and accepts only an opaque verified export reference', async () => {
    const ipc: ElectronIpcMock = { invoke: vi.fn().mockResolvedValue(true), on: vi.fn(), removeListener: vi.fn() };
    const bridge = createYouTubeBridge(ipc) as { publish: (request: unknown) => Promise<unknown> };
    const base = {
      jobId: 'job-1', idempotencyKey: 'key-1', platform: 'youtube', approvalFingerprint: 'approval', approvedAt: '2026-09-04T00:00:00.000Z',
      account: { credentialRef: 'youtube_11111111-1111-1111-1111-111111111111', channelRef: 'UC-channel', accountId: 'account' }, target: { accountId: 'account', channelRef: 'UC-channel' },
      outboundDescription: '', recovery: { jobState: 'queued', remoteState: null, failureCode: null },
    };
    await expect(bridge.publish({ ...base, artifact: { artifactPath: 'C:/Windows/win.ini', sizeBytes: 1, contentDigest: 'a'.repeat(64), artifactFingerprint: 'artifact' } })).rejects.toThrow('Invalid YouTube publish request');
    const safe = { ...base, artifact: { verifiedExportReference: `vea1_${'A'.repeat(43)}`, artifactFingerprint: 'artifact' } };
    await bridge.publish(safe);
    expect(ipc.invoke).toHaveBeenCalledWith('youtube:publish', safe);
  });
  it('returns sanitized structured status failures with stable codes', async () => {
    const handlers = new Map<string, (event: unknown, input: unknown) => Promise<unknown>>();
    const electron = { app: { getPath: () => 'unused' }, ipcMain: { handle: (channel: string, handler: (event: unknown, input: unknown) => Promise<unknown>) => handlers.set(channel, handler), removeHandler: vi.fn() }, safeStorage: {} };
    registerYouTubeHandlers({ electron, ownerContext: readyOwnerContext, service: { status: async () => { throw new YouTubeCredentialError('secure-storage-unavailable', 'Secure credential storage is unavailable on this system.'); } } });
    const result = await handlers.get('youtube:status')!({}, { credentialRef: 'youtube_11111111-1111-1111-1111-111111111111' });
    expect(result).toEqual({ ok: false, error: { code: 'secure-storage-unavailable', message: 'Secure credential storage is unavailable on this system.' } });
    expect(JSON.stringify(result)).not.toContain('token');
  });
  it('maps credential-resolution failures to auth or retryable recovery semantics before publishing starts', () => {
    expect(safePublishError(new YouTubeCredentialError('credential-missing', 'Reconnect required.'))).toMatchObject({ code: 'credential-missing', status: 401, retryable: false });
    expect(safePublishError(new YouTubeCredentialError('credential-storage-failed', 'Credential storage needs recovery.'))).toMatchObject({ code: 'credential-storage-failed', status: 401, retryable: false });
    expect(safePublishError(new YouTubeCredentialError('secure-storage-unavailable', 'Secure storage is temporarily unavailable.'))).toMatchObject({ code: 'secure-storage-unavailable', status: 503, retryable: true });
    expect(safePublishError(new YouTubeCredentialError('credential-refresh-failed', 'Refresh failed temporarily.'))).toMatchObject({ code: 'credential-refresh-failed', status: 503, retryable: true });
  });
  it('exposes only the bounded analytics operation and rejects token or query injection', async () => {
    const ipc: ElectronIpcMock = { invoke: vi.fn().mockResolvedValue(true), on: vi.fn(), removeListener: vi.fn() };
    const bridge = createYouTubeBridge(ipc) as { collectAnalytics: (request: unknown) => Promise<unknown> };
    const request = { credentialRef: 'youtube_11111111-1111-1111-1111-111111111111', channelRef: 'UC-channel', remotePublicationId: 'video-1', publishedAt: '2026-08-01T00:00:00.000Z', window: '24h' };
    await bridge.collectAnalytics(request); expect(ipc.invoke).toHaveBeenCalledWith('youtube:collect-analytics', request);
    await expect(bridge.collectAnalytics({ ...request, accessToken: 'secret' })).rejects.toThrow('Invalid YouTube analytics request');
    await expect(bridge.collectAnalytics({ ...request, remotePublicationId: 'video&metrics=all' })).rejects.toThrow('Invalid YouTube analytics request');
  });
  it('sanitizes analytics IPC responses and never returns credential material', async () => {
    const handlers = new Map<string, (event: unknown, input: unknown) => Promise<unknown>>();
    const electron = { app: { getPath: () => 'unused' }, ipcMain: { handle: (channel: string, handler: (event: unknown, input: unknown) => Promise<unknown>) => handlers.set(channel, handler), removeHandler: vi.fn() }, safeStorage: {} };
    registerYouTubeHandlers({ electron, ownerContext: readyOwnerContext, service: { status: vi.fn() }, analyticsService: { collect: async () => ({ metrics: [{ rawMetricId: 'views', value: 1, accessToken: 'access-secret', refreshToken: 'refresh-secret' }], diagnostics: [] }) } });
    const result = await handlers.get('youtube:collect-analytics')!({}, { credentialRef: 'youtube_11111111-1111-1111-1111-111111111111', channelRef: 'UC-channel', remotePublicationId: 'video-1', publishedAt: '2026-08-01T00:00:00.000Z', window: '24h' });
    expect(result).toEqual({ ok: true, result: { metrics: [{ rawMetricId: 'views', value: 1, availability: undefined, observedAt: null }], diagnostics: [] } });
    expect(JSON.stringify(result)).not.toContain('secret');
  });
});

function semanticRenderRequest(outputPath: string) {
  return {
    operation: 'full-render', jobId: 'job-1', outputPath,
    intent: {
      version: 1, kind: 'full', width: 160, height: 90, durationMs: 100,
      scenes: [{ durationMs: 100, cameraMotion: 'none', source: { kind: 'color', paletteIndex: 0 } }], sceneDurationsMs: [100],
      transitions: [{ type: 'cut', overlapMs: 0 }], segmentReferences: [], branding: null, subtitleContent: '', audioTracks: [],
      audioSettings: { masterGain: 1, targetLufs: -14, duckingAttackMs: 25, duckingReleaseMs: 250 },
      encoding: { videoCodec: 'h264', audioCodec: 'aac', quality: 'standard', hardwareAcceleration: 'disabled', encoder: null, encoderMode: null, bitrateKbps: null, maxBitrateKbps: null, bufferSizeKbps: null, crf: null, encoderPreset: null, frameRate: 30, pixelFormat: 'yuv420p', gopFrames: null, keyframeInterval: null, threads: null, audioBitrateKbps: 192, sampleRate: 48_000, audioChannels: 2, colorSpace: null, profile: null },
    },
  };
}
