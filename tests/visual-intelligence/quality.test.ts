import { describe, expect, it } from 'vitest';
import { assessVisualQuality, cropBurdenForPortrait, type QualityCandidateFacts } from '@/core/visual-intelligence';

const base: QualityCandidateFacts = {
  candidateId: 'pexels:video:42', mediaType: 'video', orientation: 'portrait', width: 1080, height: 1920,
  durationMs: 6_000, descriptor: 'tram in rain', conceptPriorities: [1], providerRanks: [1],
};

describe('visual quality assessment', () => {
  it('is deterministic, bounded, factual, and has no fabricated semantic signals', () => {
    const first = assessVisualQuality({ candidate: base, brief: { preferredMedia: 'video' } });
    const second = assessVisualQuality({ candidate: base, brief: { preferredMedia: 'video' } });
    expect(first).toEqual(second);
    expect(first).toMatchObject({ grade: 'excellent', hardRejected: false });
    expect(first.score).toBeGreaterThanOrEqual(0);
    expect(first.score).toBeLessThanOrEqual(100);
    expect(first.rankingAdjustment).toBeGreaterThanOrEqual(-40);
    expect(first.rankingAdjustment).toBeLessThanOrEqual(40);
    expect(first.reasons).toEqual(expect.arrayContaining(['high-resolution', 'vertical-native', 'duration-fit', 'media-preference-match', 'strong-query-evidence']));
    expect(JSON.stringify(first)).not.toMatch(/subject|mood|cinematic|https?:\/\//i);
  });

  it('measures portrait crop burden without claiming composition quality', () => {
    expect(cropBurdenForPortrait(1080, 1920)).toBeCloseTo(0, 6);
    expect(cropBurdenForPortrait(1920, 1080)).toBeGreaterThan(0.65);
    const landscape = assessVisualQuality({ candidate: { ...base, orientation: 'landscape', width: 1920, height: 1080 }, brief: { preferredMedia: 'either' } });
    expect(landscape.reasons).toEqual(expect.arrayContaining(['heavy-crop-required']));
    expect(landscape.reasons).not.toEqual(expect.arrayContaining(['vertical-native']));
  });

  it('uses soft penalties for imperfect resolution, duration, preference, and missing metadata', () => {
    const limited = assessVisualQuality({ candidate: { ...base, width: 640, height: 360, durationMs: 25_000, descriptor: undefined, mediaType: 'video' }, brief: { preferredMedia: 'image' }, repeatedAcrossScenes: true });
    expect(limited.hardRejected).toBe(false);
    expect(limited.reasons).toEqual(expect.arrayContaining(['low-resolution', 'heavy-crop-required', 'duration-mismatch', 'media-preference-mismatch', 'metadata-incomplete', 'repeated-visual']));
    expect(limited.grade).not.toBe('excellent');
  });

  it('hard-rejects only impossible technical metadata and unusably short video', () => {
    const malformed = assessVisualQuality({ candidate: { ...base, width: 0 }, brief: { preferredMedia: 'video' } });
    const tooShort = assessVisualQuality({ candidate: { ...base, durationMs: 200 }, brief: { preferredMedia: 'video' } });
    expect(malformed).toMatchObject({ hardRejected: true, grade: 'reject', score: 0 });
    expect(tooShort).toMatchObject({ hardRejected: true, grade: 'reject', score: 0 });
  });
});
