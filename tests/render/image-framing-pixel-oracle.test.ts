import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, describe, expect, it } from 'vitest';
import type { ImageEncodedToDisplayOrientation, ImageFramingV1 } from '@/core/media';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const compiler = require('../../electron/canonical-render-intent.cjs') as {
  validateCanonicalRenderRequest(value: unknown): any;
  compileCanonicalRenderRequest(value: unknown): { args: string[] };
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { materializeImageDisplayGeometryArgs } = require('../../electron/image-display-geometry-authority.cjs') as {
  materializeImageDisplayGeometryArgs(args: string[], declarations: unknown[], service: unknown, url: string, options?: unknown): string[];
};

const encodedWidth = 64;
const encodedHeight = 32;
const outputSize = 32;
const directory = mkdtempSync(join(tmpdir(), 'shortsflow-framing-oracle-'));
const inputPath = join(directory, 'asymmetric.ppm');
const owner = '00000000-0000-4000-8000-000000000001';
const objectPath = `${owner}/generated-images/00000000-0000-4000-8000-000000000002.jpg`;
const mediaIdentity = `media:${objectPath}`;
const privateUrl = `https://project.supabase.co/storage/v1/object/sign/media/${objectPath}?token=test`;
const authorityReference = `idga1_${'A'.repeat(43)}`;
const contentDigest = 'a'.repeat(64);
type Pixel = readonly [red: number, green: number, blue: number];
const encoded: Pixel[][] = Array.from({ length: encodedHeight }, (_, y) => Array.from({ length: encodedWidth }, (_, x) => {
  const cell = x + y * encodedWidth;
  return [
    24 + ((cell * 17 + x * y * 3) % 208),
    24 + ((cell * 29 + x * x * 5 + y * 7) % 208),
    24 + ((cell * 43 + y * y * 11 + x * 13) % 208),
  ] as const;
}));
writeFileSync(inputPath, Buffer.concat([
  Buffer.from(`P6\n${encodedWidth} ${encodedHeight}\n255\n`, 'ascii'),
  Buffer.from(encoded.flatMap((row) => row.flatMap((pixel) => [...pixel]))),
]));

afterAll(() => rmSync(directory, { recursive: true, force: true }));

const orientations: readonly ImageEncodedToDisplayOrientation[] = [
  'identity', 'mirror-horizontal', 'rotate-180', 'mirror-vertical',
  'transpose', 'rotate-90-cw', 'transverse', 'rotate-90-ccw',
];

describe('FFmpeg image framing pixel oracle', () => {
  it.each(orientations)('selects the intended display-oriented pixels for %s in full and segment execution', (orientation) => {
    const anchors = swaps(orientation)
      ? [{ x: 0.5, y: 0.5 }, { x: 0.5, y: 0 }, { x: 0.5, y: 1 }]
      : [{ x: 0.5, y: 0.5 }, { x: 0, y: 0.5 }, { x: 1, y: 0.5 }];
    for (const anchor of anchors) {
      const framing = anchor.x === 0.5 && anchor.y === 0.5
        ? undefined
        : { version: 1, mode: 'focal-cover', anchor } as ImageFramingV1;
      const expected = expectedCrop(orientation, framing);
      const segment = execute(orientation, framing, 'segment', 'none');
      const full = execute(orientation, framing, 'full', 'none');
      expectPixels(segment, expected);
      expectPixels(full, expected);
      expect(segment).toEqual(full);
    }
  });

  it('moves the existing zoom path baseline window without renderer-authored expressions', () => {
    const left = execute('identity', { version: 1, mode: 'focal-cover', anchor: { x: 0, y: 0.5 } }, 'segment', 'zoom_in');
    const right = execute('identity', { version: 1, mode: 'focal-cover', anchor: { x: 1, y: 0.5 } }, 'segment', 'zoom_in');
    expect(average(left)).toBeLessThan(average(right));
    expect(left).not.toEqual(right);
  });

  it('rejects a mutated framing binding before FFmpeg execution', () => {
    const framing = { version: 1, mode: 'focal-cover', anchor: { x: 0.1, y: 0.9 } } as ImageFramingV1;
    expect(() => execute('identity', framing, 'segment', 'none', {
      ...binding('identity'),
      contentDigest: 'b'.repeat(64),
    })).toThrow(/binding|geometry/i);
  });

  it('uses a fixture that distinguishes all EXIF transforms and detects an omitted transpose', () => {
    const centerByOrientation = orientations.map((orientation) => expectedCrop(orientation));
    for (let left = 0; left < centerByOrientation.length; left += 1) {
      for (let right = left + 1; right < centerByOrientation.length; right += 1) {
        expect(centerByOrientation[left], `${orientations[left]} must differ from ${orientations[right]}`)
          .not.toEqual(centerByOrientation[right]);
      }
    }
    const identityCenter = centerByOrientation[0];
    const transposeCenter = centerByOrientation[4];
    expect(identityCenter).not.toEqual(transposeCenter);

    // Controlled mutation: identity execution models EXIF-5 compilation being
    // omitted. The independently calculated transpose oracle must reject it.
    const omittedTranspose = execute('identity', undefined, 'segment', 'none');
    expect(pixelsWithinTolerance(omittedTranspose, transposeCenter)).toBe(false);
  });
});

function execute(
  orientation: ImageEncodedToDisplayOrientation,
  framing: ImageFramingV1 | undefined,
  kind: 'full' | 'segment',
  cameraMotion: 'none' | 'zoom_in',
  framingBinding = binding(orientation),
): number[] {
  const source = {
    kind: 'private-image', url: privateUrl, geometry: declaration(orientation),
    ...(framing ? { framing, framingBinding } : {}),
  };
  const intent = {
    version: 3, kind, width: outputSize, height: outputSize, durationMs: 100,
    scenes: [{ durationMs: 100, cameraMotion, source }], sceneDurationsMs: [100], transitions: [{ type: 'cut', overlapMs: 0 }], segmentReferences: [], branding: null, subtitleContent: '', audioTracks: [],
    audioSettings: { masterGain: 1, targetLufs: -14, duckingAttackMs: 25, duckingReleaseMs: 250 },
    encoding: { videoCodec: 'h264', audioCodec: 'aac', quality: 'standard', hardwareAcceleration: 'disabled', encoder: null, encoderMode: null, bitrateKbps: null, maxBitrateKbps: null, bufferSizeKbps: null, crf: null, encoderPreset: null, frameRate: 1, pixelFormat: 'yuv444p', gopFrames: null, keyframeInterval: null, threads: null, audioBitrateKbps: 192, sampleRate: 48_000, audioChannels: 2, colorSpace: null, profile: null },
  };
  const request = kind === 'segment'
    ? { operation: 'segment-render', jobId: 'oracle-segment', outputResourceReference: `sgr1_${'B'.repeat(43)}`, intent }
    : { operation: 'full-render', jobId: 'oracle-full', outputPath: join(directory, 'unused.mp4'), intent };
  const compiled = compiler.compileCanonicalRenderRequest(compiler.validateCanonicalRenderRequest(request));
  const chain = kind === 'segment'
    ? compiled.args[compiled.args.indexOf('-vf') + 1]
    : /\[0:v\](.*?)\[v0\]/u.exec(compiled.args[compiled.args.indexOf('-filter_complex') + 1])?.[1];
  if (!chain) throw new Error('Canonical image chain was not compiled.');
  const raw = ['-hide_banner', '-loglevel', 'error', '-noautorotate', '-framerate', '1', '-loop', '1', '-i', privateUrl, '-vf', chain, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'];
  const dimensions = geometryDimensions(orientation);
  const service = { authorize: () => ({
    geometry: { version: 1, mediaIdentity, encodedToDisplay: orientation, ...dimensions },
    contentDigest,
  }) };
  const args = materializeImageDisplayGeometryArgs(raw, [declaration(orientation)], service, 'https://project.supabase.co', { webContentsId: 1 })
    .map((arg: string) => arg === privateUrl ? inputPath : arg);
  const result = spawnSync('ffmpeg', args, { encoding: null, maxBuffer: 4 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`FFmpeg framing oracle failed: ${String(result.stderr)}`);
  return [...result.stdout];
}

function expectedCrop(orientation: ImageEncodedToDisplayOrientation, framing?: ImageFramingV1): number[] {
  const display = orient(encoded, orientation);
  const crop = referenceCropWindow(display[0].length, display.length, outputSize, outputSize, framing);
  const x = Math.round(crop.x * display[0].length);
  const y = Math.round(crop.y * display.length);
  const width = Math.round(crop.width * display[0].length);
  const height = Math.round(crop.height * display.length);
  return display.slice(y, y + height).flatMap((row) => row.slice(x, x + width).flatMap((pixel) => [...pixel]));
}

/** Independent specification oracle; it intentionally does not call production crop helpers. */
function referenceCropWindow(
  displayWidth: number,
  displayHeight: number,
  outputWidth: number,
  outputHeight: number,
  framing?: ImageFramingV1,
) {
  const sourceAspect = displayWidth / displayHeight;
  const targetAspect = outputWidth / outputHeight;
  const width = sourceAspect > targetAspect ? targetAspect / sourceAspect : 1;
  const height = sourceAspect > targetAspect ? 1 : sourceAspect / targetAspect;
  const anchor = framing?.anchor ?? { x: 0.5, y: 0.5 };
  return {
    x: Math.max(0, Math.min(1 - width, anchor.x - width / 2)),
    y: Math.max(0, Math.min(1 - height, anchor.y - height / 2)),
    width,
    height,
  };
}

function orient(source: Pixel[][], orientation: ImageEncodedToDisplayOrientation): Pixel[][] {
  const height = source.length; const width = source[0].length;
  const outputWidth = swaps(orientation) ? height : width;
  const outputHeight = swaps(orientation) ? width : height;
  return Array.from({ length: outputHeight }, (_, y) => Array.from({ length: outputWidth }, (_, x) => {
    if (orientation === 'identity') return source[y][x];
    if (orientation === 'mirror-horizontal') return source[y][width - 1 - x];
    if (orientation === 'rotate-180') return source[height - 1 - y][width - 1 - x];
    if (orientation === 'mirror-vertical') return source[height - 1 - y][x];
    if (orientation === 'transpose') return source[x][y];
    if (orientation === 'rotate-90-cw') return source[height - 1 - x][y];
    if (orientation === 'transverse') return source[height - 1 - x][width - 1 - y];
    return source[x][width - 1 - y];
  }));
}

function declaration(orientation: ImageEncodedToDisplayOrientation) {
  return { inputIndex: 0, authorityReference, mediaIdentity, expectedOrientation: orientation, contentDigest, ...geometryDimensions(orientation) };
}

function binding(orientation: ImageEncodedToDisplayOrientation) {
  return { version: 1 as const, mediaIdentity, contentDigest, encodedToDisplay: orientation, ...geometryDimensions(orientation) };
}

function geometryDimensions(orientation: ImageEncodedToDisplayOrientation) {
  return {
    encodedDimensions: { width: encodedWidth, height: encodedHeight },
    displayDimensions: swaps(orientation)
      ? { width: encodedHeight, height: encodedWidth }
      : { width: encodedWidth, height: encodedHeight },
  };
}

function swaps(orientation: ImageEncodedToDisplayOrientation): boolean {
  return ['transpose', 'rotate-90-cw', 'transverse', 'rotate-90-ccw'].includes(orientation);
}

function expectPixels(actual: number[], expected: number[]): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) => expect(Math.abs(value - expected[index])).toBeLessThanOrEqual(3));
}

function pixelsWithinTolerance(actual: number[], expected: number[]): boolean {
  return actual.length === expected.length
    && actual.every((value, index) => Math.abs(value - expected[index]) <= 3);
}

function average(values: number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}
