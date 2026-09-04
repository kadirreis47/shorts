import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, describe, expect, it } from 'vitest';
import type { ImageEncodedToDisplayOrientation } from '@/core/media';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { materializeImageDisplayGeometryArgs } = require('../../electron/image-display-geometry-authority.cjs') as {
  materializeImageDisplayGeometryArgs(args: string[], declarations: unknown[], service: unknown, url: string, options?: unknown): string[];
};

const directory = mkdtempSync(join(tmpdir(), 'shortsflow-orientation-oracle-'));
const inputPath = join(directory, 'asymmetric.ppm');
const owner = '00000000-0000-4000-8000-000000000001';
const objectPath = `${owner}/generated-images/00000000-0000-4000-8000-000000000002.jpg`;
const mediaIdentity = `media:${objectPath}`;
const privateUrl = `https://project.supabase.co/storage/v1/object/sign/media/${objectPath}?token=test`;
const authorityReference = `idga1_${'A'.repeat(43)}`;
const contentDigest = 'a'.repeat(64);

const colors: Record<string, readonly [number, number, number]> = {
  A: [255, 0, 0], B: [0, 255, 0], C: [0, 0, 255],
  D: [255, 255, 0], E: [255, 0, 255], F: [0, 255, 255],
};
writeFileSync(inputPath, Buffer.concat([
  Buffer.from('P6\n3 2\n255\n', 'ascii'),
  Buffer.from(['A', 'B', 'C', 'D', 'E', 'F'].flatMap((name) => colors[name])),
]));

afterAll(() => rmSync(directory, { recursive: true, force: true }));

const cases: readonly [ImageEncodedToDisplayOrientation, readonly string[], number, number][] = [
  ['identity', ['A', 'B', 'C', 'D', 'E', 'F'], 3, 2],
  ['mirror-horizontal', ['C', 'B', 'A', 'F', 'E', 'D'], 3, 2],
  ['rotate-180', ['F', 'E', 'D', 'C', 'B', 'A'], 3, 2],
  ['mirror-vertical', ['D', 'E', 'F', 'A', 'B', 'C'], 3, 2],
  ['transpose', ['A', 'D', 'B', 'E', 'C', 'F'], 2, 3],
  ['rotate-90-cw', ['D', 'A', 'E', 'B', 'F', 'C'], 2, 3],
  ['transverse', ['F', 'C', 'E', 'B', 'D', 'A'], 2, 3],
  ['rotate-90-ccw', ['C', 'F', 'B', 'E', 'A', 'D'], 2, 3],
];

describe('FFmpeg EXIF orientation pixel oracle', () => {
  it.each(cases)('renders %s pixels identically in full and segment filter forms', (orientation, expected, width, height) => {
    const actualSegment = execute(orientation, 'segment');
    const actualFull = execute(orientation, 'full');
    const oracle = expected.flatMap((name) => colors[name]);
    expect(actualSegment).toEqual(oracle);
    expect(actualFull).toEqual(oracle);
    expect(actualSegment).toHaveLength(width * height * 3);
  });
});

function execute(orientation: ImageEncodedToDisplayOrientation, mode: 'full' | 'segment'): number[] {
  const dimensions = geometryDimensions(orientation);
  const filterArgs = mode === 'segment'
    ? ['-vf', '{{IMAGE_DISPLAY_GEOMETRY_INPUT_0}}']
    : ['-filter_complex', '[0:v]{{IMAGE_DISPLAY_GEOMETRY_INPUT_0}}[videoout]', '-map', '[videoout]'];
  const raw = [
    '-hide_banner', '-loglevel', 'error', '-noautorotate', '-framerate', '1', '-loop', '1', '-t', '0.1', '-i', privateUrl,
    ...filterArgs, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1',
  ];
  const service = {
    authorize(webContentsId: number, reference: string, identity: string, expectedOrientation: string, expectedDigest: string) {
      if (webContentsId !== 1) throw new Error('bad webContents');
      if (reference !== authorityReference || identity !== mediaIdentity || expectedOrientation !== orientation || expectedDigest !== contentDigest) throw new Error('bad authority');
      return { geometry: { version: 1, mediaIdentity, encodedToDisplay: orientation, ...dimensions }, contentDigest };
    },
  };
  const args = materializeImageDisplayGeometryArgs(raw, [{ inputIndex: 0, authorityReference, mediaIdentity, expectedOrientation: orientation, contentDigest, ...dimensions }], service, 'https://project.supabase.co', { webContentsId: 1 })
    .map((arg) => arg === privateUrl ? inputPath : arg);
  const result = spawnSync('ffmpeg', args, { encoding: null, maxBuffer: 1024 * 1024 });
  if (result.status !== 0) throw new Error(`FFmpeg oracle failed: ${String(result.stderr)}`);
  return [...result.stdout];
}

function geometryDimensions(orientation: ImageEncodedToDisplayOrientation) {
  const swaps = ['transpose', 'rotate-90-cw', 'transverse', 'rotate-90-ccw'].includes(orientation);
  return {
    encodedDimensions: { width: 3, height: 2 },
    displayDimensions: swaps ? { width: 2, height: 3 } : { width: 3, height: 2 },
  };
}
