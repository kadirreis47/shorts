import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { ALLOWED_FFMPEG_API_KEYS, createFFmpegBridge } = require('../../electron/preload-api.cjs') as {
  ALLOWED_FFMPEG_API_KEYS: readonly string[];
  createFFmpegBridge: (ipc: ElectronIpcMock) => Record<string, unknown>;
};
const { validateFFmpegRunRequest, validateTargetPath } = require('../../electron/ffmpeg-security.cjs') as {
  validateFFmpegRunRequest: (request: unknown) => unknown;
  validateTargetPath: (targetPath: unknown) => string;
};

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
});
