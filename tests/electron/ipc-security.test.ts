import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { ALLOWED_FFMPEG_API_KEYS, ALLOWED_YOUTUBE_API_KEYS, createFFmpegBridge, createYouTubeBridge } = require('../../electron/preload-api.cjs') as {
  ALLOWED_FFMPEG_API_KEYS: readonly string[];
  ALLOWED_YOUTUBE_API_KEYS: readonly string[];
  createFFmpegBridge: (ipc: ElectronIpcMock) => Record<string, unknown>;
  createYouTubeBridge: (ipc: ElectronIpcMock) => Record<string, unknown>;
};
const { validateFFmpegRunRequest, validateTargetPath, validateArtifactIntegrityRequest } = require('../../electron/ffmpeg-security.cjs') as {
  validateFFmpegRunRequest: (request: unknown) => unknown;
  validateTargetPath: (targetPath: unknown) => string;
  validateArtifactIntegrityRequest: (request: unknown) => unknown;
};
const { registerYouTubeHandlers, safePublishError } = require('../../electron/youtube-ipc.cjs') as { registerYouTubeHandlers: (input: any) => () => void; safePublishError: (error: Error) => { code: string; retryable: boolean; status: number } };
const { YouTubeCredentialError } = require('../../electron/youtube-credentials.cjs') as { YouTubeCredentialError: new (code: string, message: string) => Error };

interface ElectronIpcMock {
  invoke: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  removeListener: ReturnType<typeof vi.fn>;
}

describe('Electron FFmpeg IPC güvenliği', () => {
  it('preload yalnızca izin verilen ve frozen API yüzeyini oluşturur', () => {
    const ipc: ElectronIpcMock = { invoke: vi.fn(), on: vi.fn(), removeListener: vi.fn() };
    const bridge = createFFmpegBridge(ipc);
    expect(Object.keys(bridge).sort()).toEqual([...ALLOWED_FFMPEG_API_KEYS].sort());
    expect(Object.isFrozen(bridge)).toBe(true);
    expect(bridge).not.toHaveProperty('send');
    expect(bridge).not.toHaveProperty('invoke');
  });

  it('bridge yalnızca sabit kanal adlarına invoke yapar', async () => {
    const ipc: ElectronIpcMock = { invoke: vi.fn().mockResolvedValue(true), on: vi.fn(), removeListener: vi.fn() };
    const bridge = createFFmpegBridge(ipc) as { cancel: (id: string) => Promise<boolean> };
    await bridge.cancel('job-1');
    expect(ipc.invoke).toHaveBeenCalledWith('ffmpeg:cancel', 'job-1');
  });

  it('run request şekli, jobId ve argümanları doğrular', () => {
    expect(() => validateFFmpegRunRequest(null)).toThrow();
    expect(() => validateFFmpegRunRequest({ jobId: '../bad', args: ['-version'] })).toThrow('jobId');
    expect(() => validateFFmpegRunRequest({ jobId: 'ok', args: [] })).toThrow('args');
    expect(validateFFmpegRunRequest({ jobId: 'job-1', args: ['-version'] })).toBeTruthy();
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
    const bridge = createYouTubeBridge(ipc) as { connect: () => Promise<unknown>; disconnect: (ref: string) => Promise<unknown>; finalizeSelection: (selection: string, channel: string) => Promise<unknown>; resolve?: unknown };
    expect(Object.keys(bridge).sort()).toEqual([...ALLOWED_YOUTUBE_API_KEYS].sort());
    expect(bridge.resolve).toBeUndefined();
    await bridge.connect();
    expect(ipc.invoke).toHaveBeenCalledWith('youtube:connect');
    await expect(bridge.disconnect('token-value')).rejects.toThrow('Invalid YouTube credential reference');
    await expect(bridge.finalizeSelection('invalid', 'UC-A')).rejects.toThrow('Invalid YouTube channel selection');
  });
  it('returns sanitized structured status failures with stable codes', async () => {
    const handlers = new Map<string, (event: unknown, input: unknown) => Promise<unknown>>();
    const electron = { app: { getPath: () => 'unused' }, ipcMain: { handle: (channel: string, handler: (event: unknown, input: unknown) => Promise<unknown>) => handlers.set(channel, handler), removeHandler: vi.fn() }, safeStorage: {} };
    registerYouTubeHandlers({ electron, service: { status: async () => { throw new YouTubeCredentialError('secure-storage-unavailable', 'Secure credential storage is unavailable on this system.'); } } });
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
});
