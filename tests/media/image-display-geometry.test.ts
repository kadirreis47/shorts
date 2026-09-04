import { describe, expect, it } from 'vitest';
import {
  createImageDisplayGeometry,
  encodedPointToDisplay,
  encodedRegionToDisplay,
  imageOrientationFilters,
  imageOrientationFromExif,
  normalizeImageDisplayGeometry,
  type ImageEncodedToDisplayOrientation,
} from '@/core/media';

const MEDIA = 'media:00000000-0000-4000-8000-000000000001/generated-images/00000000-0000-4000-8000-000000000002.jpg';
const orientations: readonly ImageEncodedToDisplayOrientation[] = [
  'identity', 'mirror-horizontal', 'rotate-180', 'mirror-vertical',
  'transpose', 'rotate-90-cw', 'transverse', 'rotate-90-ccw',
];

describe('canonical image display geometry', () => {
  it.each(orientations.map((orientation, index) => [index + 1, orientation] as const))('maps EXIF %s to %s', (exif, orientation) => {
    expect(imageOrientationFromExif(exif)).toBe(orientation);
    const geometry = createImageDisplayGeometry(MEDIA, 1200, 800, orientation);
    expect(geometry.displayDimensions).toEqual(exif >= 5 ? { width: 800, height: 1200 } : { width: 1200, height: 800 });
    expect(normalizeImageDisplayGeometry(geometry, MEDIA)).toEqual(geometry);
  });

  it.each([
    ['identity', { x: .2, y: .3 }],
    ['mirror-horizontal', { x: .8, y: .3 }],
    ['rotate-180', { x: .8, y: .7 }],
    ['mirror-vertical', { x: .2, y: .7 }],
    ['transpose', { x: .3, y: .2 }],
    ['rotate-90-cw', { x: .7, y: .2 }],
    ['transverse', { x: .7, y: .8 }],
    ['rotate-90-ccw', { x: .3, y: .8 }],
  ] as const)('transforms a point for %s', (orientation, expected) => {
    expect(encodedPointToDisplay({ x: .2, y: .3 }, orientation)).toEqual(expected);
  });

  it('preserves normalized corner bounds and transforms mirrored regions', () => {
    for (const orientation of orientations) {
      for (const point of [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }]) {
        const transformed = encodedPointToDisplay(point, orientation);
        expect(transformed.x).toBeGreaterThanOrEqual(0); expect(transformed.x).toBeLessThanOrEqual(1);
        expect(transformed.y).toBeGreaterThanOrEqual(0); expect(transformed.y).toBeLessThanOrEqual(1);
      }
    }
    const region = encodedRegionToDisplay({ x: .1, y: .2, width: .3, height: .4 }, 'transpose');
    expect(region.x).toBeCloseTo(.2); expect(region.y).toBeCloseTo(.1);
    expect(region.width).toBeCloseTo(.4); expect(region.height).toBeCloseTo(.3);
  });

  it.each([
    ['identity', { x: .1, y: .2, width: .3, height: .4 }],
    ['mirror-horizontal', { x: .6, y: .2, width: .3, height: .4 }],
    ['rotate-180', { x: .6, y: .4, width: .3, height: .4 }],
    ['mirror-vertical', { x: .1, y: .4, width: .3, height: .4 }],
    ['transpose', { x: .2, y: .1, width: .4, height: .3 }],
    ['rotate-90-cw', { x: .4, y: .1, width: .4, height: .3 }],
    ['transverse', { x: .4, y: .6, width: .4, height: .3 }],
    ['rotate-90-ccw', { x: .2, y: .6, width: .4, height: .3 }],
  ] as const)('transforms a normalized region for %s', (orientation, expected) => {
    const actual = encodedRegionToDisplay({ x: .1, y: .2, width: .3, height: .4 }, orientation);
    expect(actual.x).toBeCloseTo(expected.x); expect(actual.y).toBeCloseTo(expected.y);
    expect(actual.width).toBeCloseTo(expected.width); expect(actual.height).toBeCloseTo(expected.height);
  });

  it('uses exact mirrored FFmpeg transforms and rejects forged contracts', () => {
    expect(imageOrientationFilters('mirror-horizontal')).toEqual(['hflip']);
    expect(imageOrientationFilters('transpose')).toEqual(['transpose=clock', 'hflip']);
    expect(imageOrientationFilters('transverse')).toEqual(['transpose=clock', 'vflip']);
    const valid = createImageDisplayGeometry(MEDIA, 1200, 800, 'rotate-90-cw');
    for (const malformed of [
      { ...valid, mediaIdentity: MEDIA.replace('.jpg', '.png') },
      { ...valid, encodedToDisplay: 'rotate-45' },
      { ...valid, displayDimensions: { width: 1200, height: 800 } },
      { ...valid, requestId: 'forbidden' },
    ]) expect(() => normalizeImageDisplayGeometry(malformed, MEDIA)).toThrow(/invalid|inconsistent/u);
  });
});
