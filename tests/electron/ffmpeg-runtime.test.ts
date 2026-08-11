import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { binaries, bundledBinary, isPackagedRuntime, resolveFFmpegRuntime } = require('../../electron/ffmpeg-runtime.cjs') as { binaries: { ffmpeg: string; ffprobe: string }; bundledBinary(name: 'ffmpeg' | 'ffprobe', input: { resourcesPath: string }): string | null; isPackagedRuntime(input: { appIsPackaged?: boolean; env?: Record<string, string> }): boolean; resolveFFmpegRuntime(input: { isPackaged: boolean; resourcesPath?: string; env?: Record<string, string> }): { ffmpeg: string | null; ffprobe: string | null; source: string }; };
const { detectCapabilities, resolveFFprobeExecutable, resolveRuntime } = require('../../electron/ffmpeg-service.cjs') as { detectCapabilities(input: { isPackaged: boolean; resourcesPath: string; capture?: (executable: string | null, args: string[]) => Promise<string> }): Promise<{ available: boolean; ffprobeAvailable: boolean; reason: string | null }>; resolveFFprobeExecutable(input?: { runtime?: { source: string; ffprobe: string | null; ffmpeg: string | null } }): string | null; resolveRuntime(input: { env: Record<string, string> }): { source: string; ffmpeg: string | null; ffprobe: string | null } };

function resources(withFFmpeg = true, withFFprobe = true) { const root = mkdtempSync(path.join(tmpdir(), 'shortsflow-runtime-')); const directory = path.join(root, 'ffmpeg'); require('node:fs').mkdirSync(directory); if (withFFmpeg) writeFileSync(path.join(directory, binaries.ffmpeg), 'ffmpeg'); if (withFFprobe) writeFileSync(path.join(directory, binaries.ffprobe), 'ffprobe'); return root; }

describe('packaged FFmpeg runtime resolution', () => {
  it('prefers only trusted bundled binaries in packaged mode', () => {
    const root = resources(); try { const runtime = resolveFFmpegRuntime({ isPackaged: true, resourcesPath: root, env: { SHORTSFLOW_FFMPEG_PATH: 'C:/untrusted/ffmpeg.exe', SHORTSFLOW_FFPROBE_PATH: 'C:/untrusted/ffprobe.exe' } }); expect(runtime).toMatchObject({ source: 'bundled', ffmpeg: path.join(root, 'ffmpeg', binaries.ffmpeg), ffprobe: path.join(root, 'ffmpeg', binaries.ffprobe) }); expect(bundledBinary('ffmpeg', { resourcesPath: root })).toContain(path.join('ffmpeg', binaries.ffmpeg)); } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it('retains explicit environment and PATH behavior in development', () => {
    const runtime = resolveFFmpegRuntime({ isPackaged: false, env: { SHORTSFLOW_FFMPEG_PATH: 'C:/dev/ffmpeg.exe', SHORTSFLOW_FFPROBE_PATH: 'C:/dev/ffprobe.exe' } }); expect(runtime).toEqual({ ffmpeg: 'C:/dev/ffmpeg.exe', ffprobe: 'C:/dev/ffprobe.exe', source: 'environment' });
  });
  it('uses both staged binaries for the dedicated product E2E packaged mode', () => {
    const root = resources(); try {
      const env = { SHORTSFLOW_PRODUCT_E2E_PACKAGED: '1', SHORTSFLOW_E2E_RESOURCES_PATH: root, SHORTSFLOW_FFMPEG_PATH: 'C:/untrusted/ffmpeg.exe', SHORTSFLOW_FFPROBE_PATH: 'C:/untrusted/ffprobe.exe' };
      expect(isPackagedRuntime({ appIsPackaged: false, env })).toBe(true);
      const runtime = resolveRuntime({ env });
      expect(runtime).toMatchObject({ source: 'bundled', ffmpeg: path.join(root, 'ffmpeg', binaries.ffmpeg), ffprobe: path.join(root, 'ffmpeg', binaries.ffprobe) });
      expect(resolveFFprobeExecutable({ runtime })).toBe(path.join(root, 'ffmpeg', binaries.ffprobe));
      expect(runtime.ffmpeg).toContain(path.join(root, 'ffmpeg'));
      expect(runtime.ffprobe).toContain(path.join(root, 'ffmpeg'));
      const previousMode = process.env.SHORTSFLOW_PRODUCT_E2E_PACKAGED;
      const previousResources = process.env.SHORTSFLOW_E2E_RESOURCES_PATH;
      process.env.SHORTSFLOW_PRODUCT_E2E_PACKAGED = '1'; process.env.SHORTSFLOW_E2E_RESOURCES_PATH = root;
      try { expect(resolveFFprobeExecutable()).toBe(path.join(root, 'ffmpeg', binaries.ffprobe)); } finally {
        if (previousMode === undefined) delete process.env.SHORTSFLOW_PRODUCT_E2E_PACKAGED; else process.env.SHORTSFLOW_PRODUCT_E2E_PACKAGED = previousMode;
        if (previousResources === undefined) delete process.env.SHORTSFLOW_E2E_RESOURCES_PATH; else process.env.SHORTSFLOW_E2E_RESOURCES_PATH = previousResources;
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it('does not fall back to PATH when staged E2E ffprobe is missing', () => {
    const root = resources(true, false); try {
      const env = { SHORTSFLOW_PRODUCT_E2E_PACKAGED: '1', SHORTSFLOW_E2E_RESOURCES_PATH: root, PATH: '' };
      const runtime = resolveRuntime({ env });
      expect(runtime.source).toBe('bundled');
      expect(runtime.ffmpeg).toBe(path.join(root, 'ffmpeg', binaries.ffmpeg));
      expect(runtime.ffprobe).toBeNull();
      expect(resolveFFprobeExecutable({ runtime })).toBeNull();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it('reports missing bundled FFmpeg and FFprobe clearly without falling back to PATH', async () => {
    const missingFfmpeg = resources(false, true); const missingProbe = resources(true, false);
    try { await expect(detectCapabilities({ isPackaged: true, resourcesPath: missingFfmpeg })).resolves.toMatchObject({ available: false, reason: expect.stringContaining('Bundled FFmpeg') }); const probe = await detectCapabilities({ isPackaged: true, resourcesPath: missingProbe, capture: async (executable, args) => { if (!executable) throw new Error('missing executable'); return args.includes('-encoders') ? ' V..... libx264\n' : 'ffmpeg version test'; } }); expect(probe.ffprobeAvailable).toBe(false); expect(probe.reason).toContain('Bundled FFprobe'); } finally { rmSync(missingFfmpeg, { recursive: true, force: true }); rmSync(missingProbe, { recursive: true, force: true }); }
  });
});
