// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  bindDirectorReportV2_1,
  classifyDirectorReportCurrentnessV1,
  createDirectorEngine,
  createDirectorVisualPlanningBindingV1,
  type DirectorReport,
  type VisualBoundDirectorReportV2_1,
} from '@/core/director';
import { createManifestRevisionId, MANIFEST_FINGERPRINT_VERSION } from '@/core/editing';
import type { RenderManifest } from '@/core/media';
import type { TrustedImageDisplayGeometryV1 } from '@/core/media/imageDisplayGeometry';
import {
  createValidatedVisualPlanningSnapshotBundleV1,
  createVisualSpatialEvidenceRecord,
  isTrustedValidatedVisualPlanningSnapshotBundleV1,
  type CreateSpatialContinuityEvidenceReportInput,
  type ValidatedVisualPlanningSnapshotBundleV1,
} from '@/core/visual-intelligence';
import { mergeDirectorPersistedState, useDirectorReportStore } from '@/store/directorReportStore';
import type { Scene } from '@/lib/types';
import { directorInput, directorScene } from './fixtures';

const PROJECT = 'director-currentness-project';
const OWNER = '00000000-0000-4000-8000-000000000001';
const NOW = Date.parse('2026-09-07T00:00:00.000Z');
const IDS = [
  'visual-scene-00000000-0000-4000-8000-000000000071',
  'visual-scene-00000000-0000-4000-8000-000000000072',
  'visual-scene-00000000-0000-4000-8000-000000000073',
] as const;
const MEDIA_IDS = [
  '00000000-0000-4000-8000-000000000171',
  '00000000-0000-4000-8000-000000000172',
  '00000000-0000-4000-8000-000000000173',
] as const;

interface VisualOptions {
  unavailable?: readonly string[];
  unsupported?: readonly string[];
  digestByScene?: Readonly<Record<string, string>>;
  focalByScene?: Readonly<Record<string, number>>;
  authorityReference?: string;
  authorityExpiry?: string;
  geometryWidth?: number;
  orientation?: TrustedImageDisplayGeometryV1['encodedToDisplay'];
  subjectX?: number;
}

function visualInput(options: VisualOptions = {}): CreateSpatialContinuityEvidenceReportInput {
  const unavailable = new Set(options.unavailable ?? []);
  const unsupported = new Set(options.unsupported ?? []);
  const scenes: Scene[] = IDS.map((sceneId, index) => ({
    sceneId,
    text: `Scene ${index}`,
    duration: 3,
    visual: `Scene ${index}`,
    ...(unsupported.has(sceneId)
      ? { videoStorage: { bucket: 'media', objectPath: `${OWNER}/videos/${index}.mp4` } }
      : { imageStorage: { bucket: 'media', objectPath: `${OWNER}/generated-images/${MEDIA_IDS[index]}.png` } }),
  }));
  const trustedImageGeometry: Record<string, TrustedImageDisplayGeometryV1> = {};
  const appliedSpatialEvidence: Record<string, ReturnType<typeof createVisualSpatialEvidenceRecord>> = {};
  scenes.forEach((scene, sceneIndex) => {
    if (!scene.imageStorage) return;
    const mediaIdentity = `media:${scene.imageStorage.objectPath}`;
    const contentDigest = options.digestByScene?.[scene.sceneId] ?? 'a'.repeat(64);
    const width = options.geometryWidth ?? 1200;
    const geometry: TrustedImageDisplayGeometryV1 = {
      version: 1,
      mediaIdentity,
      encodedDimensions: { width, height: 800 },
      displayDimensions: { width, height: 800 },
      encodedToDisplay: options.orientation ?? 'identity',
      contentDigest,
      executionAuthority: {
        version: 1,
        reference: options.authorityReference ?? `idga1_${'a'.repeat(43)}`,
        expiresAt: options.authorityExpiry ?? '2099-01-01T00:00:00.000Z',
      },
    };
    trustedImageGeometry[scene.sceneId] = geometry;
    if (unavailable.has(scene.sceneId)) return;
    appliedSpatialEvidence[scene.sceneId] = createVisualSpatialEvidenceRecord({
      projectId: PROJECT,
      sceneId: scene.sceneId,
      sceneIndex,
      scope: 'applied-image',
      mediaIdentity,
    }, {
      status: 'evaluated',
      contractVersion: 'visual-spatial-v1',
      analyzerVersion: 'openai:test',
      sourceDimensions: { width, height: 800 },
      focalPoint: { x: options.focalByScene?.[scene.sceneId] ?? 0.5, y: 0.5 },
      primarySubjectRegion: { x: options.subjectX ?? 0.4, y: 0.25, width: 0.2, height: 0.5 },
      confidenceBand: 'medium',
    }, {
      mediaIdentity,
      contentDigest,
      encodedDimensions: geometry.encodedDimensions,
    });
  });
  return {
    projectId: PROJECT,
    scenes,
    appliedSpatialEvidence,
    trustedImageGeometry,
    evaluationTimeMs: NOW,
    outputDimensions: { width: 1080, height: 1920 },
    compositionDefaults: { motion: 'kenburns', transition: 'crossfade' },
  };
}

function manifest(marker = 'current'): RenderManifest {
  return { projectId: PROJECT, marker } as unknown as RenderManifest;
}

async function reportFor(
  bundle = createValidatedVisualPlanningSnapshotBundleV1(visualInput()),
  currentManifest = manifest(),
) {
  const input = directorInput(bundle.snapshot.canonical.orderedScenes.map((scene, index) => directorScene(scene.sceneId, index)));
  const legacy = await createDirectorEngine().analyze({
    ...input,
    projectId: PROJECT,
    metadata: {
      ...input.metadata,
      manifestBindingVersion: '1.0',
      analyzedManifestFingerprint: createManifestRevisionId(currentManifest),
      manifestFingerprintVersion: MANIFEST_FINGERPRINT_VERSION,
    },
  });
  return bindDirectorReportV2_1(legacy, await createDirectorVisualPlanningBindingV1(bundle));
}

describe('Director report durable Visual Planning currentness V1', () => {
  it('classifies exact manifest and full Visual semantics as fully current', async () => {
    const currentManifest = manifest();
    const bundle = createValidatedVisualPlanningSnapshotBundleV1(visualInput());
    const report = await reportFor(bundle, currentManifest);
    await expect(classifyDirectorReportCurrentnessV1({ report, currentManifest, currentVisualPlanning: bundle }))
      .resolves.toEqual({ manifest: 'current', visual: 'current', fullyCurrent: true });
  });

  it('derives manifest and Visual staleness independently', async () => {
    const currentManifest = manifest();
    const bound = createValidatedVisualPlanningSnapshotBundleV1(visualInput());
    const report = await reportFor(bound, currentManifest);
    const changedVisual = createValidatedVisualPlanningSnapshotBundleV1(visualInput({ focalByScene: { [IDS[0]]: 0.9 } }));
    expect(await classifyDirectorReportCurrentnessV1({ report, currentManifest: manifest('changed'), currentVisualPlanning: bound }))
      .toEqual({ manifest: 'stale', visual: 'current', fullyCurrent: false });
    expect(await classifyDirectorReportCurrentnessV1({ report, currentManifest, currentVisualPlanning: changedVisual }))
      .toEqual({ manifest: 'current', visual: 'stale', fullyCurrent: false });
  });

  it('distinguishes temporary evidence loss, restoration, and positive contradiction', async () => {
    const currentManifest = manifest();
    const request = createValidatedVisualPlanningSnapshotBundleV1(visualInput());
    const report = await reportFor(request, currentManifest);
    const partial = createValidatedVisualPlanningSnapshotBundleV1(visualInput({ unavailable: [IDS[1]] }));
    const contradicted = createValidatedVisualPlanningSnapshotBundleV1(visualInput({
      unavailable: [IDS[1]],
      digestByScene: { [IDS[0]]: 'b'.repeat(64) },
    }));
    const reauthorized = createValidatedVisualPlanningSnapshotBundleV1(visualInput({
      authorityReference: `idga1_${'b'.repeat(43)}`,
      authorityExpiry: '2100-01-01T00:00:00.000Z',
    }));
    expect((await classifyDirectorReportCurrentnessV1({ report, currentManifest, currentVisualPlanning: partial })).visual).toBe('unverified');
    expect((await classifyDirectorReportCurrentnessV1({ report, currentManifest, currentVisualPlanning: contradicted })).visual).toBe('stale');
    expect((await classifyDirectorReportCurrentnessV1({ report, currentManifest, currentVisualPlanning: reauthorized })).visual).toBe('current');
    expect(await createDirectorVisualPlanningBindingV1(reauthorized))
      .toEqual(await createDirectorVisualPlanningBindingV1(request));
  });

  it('rejects structural clones before binding or the full-digest current fast path', async () => {
    const currentManifest = manifest();
    const bundle = createValidatedVisualPlanningSnapshotBundleV1(visualInput());
    const report = await reportFor(bundle, currentManifest);
    const clone = { ...bundle } as unknown as ValidatedVisualPlanningSnapshotBundleV1;
    expect(isTrustedValidatedVisualPlanningSnapshotBundleV1(clone)).toBe(false);
    await expect(createDirectorVisualPlanningBindingV1(clone)).rejects.toThrow(/malformed or unsupported/u);
    await expect(classifyDirectorReportCurrentnessV1({ report, currentManifest, currentVisualPlanning: clone }))
      .resolves.toEqual({ manifest: 'current', visual: 'unsupported', fullyCurrent: false });
  });

  it('rejects S1/P2 recombination and relabeled-fingerprint attacks before binding or current classification', async () => {
    const currentManifest = manifest();
    const bundle1 = createValidatedVisualPlanningSnapshotBundleV1(visualInput());
    const bundle2 = createValidatedVisualPlanningSnapshotBundleV1(visualInput({ focalByScene: { [IDS[0]]: 0.9 } }));
    const report = await reportFor(bundle1, currentManifest);
    const projection2DigestMaterial = (await createDirectorVisualPlanningBindingV1(bundle2)).spatialScenes;
    const recombined = { ...bundle2, snapshot: bundle1.snapshot } as unknown as ValidatedVisualPlanningSnapshotBundleV1;
    const relabeled = {
      snapshot: bundle1.snapshot,
      verificationProjection: {
        version: 1,
        projectId: PROJECT,
        snapshotVersion: 1,
        semanticFingerprint: bundle1.snapshot.semanticFingerprint,
        spatialScenes: projection2DigestMaterial,
      },
    } as unknown as ValidatedVisualPlanningSnapshotBundleV1;
    for (const forged of [recombined, relabeled]) {
      expect(isTrustedValidatedVisualPlanningSnapshotBundleV1(forged)).toBe(false);
      await expect(createDirectorVisualPlanningBindingV1(forged)).rejects.toThrow(/malformed or unsupported/u);
      expect((await classifyDirectorReportCurrentnessV1({ report, currentManifest, currentVisualPlanning: forged })).visual)
        .toBe('unsupported');
    }
  });

  it('keeps authority rotation neutral while factual media, geometry, focal, and subject drift change scene digests', async () => {
    const digest = async (options: VisualOptions) => {
      const binding = await createDirectorVisualPlanningBindingV1(createValidatedVisualPlanningSnapshotBundleV1(visualInput(options)));
      const scene = binding.spatialScenes[0];
      if (scene.coverage !== 'analyzed') throw new Error('Expected analyzed scene binding.');
      return scene.factualDigest;
    };
    const original = await digest({});
    expect(await digest({ authorityReference: `idga1_${'b'.repeat(43)}`, authorityExpiry: '2100-01-01T00:00:00.000Z' })).toBe(original);
    expect(await digest({ digestByScene: { [IDS[0]]: 'b'.repeat(64) } })).not.toBe(original);
    expect(await digest({ geometryWidth: 1400 })).not.toBe(original);
    expect(await digest({ orientation: 'rotate-180' })).not.toBe(original);
    expect(await digest({ focalByScene: { [IDS[0]]: 0.8 } })).not.toBe(original);
    expect(await digest({ subjectX: 0.2 })).not.toBe(original);
  });

  it('supports original mixed coverage and applies every coverage transition rule', async () => {
    const currentManifest = manifest();
    const mixed = createValidatedVisualPlanningSnapshotBundleV1(visualInput({ unavailable: [IDS[1]], unsupported: [IDS[2]] }));
    const report = await reportFor(mixed, currentManifest);
    expect((await classifyDirectorReportCurrentnessV1({ report, currentManifest, currentVisualPlanning: mixed })).visual).toBe('current');
    const unavailableToAnalyzed = createValidatedVisualPlanningSnapshotBundleV1(visualInput({ unsupported: [IDS[2]] }));
    const unsupportedToUnavailable = createValidatedVisualPlanningSnapshotBundleV1(visualInput({ unavailable: [IDS[1], IDS[2]] }));
    const analyzedToUnsupported = createValidatedVisualPlanningSnapshotBundleV1(visualInput({ unavailable: [IDS[1]], unsupported: [IDS[0], IDS[2]] }));
    for (const currentVisualPlanning of [unavailableToAnalyzed, unsupportedToUnavailable, analyzedToUnsupported]) {
      expect((await classifyDirectorReportCurrentnessV1({ report, currentManifest, currentVisualPlanning })).visual).toBe('stale');
    }
  });

  it('keeps legacy reports historical and bound reports unverified without current evidence', async () => {
    const currentManifest = manifest();
    const bundle = createValidatedVisualPlanningSnapshotBundleV1(visualInput());
    const bound = await reportFor(bundle, currentManifest);
    const { visualPlanningBinding: _binding, ...payload } = bound;
    const legacy = { ...payload, reportVersion: '2.0' as const };
    expect((await classifyDirectorReportCurrentnessV1({ report: legacy, currentManifest, currentVisualPlanning: bundle })).visual).toBe('legacy-unbound');
    expect((await classifyDirectorReportCurrentnessV1({ report: bound, currentManifest })).visual).toBe('unverified');
  });

  it('persists only the compact binding and hydrates valid 2.0 and 2.1 reports', async () => {
    const bundle = createValidatedVisualPlanningSnapshotBundleV1(visualInput({ unavailable: [IDS[1]], unsupported: [IDS[2]] }));
    const bound = await reportFor(bundle);
    const { visualPlanningBinding: _binding, ...payload } = bound;
    const legacy = { ...payload, projectId: 'legacy-project', reportVersion: '2.0' as const };
    const serialized = JSON.stringify(bound);
    expect(serialized).not.toContain(bundle.snapshot.semanticFingerprint);
    expect(serialized).not.toMatch(/analyzedFreshnessCanonical|geometry|executionAuthority|expiresAt|focalPoint|primarySubjectRegion|spatialContinuity|visualRhythm/u);
    expect(bound.visualPlanningBinding.semanticDigest).toMatch(/^[0-9a-f]{64}$/u);
    expect(bound.visualPlanningBinding.spatialScenes[0]).toMatchObject({ coverage: 'analyzed', factualDigest: expect.stringMatching(/^[0-9a-f]{64}$/u) });
    const persisted = JSON.parse(JSON.stringify({
      reportsByProject: { [bound.projectId]: bound, [legacy.projectId]: legacy },
      activeProjectId: bound.projectId,
    }));
    const hydrated = mergeDirectorPersistedState(persisted, useDirectorReportStore.getState());
    expect(useDirectorReportStore.persist.getOptions().version).toBe(1);
    expect(hydrated.currentReport).toEqual(bound);
    expect(hydrated.reportsByProject[legacy.projectId]).toEqual(legacy);
  });

  it.each([
    ['missing binding', (report: VisualBoundDirectorReportV2_1) => ({ ...report, visualPlanningBinding: undefined })],
    ['bad digest', (report: VisualBoundDirectorReportV2_1) => ({ ...report, visualPlanningBinding: { ...report.visualPlanningBinding, semanticDigest: 'ABC' } })],
    ['uppercase digest', (report: VisualBoundDirectorReportV2_1) => ({ ...report, visualPlanningBinding: { ...report.visualPlanningBinding, semanticDigest: 'A'.repeat(64) } })],
    ['non-hex digest', (report: VisualBoundDirectorReportV2_1) => ({ ...report, visualPlanningBinding: { ...report.visualPlanningBinding, semanticDigest: 'g'.repeat(64) } })],
    ['unsupported binding', (report: VisualBoundDirectorReportV2_1) => ({ ...report, visualPlanningBinding: { ...report.visualPlanningBinding, version: 2 } })],
    ['unsupported snapshot', (report: VisualBoundDirectorReportV2_1) => ({ ...report, visualPlanningBinding: { ...report.visualPlanningBinding, snapshotVersion: 2 } })],
    ['unsupported algorithm', (report: VisualBoundDirectorReportV2_1) => ({ ...report, visualPlanningBinding: { ...report.visualPlanningBinding, digestAlgorithm: 'SHA-1' } })],
    ['duplicate scene', (report: VisualBoundDirectorReportV2_1) => ({ ...report, visualPlanningBinding: { ...report.visualPlanningBinding, spatialScenes: [report.visualPlanningBinding.spatialScenes[0], report.visualPlanningBinding.spatialScenes[0]] } })],
    ['wrong scene order', (report: VisualBoundDirectorReportV2_1) => ({ ...report, visualPlanningBinding: { ...report.visualPlanningBinding, spatialScenes: [...report.visualPlanningBinding.spatialScenes].reverse() } })],
    ['non-contiguous index', (report: VisualBoundDirectorReportV2_1) => ({ ...report, visualPlanningBinding: { ...report.visualPlanningBinding, spatialScenes: report.visualPlanningBinding.spatialScenes.map((scene, index) => index === 1 ? { ...scene, sceneIndex: 3 } : scene) } })],
    ['analyzed missing digest', (report: VisualBoundDirectorReportV2_1) => ({ ...report, visualPlanningBinding: { ...report.visualPlanningBinding, spatialScenes: report.visualPlanningBinding.spatialScenes.map((scene, index) => index === 0 ? { sceneId: scene.sceneId, sceneIndex: scene.sceneIndex, coverage: 'analyzed' } : scene) } })],
    ['unavailable with digest', (report: VisualBoundDirectorReportV2_1) => ({ ...report, visualPlanningBinding: { ...report.visualPlanningBinding, spatialScenes: report.visualPlanningBinding.spatialScenes.map((scene, index) => index === 1 ? { ...scene, factualDigest: 'a'.repeat(64) } : scene) } })],
    ['unknown report schema', (report: VisualBoundDirectorReportV2_1) => ({ ...report, reportVersion: '3.0' })],
  ])('discards malformed or unsupported 2.1 hydration: %s', async (_label, mutate) => {
    const report = await reportFor(createValidatedVisualPlanningSnapshotBundleV1(visualInput({ unavailable: [IDS[1]] })));
    const candidate = mutate(report) as unknown as DirectorReport;
    const hydrated = mergeDirectorPersistedState({ reportsByProject: { [PROJECT]: candidate }, activeProjectId: PROJECT }, useDirectorReportStore.getState());
    expect(hydrated.reportsByProject).toEqual({});
    expect(hydrated.currentReport).toBeNull();
    expect((await classifyDirectorReportCurrentnessV1({ report: candidate })).visual).toBe('unsupported');
  });
});
