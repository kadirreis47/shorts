import { describe, expect, it } from 'vitest';
import {
  canonicalImageCropFilter,
  createImageDisplayGeometry,
  deriveImageCoverCropWindow,
  imageFramingBindingFromHistoricalGeometry,
  imageFramingBindingFromTrustedGeometry,
  imageFramingBindingMatchesTrustedGeometry,
  imageFramingFromAnchor,
  normalizeImageFramingBinding,
  normalizeImageFraming,
} from '@/core/media';
import { normalizeStudioDraft, type StudioDraft } from '@/lib/studioDraft';
import type { Scene } from '@/lib/types';

const storage = { bucket: 'media' as const, objectPath: '00000000-0000-4000-8000-000000000001/generated-images/00000000-0000-4000-8000-000000000002.jpg' };

describe('canonical image framing V1', () => {
  it('normalizes bounded four-decimal anchors and makes exact center absence', () => {
    expect(normalizeImageFraming({ version: 1, mode: 'focal-cover', anchor: { x: 0.125, y: 0.875 } })).toEqual({
      version: 1, mode: 'focal-cover', anchor: { x: 0.125, y: 0.875 },
    });
    expect(normalizeImageFraming({ version: 1, mode: 'focal-cover', anchor: { x: 0.5, y: 0.5 } })).toBeUndefined();
    expect(imageFramingFromAnchor({ x: 0.123456, y: 0.876543 })).toEqual({
      version: 1, mode: 'focal-cover', anchor: { x: 0.1235, y: 0.8765 },
    });
  });

  it.each([
    null, [], 'framing', { version: 2, mode: 'focal-cover', anchor: { x: 0, y: 0 } },
    { version: 1, mode: 'crop', anchor: { x: 0, y: 0 } },
    { version: 1, mode: 'focal-cover', anchor: { x: -0.1, y: 0 } },
    { version: 1, mode: 'focal-cover', anchor: { x: 0, y: 1.1 } },
    { version: 1, mode: 'focal-cover', anchor: { x: Number.NaN, y: 0 } },
    { version: 1, mode: 'focal-cover', anchor: { x: 0.12345, y: 0 } },
    { version: 1, mode: 'focal-cover', anchor: { x: 0, y: 0 }, crop: 'iw' },
  ])('rejects malformed executable framing %#', (value) => {
    expect(() => normalizeImageFraming(value)).toThrow(/framing|coordinate/i);
  });

  it('rejects prototype-shaped objects', () => {
    const value = Object.assign(Object.create({ crop: 'movie=secret' }), {
      version: 1, mode: 'focal-cover', anchor: { x: 0.2, y: 0.5 },
    });
    expect(() => normalizeImageFraming(value)).toThrow(/framing/i);
  });

  it('derives deterministic legal cover windows in display-oriented normalized space', () => {
    expect(deriveImageCoverCropWindow({ width: 200, height: 100 }, { width: 100, height: 100 }, imageFramingFromAnchor({ x: 0, y: 0.8 }))).toEqual({ x: 0, y: 0, width: 0.5, height: 1 });
    expect(deriveImageCoverCropWindow({ width: 100, height: 200 }, { width: 100, height: 100 }, imageFramingFromAnchor({ x: 0.8, y: 1 }))).toEqual({ x: 0, y: 0.5, width: 1, height: 0.5 });
    expect(deriveImageCoverCropWindow({ width: 100, height: 100 }, { width: 100, height: 100 })).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });

  it('compiles only a fixed crop template from canonical numeric data', () => {
    expect(canonicalImageCropFilter(1080, 1920)).toBe('crop=1080:1920');
    expect(canonicalImageCropFilter(1080, 1920, imageFramingFromAnchor({ x: 0.1, y: 0.9 })))
      .toBe("crop=1080:1920:x='min(max(0.1*iw-1080/2,0),iw-1080)':y='min(max(0.9*ih-1920/2,0),ih-1920)'");
  });

  it('hydrates framing tolerantly only for private image scenes', () => {
    const geometry = trustedGeometry();
    const image = scene({
      imageStorage: storage,
      imageDisplayGeometry: geometry,
      imageFraming: imageFramingFromAnchor({ x: 0.2, y: 0.7 }),
      imageFramingBinding: imageFramingBindingFromTrustedGeometry(geometry),
    });
    const persisted = normalizeStudioDraft(draft(image)).scenes[0];
    expect(persisted.imageDisplayGeometry).toBeUndefined();
    expect(persisted.imageFraming).toEqual(image.imageFraming);
    expect(persisted.imageFramingBinding).toEqual(image.imageFramingBinding);
    expect(normalizeStudioDraft(draft(persisted)).scenes[0]).toMatchObject({
      imageFraming: image.imageFraming,
      imageFramingBinding: image.imageFramingBinding,
    });
    expect(normalizeStudioDraft(draft(scene({ imageStorage: storage, imageFraming: { version: 1, mode: 'focal-cover', anchor: { x: 0.5, y: 0.5 } } as any }))).scenes[0].imageFraming).toBeUndefined();
    expect(normalizeStudioDraft(draft(scene({ imageStorage: storage, imageFraming: { version: 1, mode: 'focal-cover', anchor: { x: 2, y: 0 } } as any }))).scenes[0].imageFraming).toBeUndefined();
    expect(normalizeStudioDraft(draft(scene({ videoStorage: { bucket: 'media', objectPath: 'owner/videos/id.mp4' }, imageFraming: imageFramingFromAnchor({ x: 0.2, y: 0.7 }) }))).scenes[0].imageFraming).toBeUndefined();
    expect(normalizeStudioDraft(draft(scene({ imageFraming: imageFramingFromAnchor({ x: 0.2, y: 0.7 }) }))).scenes[0].imageFraming).toBeUndefined();
  });

  it('keeps immutable framing identity separate from expiring execution authority', () => {
    const geometry = trustedGeometry();
    const binding = imageFramingBindingFromTrustedGeometry(geometry);
    const expired = {
      ...geometry,
      executionAuthority: { ...geometry.executionAuthority, expiresAt: '2020-01-01T00:00:00.000Z' },
    };
    const rotated = {
      ...geometry,
      executionAuthority: { ...geometry.executionAuthority, reference: `idga1_${'B'.repeat(43)}` },
    };
    expect(imageFramingBindingFromHistoricalGeometry(expired)).toEqual(binding);
    expect(imageFramingBindingMatchesTrustedGeometry(binding, expired)).toBe(false);
    expect(imageFramingBindingMatchesTrustedGeometry(binding, rotated)).toBe(true);
    expect(() => normalizeImageFramingBinding({ ...binding, contentDigest: 'bad' })).toThrow(/binding/i);
  });

  it('fails tolerant persistence closed when a meaningful framing binding is missing or malformed', () => {
    const framing = imageFramingFromAnchor({ x: 0.2, y: 0.7 });
    const missing = normalizeStudioDraft(draft(scene({ imageStorage: storage, imageFraming: framing }))).scenes[0];
    expect(missing.imageFraming).toBeUndefined();
    expect(missing.imageFramingBinding).toBeUndefined();
    const malformed = normalizeStudioDraft(draft(scene({
      imageStorage: storage,
      imageFraming: framing,
      imageFramingBinding: { version: 1, mediaIdentity: `media:${storage.objectPath}`, contentDigest: 'bad' } as any,
    }))).scenes[0];
    expect(malformed.imageFraming).toBeUndefined();
    expect(malformed.imageFramingBinding).toBeUndefined();
  });
});

function scene(overrides: Partial<Scene>): Scene {
  return { sceneId: 'scene-00000000-0000-4000-8000-000000000001', text: 'Scene', duration: 5, visual: '', keywords: [], ...overrides };
}

function draft(value: Scene): StudioDraft {
  return {
    version: 1, projectId: 'project', savedAt: '2026-09-04T00:00:00.000Z', step: 'script', channelId: '', topic: '', niche: '', tone: '', duration: 5,
    title: '', hook: '', script: '', cta: '', scenes: [value], captionStyle: 'karaoke', transitionStyle: 'none', motionStyle: 'static', useBroll: false,
    musicId: '', musicVolume: 0.25, visualMode: 'auto', selectedStyleId: '', characterName: '', characterAppearance: '', characterArtStyle: '', characterProfileId: '',
    watermarkText: '', watermarkPosition: 'bottom-right', showSubtitles: false, captionTextColor: '', captionHighlightColor: '', beatSync: false,
    voiceoverMode: 'none', selectedVoice: '', targetLanguage: 'en',
  };
}

function trustedGeometry() {
  return {
    ...createImageDisplayGeometry(`media:${storage.objectPath}`, 300, 200, 'identity'),
    contentDigest: 'a'.repeat(64),
    executionAuthority: {
      version: 1 as const,
      reference: `idga1_${'A'.repeat(43)}`,
      expiresAt: '2099-01-01T00:00:00.000Z',
    },
  };
}
