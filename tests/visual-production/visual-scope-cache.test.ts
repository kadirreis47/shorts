import { describe, expect, it } from 'vitest';
import { canonicalSerialize, createManifestRevisionId, createTimelineSnapshot } from '@/core/editing';
import { createSceneFingerprint } from '@/core/render';
import { buildSceneVisualEffectPlan } from '@/core/render/visualEffectBuilder';
import { createVisualProductionEngine, getSceneVideoClips, getSceneVisualOperations, type VisualOperation, type VisualProductionPlan } from '@/core/visual-production';
import type { RenderPreset } from '@/core/render';
import { editingFixture } from '../editing/fixtures';

const preset: RenderPreset = { id: 'scope-test', name: 'Scope test', container: 'mp4', videoCodec: 'h264', audioCodec: 'aac', quality: 'standard', hardwareAcceleration: 'disabled' };

async function sharedSetup(referenceCount = 3) { const base = await editingFixture(); const manifest = structuredClone(base.manifest); const scenes = manifest.timeline.scenes.slice(0, referenceCount); for (const scene of scenes) { scene.assetIds = ['shared-asset']; scene.transition = { type: 'cut', durationMs: 0 }; scene.overlapBeforeMs = 0; scene.overlapAfterMs = 0; } manifest.assets.push({ id: 'shared-asset', type: 'video', source: 'shared.mp4', metadata: { brightness: .12, sourceOwner: 'manual' } }); const video = manifest.timeline.tracks.find((track) => track.type === 'video')!; video.clips = scenes.map((scene) => ({ id: `clip-${scene.id}`, sceneId: scene.id, assetId: 'shared-asset', startMs: scene.startMs, endMs: scene.endMs, durationMs: scene.durationMs, offsetMs: 0, metadata: { sourceOwner: 'manual' } })); const snapshot = createTimelineSnapshot(manifest, createManifestRevisionId(manifest)); const engine = createVisualProductionEngine(); const analyzed = engine.analyze({ manifest, snapshot }); const baseOperation = analyzed.operations.find((item) => item.type === 'brightness')!; const operation = { ...baseOperation, sceneId: scenes[0].id, scope: 'scene' as const }; const plan = { ...analyzed, operations: [operation] }; return { manifest, scenes, snapshot, engine, operation, plan }; }
function renderEffects(manifest: Awaited<ReturnType<typeof sharedSetup>>['manifest'], sceneId: string) { const scene = manifest.timeline.scenes.find((item) => item.id === sceneId)!; return buildSceneVisualEffectPlan({ scene, width: 1080, height: 1920, fps: 30, durationSeconds: scene.durationMs / 1000, visualProduction: getSceneVisualOperations(manifest, sceneId) }); }

describe('scene-local visual scope and cache fingerprints', () => {
  it('changes only the target clip, fingerprint and FFmpeg segment for a shared asset', async () => { const { manifest, scenes, snapshot, engine, operation, plan } = await sharedSetup(); const assetBefore = canonicalSerialize(manifest.assets.find((item) => item.id === 'shared-asset')); const fingerprintsBefore = await Promise.all(scenes.map((scene) => createSceneFingerprint(scene, manifest, preset))); const preview = engine.preview(plan, snapshot, [operation.id]); const proposed = preview.proposedSnapshot.manifest; const fingerprintsAfter = await Promise.all(scenes.map((scene) => createSceneFingerprint(scene, proposed, preset))); expect(getSceneVisualOperations(proposed, scenes[0].id)).toHaveLength(1); expect(getSceneVisualOperations(proposed, scenes[1].id)).toEqual([]); expect(getSceneVisualOperations(proposed, scenes[2].id)).toEqual([]); expect(fingerprintsAfter[0]).not.toBe(fingerprintsBefore[0]); expect(fingerprintsAfter.slice(1)).toEqual(fingerprintsBefore.slice(1)); expect(canonicalSerialize(proposed.assets.find((item) => item.id === 'shared-asset'))).toBe(assetBefore); expect(renderEffects(proposed, scenes[0].id).filters.some((item) => item.startsWith('eq=brightness='))).toBe(true); expect(renderEffects(proposed, scenes[1].id).filters.some((item) => item.startsWith('eq=brightness='))).toBe(false); expect(preview.affectedScenes).toEqual([scenes[0].id]); expect(preview.rerenderSceneIds).toEqual([scenes[0].id]); expect(preview.reusableSceneIds).toEqual(expect.arrayContaining([scenes[1].id, scenes[2].id])); expect(snapshot.manifest).toEqual(manifest); });
  it('restores and reapplies only the target clip through revision snapshots', async () => { const { scenes, snapshot, engine, operation, plan } = await sharedSetup(2); const result = engine.apply(plan, engine.preview(plan, snapshot, [operation.id]), snapshot, [operation.id]); expect(getSceneVisualOperations(result.previousRevision.snapshot.manifest, scenes[0].id)).toEqual([]); expect(getSceneVisualOperations(result.revision.snapshot.manifest, scenes[0].id)).toHaveLength(1); expect(getSceneVisualOperations(result.previousRevision.snapshot.manifest, scenes[1].id)).toEqual([]); expect(getSceneVisualOperations(result.revision.snapshot.manifest, scenes[1].id)).toEqual([]); });
  it('expands an explicitly asset-global operation to every referencing scene', async () => { const { scenes, snapshot, engine, operation, plan } = await sharedSetup(); const global: VisualOperation = { ...operation, id: `${operation.id}-global`, scope: 'asset-global' }; const globalPlan: VisualProductionPlan = { ...plan, operations: [global] }; const preview = engine.preview(globalPlan, snapshot, [global.id]); expect(preview.operationResults[0].scope).toBe('asset-global'); expect(preview.affectedScenes).toEqual(scenes.map((scene) => scene.id).sort()); expect(preview.rerenderSceneIds).toEqual(scenes.map((scene) => scene.id).sort()); for (const scene of scenes) expect(getSceneVisualOperations(preview.proposedSnapshot.manifest, scene.id)[0]).toMatchObject({ operationId: global.id, scope: 'asset-global' }); });
  it('drops scene-local state with a removed scene and preserves it by identity through reorder and split-like clip inheritance', async () => { const { scenes, snapshot, engine, operation, plan } = await sharedSetup(2); const proposed = engine.preview(plan, snapshot, [operation.id]).proposedSnapshot.manifest; proposed.timeline.scenes.reverse(); expect(getSceneVisualOperations(proposed, scenes[0].id)).toHaveLength(1); expect(getSceneVisualOperations(proposed, scenes[1].id)).toEqual([]); const parent = getSceneVideoClips(proposed, scenes[0].id)[0]; const child = { ...structuredClone(parent), id: `${parent.id}-child`, sceneId: `${scenes[0].id}-child` }; proposed.timeline.tracks.find((track) => track.type === 'video')!.clips.push(child); expect(getSceneVisualOperations(proposed, child.sceneId)).toEqual(getSceneVisualOperations(proposed, scenes[0].id)); proposed.timeline.tracks.forEach((track) => { track.clips = track.clips.filter((clip) => clip.sceneId !== scenes[0].id); }); proposed.timeline.scenes = proposed.timeline.scenes.filter((scene) => scene.id !== scenes[0].id); expect(getSceneVisualOperations(proposed, scenes[0].id)).toEqual([]); });
  it('keeps legacy asset-level generated metadata inert and manual source metadata intact', async () => { const { manifest, scenes } = await sharedSetup(2); const asset = manifest.assets.find((item) => item.id === 'shared-asset')!; asset.metadata = { ...asset.metadata, visualProduction: [{ operationId: 'legacy', type: 'brightness', parameters: { delta: .2 } }] }; expect(getSceneVisualOperations(manifest, scenes[0].id)).toEqual([]); expect(renderEffects(manifest, scenes[0].id).filters.some((item) => item.startsWith('eq=brightness='))).toBe(false); expect(asset.metadata.sourceOwner).toBe('manual'); });
});

describe('multi-clip scene visual operation deduplication', () => {
  it.each([
    { type: 'brightness', parameters: { delta: .08 }, filter: 'eq=brightness=' },
    { type: 'contrast', parameters: { factor: 1.08 }, filter: 'eq=contrast=' },
    { type: 'color-grade', parameters: { style: 'cinematic', intensity: .25 }, filter: 'eq=brightness=' },
  ])('renders one $type filter for identical copies on three clips', async ({ type, parameters, filter }) => {
    const { manifest, scenes } = await sharedSetup(1);
    const clip = getSceneVideoClips(manifest, scenes[0].id)[0];
    const stored = { operationId: `multi-${type}`, type, scope: 'scene', parameters };
    clip.metadata = { ...clip.metadata, visualProduction: [stored] };
    const video = manifest.timeline.tracks.find((track) => track.type === 'video')!;
    video.clips.push({ ...structuredClone(clip), id: `${clip.id}-2` }, { ...structuredClone(clip), id: `${clip.id}-3` });
    expect(getSceneVisualOperations(manifest, scenes[0].id)).toEqual([stored]);
    expect(renderEffects(manifest, scenes[0].id).filters.filter((item) => item.startsWith(filter))).toHaveLength(1);
  });

  it('rejects conflicting duplicate payloads instead of selecting one', async () => {
    const { manifest, scenes } = await sharedSetup(1);
    const clip = getSceneVideoClips(manifest, scenes[0].id)[0];
    clip.metadata = { ...clip.metadata, visualProduction: [{ operationId: 'conflict', type: 'brightness', scope: 'scene', parameters: { delta: .08 } }] };
    manifest.timeline.tracks.find((track) => track.type === 'video')!.clips.push({ ...structuredClone(clip), id: `${clip.id}-conflict`, metadata: { ...clip.metadata, visualProduction: [{ operationId: 'conflict', type: 'brightness', scope: 'scene', parameters: { delta: -.08 } }] } });
    expect(() => getSceneVisualOperations(manifest, scenes[0].id)).toThrow(/Conflicting visual operation payload.*conflict/);
    expect(() => renderEffects(manifest, scenes[0].id)).toThrow(/Conflicting visual operation payload.*conflict/);
  });

  it('preserves distinct operation identities and deterministic ordering', () => {
    const scene = { id: 'scene-order', cameraMotion: 'none', transition: { type: 'cut', durationMs: 0 } } as Parameters<typeof buildSceneVisualEffectPlan>[0]['scene'];
    const visualProduction = [
      { operationId: 'z-contrast', type: 'contrast', scope: 'scene', parameters: { factor: 1.08 } },
      { operationId: 'a-contrast', type: 'contrast', scope: 'scene', parameters: { factor: 1.12 } },
    ];
    const plan = buildSceneVisualEffectPlan({ scene, width: 1080, height: 1920, fps: 30, durationSeconds: 3, visualProduction });
    expect(plan.filters.filter((item) => item.startsWith('eq=contrast='))).toEqual(['eq=contrast=1.120', 'eq=contrast=1.080']);
  });

  it('canonicalizes identical clip copies in scene fingerprints', async () => {
    const { manifest, scenes } = await sharedSetup(1);
    const clip = getSceneVideoClips(manifest, scenes[0].id)[0];
    const stored = { operationId: 'fingerprint-op', type: 'brightness', scope: 'scene', parameters: { delta: .08 } };
    clip.metadata = { ...clip.metadata, visualProduction: [stored] };
    const duplicate = { ...structuredClone(clip), id: `${clip.id}-duplicate` };
    manifest.timeline.tracks.find((track) => track.type === 'video')!.clips.push(duplicate);
    const withCopies = await createSceneFingerprint(scenes[0], manifest, preset);
    duplicate.metadata = { ...duplicate.metadata, visualProduction: [] };
    const canonical = await createSceneFingerprint(scenes[0], manifest, preset);
    expect(withCopies).toBe(canonical);
  });
});
