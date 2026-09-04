import { describe, expect, it } from 'vitest';
import {
  createImageFramingApplicationProposal,
  createVisualSpatialEvidenceRecord,
  isImageFramingApplicationProposalCurrent,
  type CreateImageFramingApplicationProposalInput,
} from '@/core/visual-intelligence';
import {
  encodedPointToDisplay,
  imageOrientationFromExif,
  type ImageEncodedToDisplayOrientation,
} from '@/core/media/imageDisplayGeometry';
import { deriveImageCoverCropWindow, imageFramingBindingFromTrustedGeometry, imageFramingFromAnchor } from '@/core/media/imageFraming';
import type { Scene } from '@/lib/types';

const NOW = Date.parse('2026-09-04T12:00:00.000Z');
const PROJECT = 'studio-project-spatial-framing';
const SCENE_ID = 'visual-scene-11111111-1111-4111-8111-111111111111';
const STORAGE = {
  bucket: 'media' as const,
  objectPath: '00000000-0000-4000-8000-000000000001/generated-images/00000000-0000-4000-8000-000000000002.jpg',
};
const OUTPUT = { width: 1080, height: 1920 } as const;
const ORIENTATIONS: readonly ImageEncodedToDisplayOrientation[] = [
  'identity', 'mirror-horizontal', 'rotate-180', 'mirror-vertical',
  'transpose', 'rotate-90-cw', 'transverse', 'rotate-90-ccw',
];

describe('Spatial image framing application proposal', () => {
  it.each(ORIENTATIONS.map((orientation, index) => [index + 1, orientation] as const))(
    'transforms EXIF %i focal evidence into display space',
    (exif, orientation) => {
      expect(imageOrientationFromExif(exif)).toBe(orientation);
      const input = proposalInput({ orientation, focalPoint: { x: 0.2, y: 0.3 } });
      const proposal = createImageFramingApplicationProposal(input);
      expect(proposal.status).toBe('ready');
      expect(proposal.displayFocalPoint).toEqual(encodedPointToDisplay({ x: 0.2, y: 0.3 }, orientation));
    },
  );

  it.each(['mirror-horizontal', 'mirror-vertical', 'transpose', 'transverse'] as const)(
    'keeps mirrored %s subject rectangles display-oriented and bounded',
    (orientation) => {
      const proposal = createImageFramingApplicationProposal(proposalInput({
        orientation,
        focalPoint: { x: 0.25, y: 0.35 },
        subjectRegion: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
      }));
      expect(proposal.status).toBe('ready');
      const expected = orientation === 'mirror-horizontal' ? { x: 0.6, y: 0.2, width: 0.3, height: 0.4 }
          : orientation === 'mirror-vertical' ? { x: 0.1, y: 0.4, width: 0.3, height: 0.4 }
            : orientation === 'transpose' ? { x: 0.2, y: 0.1, width: 0.4, height: 0.3 }
              : { x: 0.4, y: 0.6, width: 0.4, height: 0.3 };
      expect(proposal.displaySubjectRegion!.x).toBeCloseTo(expected.x);
      expect(proposal.displaySubjectRegion!.y).toBeCloseTo(expected.y);
      expect(proposal.displaySubjectRegion!.width).toBeCloseTo(expected.width);
      expect(proposal.displaySubjectRegion!.height).toBeCloseTo(expected.height);
    },
  );

  it('handles landscape-to-portrait and portrait-to-portrait deterministically', () => {
    const landscape = createImageFramingApplicationProposal(proposalInput({ focalPoint: { x: 0.15, y: 0.5 } }));
    const portrait = createImageFramingApplicationProposal(proposalInput({
      encodedWidth: 1080, encodedHeight: 1920, focalPoint: { x: 0.15, y: 0.5 },
    }));
    expect(landscape).toMatchObject({ status: 'ready', proposedFraming: { anchor: { x: 0.1875, y: 0.5 } } });
    expect(portrait).toMatchObject({ status: 'no-op', reason: 'center-equivalent', proposedFraming: undefined });
  });

  it('moves along the legal crop axis for a portrait image narrower than the output aspect', () => {
    const proposal = createImageFramingApplicationProposal(proposalInput({
      encodedWidth: 800, encodedHeight: 1600, focalPoint: { x: 0.5, y: 0.05 },
    }));
    expect(proposal).toMatchObject({ status: 'ready', proposedFraming: { anchor: { x: 0.5, y: 0.4444 } } });
  });

  it.each([
    ['center', { x: 0.5, y: 0.5 }, 'no-op'],
    ['left', { x: 0, y: 0.5 }, 'ready'],
    ['right', { x: 1, y: 0.5 }, 'ready'],
    ['top', { x: 0.25, y: 0 }, 'ready'],
    ['bottom', { x: 0.75, y: 1 }, 'ready'],
  ] as const)('handles focal %s without clamping malformed evidence', (_label, focalPoint, status) => {
    const proposal = createImageFramingApplicationProposal(proposalInput({ focalPoint }));
    expect(proposal.status).toBe(status);
  });

  it.each([
    ['left', { x: 0, y: 0.5 }],
    ['right', { x: 1, y: 0.5 }],
  ] as const)('keeps an exact %s-edge focal point inside the final canonical crop for a non-terminating horizontal aspect', (_label, focalPoint) => {
    const input = proposalInput({ encodedWidth: 1350, encodedHeight: 800, focalPoint });
    const proposal = createImageFramingApplicationProposal(input);
    expect(proposal.status).toBe('ready');
    const crop = deriveImageCoverCropWindow({ width: 1350, height: 800 }, OUTPUT, proposal.proposedFraming);
    expectCropToContainPoint(crop, focalPoint);
  });

  it.each([
    ['top', { x: 0.5, y: 0 }],
    ['bottom', { x: 0.5, y: 1 }],
  ] as const)('keeps an exact %s-edge focal point inside the final canonical crop for a non-terminating vertical aspect', (_label, focalPoint) => {
    const input = proposalInput({ encodedWidth: 1000, encodedHeight: 1900, focalPoint });
    const proposal = createImageFramingApplicationProposal(input);
    expect(proposal.status).toBe('ready');
    const crop = deriveImageCoverCropWindow({ width: 1000, height: 1900 }, OUTPUT, proposal.proposedFraming);
    expectCropToContainPoint(crop, focalPoint);
  });

  it.each([
    ['left', { x: 0.02, y: 0.2, width: 0.1, height: 0.6 }, { x: 0.07, y: 0.5 }],
    ['right', { x: 0.88, y: 0.2, width: 0.1, height: 0.6 }, { x: 0.93, y: 0.5 }],
  ] as const)('preserves the safe subject inset at the %s canonical horizontal boundary', (_label, subjectRegion, focalPoint) => {
    const proposal = createImageFramingApplicationProposal(proposalInput({
      encodedWidth: 1350, encodedHeight: 800, focalPoint, subjectRegion,
    }));
    const crop = deriveImageCoverCropWindow({ width: 1350, height: 800 }, OUTPUT, proposal.proposedFraming);
    expectCropToContainPoint(crop, focalPoint);
    expectCropToContainSafeSubject(crop, subjectRegion);
  });

  it.each([
    ['top', { x: 0.2, y: 0.05, width: 0.6, height: 0.1 }, { x: 0.5, y: 0.1 }],
    ['bottom', { x: 0.2, y: 0.85, width: 0.6, height: 0.1 }, { x: 0.5, y: 0.9 }],
  ] as const)('preserves the safe subject inset at the %s canonical vertical boundary', (_label, subjectRegion, focalPoint) => {
    const proposal = createImageFramingApplicationProposal(proposalInput({
      encodedWidth: 1000, encodedHeight: 1900, focalPoint, subjectRegion,
    }));
    const crop = deriveImageCoverCropWindow({ width: 1000, height: 1900 }, OUTPUT, proposal.proposedFraming);
    expectCropToContainPoint(crop, focalPoint);
    expectCropToContainSafeSubject(crop, subjectRegion);
  });

  it('evaluates safe-subject feasibility on the canonical lattice', () => {
    const subjectRegion = { x: 0.2, y: 0.2, width: 0.3115, height: 0.6 };
    const focalPoint = { x: 0.3557, y: 0.5 };
    const input = proposalInput({ encodedWidth: 1300, encodedHeight: 800, focalPoint, subjectRegion });
    const first = createImageFramingApplicationProposal(input);
    const second = createImageFramingApplicationProposal(input);
    const crop = deriveImageCoverCropWindow({ width: 1300, height: 800 }, OUTPUT, first.proposedFraming);
    expectCropToContainPoint(crop, focalPoint);
    expectCropNotToContainSafeSubject(crop, subjectRegion);
    expect(second).toEqual(first);
  });

  it('keeps an oversized subject deterministic without sacrificing final focal visibility', () => {
    const focalPoint = { x: 0.82, y: 0.5 };
    const subjectRegion = { x: 0.05, y: 0.05, width: 0.9, height: 0.9 };
    const input = proposalInput({ encodedWidth: 1350, encodedHeight: 800, focalPoint, subjectRegion });
    const first = createImageFramingApplicationProposal(input);
    const crop = deriveImageCoverCropWindow({ width: 1350, height: 800 }, OUTPUT, first.proposedFraming);
    expectCropToContainPoint(crop, focalPoint);
    expect(createImageFramingApplicationProposal(input)).toEqual(first);
  });

  it('prefers safe full-subject containment near an edge', () => {
    const proposal = createImageFramingApplicationProposal(proposalInput({
      focalPoint: { x: 0.12, y: 0.5 }, subjectRegion: { x: 0.02, y: 0.2, width: 0.16, height: 0.6 },
    }));
    expect(proposal.status).toBe('ready');
    expect(proposal.proposedFraming!.anchor.x).toBeLessThan(0.5);
    const crop = deriveImageCoverCropWindow({ width: 1200, height: 800 }, OUTPUT, proposal.proposedFraming);
    expect(0.02 - crop.width * 0.05).toBeGreaterThanOrEqual(crop.x - 1e-12);
    expect(0.18 + crop.width * 0.05).toBeLessThanOrEqual(crop.x + crop.width + 1e-12);
  });

  it('maximizes overlap for an oversized subject while preserving the focal point', () => {
    const proposal = createImageFramingApplicationProposal(proposalInput({
      focalPoint: { x: 0.82, y: 0.5 }, subjectRegion: { x: 0.05, y: 0.05, width: 0.9, height: 0.9 },
    }));
    expect(proposal.status).toBe('ready');
    expect(proposal.proposedFraming!.anchor.x).toBeGreaterThan(0.5);
  });

  it('uses focal-only evidence and returns no-op when the canonical result already matches', () => {
    const initial = proposalInput({ focalPoint: { x: 0.2, y: 0.5 } });
    const first = createImageFramingApplicationProposal(initial);
    const framedScene = withFraming(initial.scenes[0], first.proposedFraming!);
    const second = createImageFramingApplicationProposal({ ...initial, scenes: [framedScene] });
    expect(first.displaySubjectRegion).toBeUndefined();
    expect(second).toMatchObject({ status: 'no-op', reason: 'already-matches' });
  });

  it('treats a center-equivalent recommendation as no-op even when current framing is meaningful', () => {
    const input = proposalInput({ focalPoint: { x: 0.5, y: 0.5 } });
    const framed = withFraming(input.scenes[0], imageFramingFromAnchor({ x: 0.2, y: 0.5 })!);
    expect(createImageFramingApplicationProposal({ ...input, scenes: [framed] })).toMatchObject({
      status: 'no-op', reason: 'center-equivalent', proposedFraming: undefined,
    });
  });

  it.each([
    ['missing focal point', (input: any) => { delete input.evidence.response.focalPoint; }],
    ['malformed focal point', (input: any) => { input.evidence.response.focalPoint = { x: -1, y: 0.5 }; }],
    ['encoded dimension mismatch', (input: any) => { input.evidence.response.sourceDimensions.width += 1; }],
    ['unavailable geometry', (input: any) => { delete input.scenes[0].imageDisplayGeometry; }],
    ['invalid image', (input: any) => { input.scenes[0].videoStorage = { bucket: 'media', objectPath: 'owner/videos/a.mp4' }; }],
  ])('rejects %s', (_label, mutate) => {
    const input = mutableInput(proposalInput({ focalPoint: { x: 0.2, y: 0.5 } }));
    mutate(input);
    expect(createImageFramingApplicationProposal(input).status).toBe('invalid');
  });

  it('reports unavailable Spatial responses without proposing framing', () => {
    const input = proposalInput({ focalPoint: { x: 0.2, y: 0.5 } });
    const unavailable = createVisualSpatialEvidenceRecord(input.evidence!.binding, {
      status: 'unavailable', reason: 'provider-unavailable', contractVersion: 'visual-spatial-v1',
    });
    const proposal = createImageFramingApplicationProposal({ ...input, evidence: unavailable });
    expect(proposal).toMatchObject({ status: 'unavailable', reason: 'spatial-evidence-unavailable' });
    expect(proposal.proposedFraming).toBeUndefined();
  });

  it('rejects discovery-candidate evidence at the canonical-image proposal boundary', () => {
    const input = proposalInput({ focalPoint: { x: 0.2, y: 0.5 } });
    const candidateEvidence = createVisualSpatialEvidenceRecord({
      projectId: PROJECT, sceneId: SCENE_ID, sceneIndex: 0,
      scope: 'discovery-candidate-image', mediaIdentity: 'pexels:image:42',
    }, input.evidence!.response);
    const proposal = createImageFramingApplicationProposal({ ...input, evidence: candidateEvidence });
    expect(proposal).toMatchObject({ status: 'invalid', reason: 'invalid-evidence' });
    expect(proposal).not.toHaveProperty('proposedFraming');
  });

  it.each([
    ['project switch', (input: any) => { input.projectId = 'studio-project-switched'; }],
    ['media replacement', (input: any) => { input.scenes[0].imageStorage.objectPath = STORAGE.objectPath.replace('000000000002', '000000000099'); }],
    ['digest change', (input: any) => { input.scenes[0].imageDisplayGeometry.contentDigest = 'b'.repeat(64); }],
    ['orientation change', (input: any) => { input.scenes[0].imageDisplayGeometry.encodedToDisplay = 'rotate-180'; }],
    ['encoded dimensions change', (input: any) => { input.scenes[0].imageDisplayGeometry.encodedDimensions.width = 1201; input.scenes[0].imageDisplayGeometry.displayDimensions.width = 1201; }],
    ['display dimensions change', (input: any) => { input.scenes[0].imageDisplayGeometry.displayDimensions.width = 1201; }],
    ['output dimensions change', (input: any) => { input.outputDimensions.width = 720; }],
    ['motion change', (input: any) => { input.effectiveMotion = 'static'; }],
    ['evidence replacement', (input: any) => { input.evidence.response.focalPoint.x = 0.3; }],
    ['analyzer change', (input: any) => { input.evidence.response.analyzerVersion = 'openai:gpt-next'; }],
    ['confidence change', (input: any) => { input.evidence.response.confidenceBand = 'high'; }],
    ['subject region change', (input: any) => { input.evidence.response.primarySubjectRegion = { x: 0.1, y: 0.1, width: 0.2, height: 0.2 }; }],
  ])('stales after %s', (_label, mutate) => {
    const input = proposalInput({ focalPoint: { x: 0.2, y: 0.5 } });
    const proposal = createImageFramingApplicationProposal(input);
    const changed = mutableInput(input);
    mutate(changed);
    expect(isImageFramingApplicationProposalCurrent(proposal, changed)).toBe(false);
  });

  it('stales after framing or binding semantics change', () => {
    const input = proposalInput({ focalPoint: { x: 0.2, y: 0.5 } });
    const proposal = createImageFramingApplicationProposal(input);
    const framingChanged = { ...input, scenes: [withFraming(input.scenes[0], imageFramingFromAnchor({ x: 0.8, y: 0.5 })!)] };
    expect(isImageFramingApplicationProposalCurrent(proposal, framingChanged)).toBe(false);
    const invalidBinding = mutableInput(framingChanged);
    invalidBinding.scenes[0].imageFramingBinding.contentDigest = 'c'.repeat(64);
    expect(isImageFramingApplicationProposalCurrent(createImageFramingApplicationProposal(framingChanged), invalidBinding)).toBe(false);
  });

  it('stales on deletion, index reuse, and reorder', () => {
    const input = proposalInput({ focalPoint: { x: 0.2, y: 0.5 } });
    const proposal = createImageFramingApplicationProposal(input);
    expect(isImageFramingApplicationProposalCurrent(proposal, { ...input, scenes: [] })).toBe(false);
    expect(isImageFramingApplicationProposalCurrent(proposal, { ...input, scenes: [{ ...input.scenes[0], sceneId: SCENE_ID.replace('11111111', '22222222') }] })).toBe(false);
    const other = { ...input.scenes[0], sceneId: 'visual-scene-22222222-2222-4222-8222-222222222222' };
    expect(isImageFramingApplicationProposalCurrent(proposal, { ...input, scenes: [other, input.scenes[0]], sceneIndex: 1 })).toBe(false);
  });

  it('is neutral to live capability rotation with identical immutable geometry', () => {
    const input = proposalInput({ focalPoint: { x: 0.2, y: 0.5 } });
    const proposal = createImageFramingApplicationProposal(input);
    const rotated = mutableInput(input);
    rotated.scenes[0].imageDisplayGeometry.executionAuthority = {
      version: 1, reference: `idga1_${'B'.repeat(43)}`, expiresAt: '2026-09-04T14:00:00.000Z',
    };
    expect(isImageFramingApplicationProposalCurrent(proposal, rotated)).toBe(true);
  });

  it('is neutral to semantically equivalent framing bindings', () => {
    const base = proposalInput({ focalPoint: { x: 0.8, y: 0.5 } });
    const framed = withFraming(base.scenes[0], imageFramingFromAnchor({ x: 0.2, y: 0.5 })!);
    const input = { ...base, scenes: [framed] };
    const proposal = createImageFramingApplicationProposal(input);
    const binding = framed.imageFramingBinding!;
    const equivalent = {
      encodedToDisplay: binding.encodedToDisplay,
      displayDimensions: { ...binding.displayDimensions },
      encodedDimensions: { ...binding.encodedDimensions },
      contentDigest: binding.contentDigest,
      mediaIdentity: binding.mediaIdentity,
      version: binding.version,
    };
    expect(isImageFramingApplicationProposalCurrent(proposal, {
      ...input, scenes: [{ ...framed, imageFramingBinding: equivalent }],
    })).toBe(true);
  });

  it('rejects a proposal whose advisory payload was changed without recomputation', () => {
    const input = proposalInput({ focalPoint: { x: 0.2, y: 0.5 } });
    const proposal = createImageFramingApplicationProposal(input);
    const tampered = {
      ...proposal,
      proposedFraming: imageFramingFromAnchor({ x: 0.8, y: 0.5 }),
    };
    expect(isImageFramingApplicationProposalCurrent(tampered, input)).toBe(false);
  });

  it('is advisory: proposal creation neither mutates Scene nor creates a framing binding', () => {
    const input = proposalInput({ focalPoint: { x: 0.2, y: 0.5 } });
    const before = structuredClone(input.scenes);
    const proposal = createImageFramingApplicationProposal(input);
    expect(input.scenes).toEqual(before);
    expect(proposal).not.toHaveProperty('imageFramingBinding');
    expect(input.scenes[0].imageFramingBinding).toBeUndefined();
  });
});

function proposalInput(options: {
  orientation?: ImageEncodedToDisplayOrientation;
  encodedWidth?: number;
  encodedHeight?: number;
  focalPoint: { x: number; y: number };
  subjectRegion?: { x: number; y: number; width: number; height: number };
}): CreateImageFramingApplicationProposalInput {
  const scene = imageScene(options.orientation ?? 'identity', options.encodedWidth ?? 1200, options.encodedHeight ?? 800);
  const evidence = createVisualSpatialEvidenceRecord({
    projectId: PROJECT, sceneId: SCENE_ID, sceneIndex: 0, scope: 'applied-image', mediaIdentity: `media:${STORAGE.objectPath}`,
  }, {
    status: 'evaluated', contractVersion: 'visual-spatial-v1', analyzerVersion: 'openai:gpt-test',
    sourceDimensions: { width: options.encodedWidth ?? 1200, height: options.encodedHeight ?? 800 },
    focalPoint: options.focalPoint, primarySubjectRegion: options.subjectRegion ?? null, confidenceBand: 'low',
  });
  return { projectId: PROJECT, scenes: [scene], sceneIndex: 0, outputDimensions: OUTPUT, effectiveMotion: 'kenburns', evidence, now: NOW };
}

function imageScene(orientation: ImageEncodedToDisplayOrientation, width: number, height: number): Scene {
  const swap = ['transpose', 'rotate-90-cw', 'transverse', 'rotate-90-ccw'].includes(orientation);
  return {
    sceneId: SCENE_ID, text: 'Scene', duration: 5, visual: '', keywords: [], imageStorage: STORAGE, imageUrl: 'https://signed.example/image.jpg',
    imageDisplayGeometry: {
      version: 1, mediaIdentity: `media:${STORAGE.objectPath}`, contentDigest: 'a'.repeat(64),
      encodedDimensions: { width, height }, displayDimensions: swap ? { width: height, height: width } : { width, height }, encodedToDisplay: orientation,
      executionAuthority: { version: 1, reference: `idga1_${'A'.repeat(43)}`, expiresAt: '2026-09-04T13:00:00.000Z' },
    },
  };
}

function withFraming(scene: Scene, framing: NonNullable<Scene['imageFraming']>): Scene {
  return { ...scene, imageFraming: framing, imageFramingBinding: imageFramingBindingFromTrustedGeometry(scene.imageDisplayGeometry, undefined, NOW) };
}

function mutableInput(input: CreateImageFramingApplicationProposalInput): any {
  return structuredClone(input);
}

function expectCropToContainPoint(
  crop: ReturnType<typeof deriveImageCoverCropWindow>,
  point: { x: number; y: number },
): void {
  expect(point.x).toBeGreaterThanOrEqual(crop.x);
  expect(point.x).toBeLessThanOrEqual(crop.x + crop.width);
  expect(point.y).toBeGreaterThanOrEqual(crop.y);
  expect(point.y).toBeLessThanOrEqual(crop.y + crop.height);
}

function expectCropToContainSafeSubject(
  crop: ReturnType<typeof deriveImageCoverCropWindow>,
  subject: { x: number; y: number; width: number; height: number },
): void {
  expect(subject.x - crop.width * 0.05).toBeGreaterThanOrEqual(crop.x);
  expect(subject.x + subject.width + crop.width * 0.05).toBeLessThanOrEqual(crop.x + crop.width);
  expect(subject.y - crop.height * 0.05).toBeGreaterThanOrEqual(crop.y);
  expect(subject.y + subject.height + crop.height * 0.05).toBeLessThanOrEqual(crop.y + crop.height);
}

function expectCropNotToContainSafeSubject(
  crop: ReturnType<typeof deriveImageCoverCropWindow>,
  subject: { x: number; y: number; width: number; height: number },
): void {
  const contains = subject.x - crop.width * 0.05 >= crop.x
    && subject.x + subject.width + crop.width * 0.05 <= crop.x + crop.width
    && subject.y - crop.height * 0.05 >= crop.y
    && subject.y + subject.height + crop.height * 0.05 <= crop.y + crop.height;
  expect(contains).toBe(false);
}
