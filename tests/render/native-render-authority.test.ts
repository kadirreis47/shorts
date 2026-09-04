import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RenderManifest } from '@/core/media';
import { FFmpegRenderAdapter } from '@/core/render/ffmpegRenderAdapter';
import { buildConcatNativeRenderIntent, buildFullNativeRenderIntent, buildSegmentNativeRenderIntent } from '@/core/render/nativeRenderIntent';
import type { RenderPreset } from '@/core/render/types';
import type { HardwareLease, HardwareScheduler } from '@/core/render/hardwareScheduler';

const require = createRequire(import.meta.url);
const { validateCanonicalRenderRequest, compileCanonicalRenderRequest } = require('../../electron/canonical-render-intent.cjs') as {
  validateCanonicalRenderRequest(value: unknown): any;
  compileCanonicalRenderRequest(value: unknown, options?: { segmentPaths?: string[] }): { args: string[]; imageGeometryAuthorities: unknown[] };
};
const preset: RenderPreset = { id: 'native', name: 'Native', container: 'mp4', videoCodec: 'h264', audioCodec: 'aac', quality: 'standard', hardwareAcceleration: 'disabled' };

afterEach(() => { Reflect.deleteProperty(globalThis, 'window'); });

describe('semantic renderer to native-main render contract', () => {
  it('compiles legitimate full, segment, video, image, mixed, and concat declarations in main', () => {
    const color = manifest();
    expect(compile('full-render', buildFullNativeRenderIntent(color, preset)).args.at(-1)).toBe('{{OUTPUT_FILE}}');
    expect(compile('segment-render', buildSegmentNativeRenderIntent(color, preset, color.timeline.scenes[0])).args).toContain('-an');

    const video = manifest([{ id: 'video', type: 'video', source: 'https://cdn.example/extensionless', metadata: {} }], [['video']]);
    expect(compile('full-render', buildFullNativeRenderIntent(video, preset)).args).toContain('https://cdn.example/extensionless');

    const image = manifest([{ id: 'image', type: 'image', source: privateSource(), metadata: {} }], [['image']], true);
    const compiledImage = compile('full-render', buildFullNativeRenderIntent(image, preset));
    expect(compiledImage.args.join(',')).toContain('{{IMAGE_DISPLAY_GEOMETRY_INPUT_0}}');
    expect(compiledImage.imageGeometryAuthorities).toHaveLength(1);

    const mixed = manifest([
      { id: 'image', type: 'image', source: privateSource(), metadata: {} },
      { id: 'video', type: 'video', source: 'https://cdn.example/video', metadata: {} },
    ], [['image'], ['video']], true);
    expect(compile('full-render', buildFullNativeRenderIntent(mixed, preset)).args).toEqual(expect.arrayContaining([privateSource(), 'https://cdn.example/video']));

    const refs = [`sgr1_${'A'.repeat(43)}`, `sgr1_${'B'.repeat(43)}`];
    const concat = validateCanonicalRenderRequest({ operation: 'segment-concat', jobId: 'concat', outputPath: absoluteOutput(), intent: buildConcatNativeRenderIntent(mixed, preset, refs) });
    const compiledConcat = compileCanonicalRenderRequest(concat, { segmentPaths: [absoluteSegment(1), absoluteSegment(2)] });
    expect(compiledConcat.args.filter((value) => value === '{{OUTPUT_FILE}}')).toHaveLength(1);
  });

  it('FFmpegRenderAdapter sends semantic intent and never renderer-authored argv', async () => {
    const createCanonicalRenderPlan = vi.fn(async (request: Record<string, unknown>) => {
      expect(request).not.toHaveProperty('args');
      expect(request).not.toHaveProperty('concatContent');
      expect(request.intent).toMatchObject({ version: 1, kind: 'full' });
      return { version: 1 as const, reference: `crp1_${'A'.repeat(43)}`, expiresAt: '2099-01-01T00:00:00.000Z' };
    });
    const bridge = {
      getCapabilities: vi.fn(async () => ({ available: true, executable: 'ffmpeg', version: 'test', encoders: ['libx264'], hardwareEncoders: [], gpuDevices: [], ffprobeAvailable: true, ffprobeExecutable: 'ffprobe', ffprobeVersion: 'test', reason: null })),
      createCanonicalRenderPlan, executeCanonicalRenderPlan: vi.fn(async () => ({ outputPath: absoluteOutput(), sizeBytes: 10, elapsedMs: 1, exitCode: 0, stderrTail: [] })),
      cancel: vi.fn(), onProgress: () => () => undefined,
    };
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { electronAPI: { ffmpeg: bridge } } });
    const scheduler: HardwareScheduler = { acquire: vi.fn(async (): Promise<HardwareLease> => ({ selection: { backend: 'cpu', encoder: 'libx264', gpu: null, reason: 'test', automatic: false }, release: vi.fn() })), dispose: vi.fn() };
    const adapter = new FFmpegRenderAdapter(scheduler);
    const source = manifest();
    await expect(adapter.render({ jobId: 'native-adapter', manifest: source, preset, outputPath: absoluteOutput(), signal: new AbortController().signal, reportProgress: vi.fn(async () => undefined) })).resolves.toMatchObject({ uri: absoluteOutput(), sizeBytes: 10 });
    expect(createCanonicalRenderPlan).toHaveBeenCalledOnce();
  });
});

function compile(operation: 'full-render' | 'segment-render', intent: unknown) {
  const request = operation === 'segment-render'
    ? { operation, jobId: 'segment', outputResourceReference: `sgr1_${'A'.repeat(43)}`, intent }
    : { operation, jobId: 'full', outputPath: absoluteOutput(), intent };
  return compileCanonicalRenderRequest(validateCanonicalRenderRequest(request));
}

function manifest(assets: any[] = [], sceneAssets: string[][] = [[]], imageAuthority = false): RenderManifest {
  const durations = sceneAssets.map(() => 1_000); const durationMs = durations.reduce((sum, value) => sum + value, 0);
  const scenes = sceneAssets.map((assetIds, index) => ({
    id: `scene-${index}`, index, durationMs: durations[index], startMs: index * 1_000, endMs: (index + 1) * 1_000,
    overlapBeforeMs: 0, overlapAfterMs: 0, assetIds, cameraMotion: 'none', transition: { type: 'cut', durationMs: 0 },
    imageGeometryAuthority: imageAuthority && assetIds.includes('image') ? { authorityReference: `idga1_${'A'.repeat(43)}`, mediaIdentity: `media:${ownerPath()}`, expectedOrientation: 'identity', contentDigest: 'a'.repeat(64) } : undefined,
  }));
  return {
    schemaVersion: '1.4', projectId: 'native-project', createdAt: '2026-09-04T00:00:00.000Z', durationMs,
    render: { fps: 30, width: 1080, height: 1920, aspectRatio: '9:16' }, assets,
    timeline: { scenes, tracks: [], markers: [], durationMs, metrics: {} },
    subtitles: { enabled: false, cues: [], words: [], source: 'scene', style: {} },
    audio: { narrationMode: 'silent', voice: [], music: [], sfx: [], settings: { masterGain: 1, voiceGain: 1, musicGain: .2, sfxGain: .7, duckingGain: .3, duckingAttackMs: 120, duckingReleaseMs: 260, musicFadeInMs: 900, musicFadeOutMs: 1_200, targetLufs: -14 } },
    branding: { watermark: null }, validation: { renderReady: true }, metadata: { title: 'Native', source: 'manual', createdAt: 'now', updatedAt: 'now', tags: [] },
  } as unknown as RenderManifest;
}

function ownerPath() { return '00000000-0000-4000-8000-000000000001/generated-images/00000000-0000-4000-8000-000000000002.jpg'; }
function privateSource() { return `https://project.supabase.co/storage/v1/object/sign/media/${ownerPath()}?token=opaque`; }
function absoluteOutput() { return process.platform === 'win32' ? 'C:\\Exports\\native.mp4' : '/tmp/native.mp4'; }
function absoluteSegment(index: number) { return process.platform === 'win32' ? `C:\\Cache\\segment-${index}.mp4` : `/tmp/segment-${index}.mp4`; }
