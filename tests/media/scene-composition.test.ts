import { describe, expect, it } from 'vitest';
import {
  clearSceneCompositionOverride,
  compileStudioProductionRecipeV1,
  createAssetProviderEngine,
  createMediaEngine,
  createImageDisplayGeometry,
  imageFramingBindingFromTrustedGeometry,
  normalizeStudioProductionRecipeV1,
  resolveEffectiveSceneComposition,
  setSceneCompositionOverride,
  type StudioProductionRecipeInput,
  type ImageEncodedToDisplayOrientation,
} from '@/core/media';
import { TypedEventBus } from '@/core/events/eventBus';
import type { ApplicationEventMap } from '@/core/events';
import { captureValidatedMediaOwnerContext } from '@/lib/mediaStorage';
import { setValidatedOwnerId } from '@/auth/identity';
import { buildFFmpegCommand, createRenderFingerprint, createSceneFingerprint } from '@/core/render';
import type { RenderPreset } from '@/core/render';
import { normalizeStudioDraft, studioProductionRecipeInputFromDraft, type StudioDraft } from '@/lib/studioDraft';
import { canonicalStudioCompositionOutput, isStudioOutputRevisionCurrent } from '@/lib/studioOutputIdentity';
import type { Scene } from '@/lib/types';

const PRESET: RenderPreset = { id: 'scene-composition', name: 'Scene composition', container: 'mp4', videoCodec: 'h264', audioCodec: 'aac', frameRate: 30, quality: 'standard', hardwareAcceleration: 'disabled' };
const DEFAULTS = { motion: 'kenburns', transition: 'crossfade' } as const;
const TEST_OWNER = '00000000-0000-4000-8000-000000000099';

describe('scene-local canonical composition', () => {
  it('resolves independent overrides once into the effective multi-scene render plan', async () => {
    const input = recipeInput();
    input.motionStyle = 'static';
    input.transitionStyle = 'crossfade';
    input.scenes[1].compositionOverride = { motion: 'zoom_in' };
    input.scenes[2].compositionOverride = { transition: 'none' };
    const result = await build(input);

    expect(result.manifest.timeline.scenes.map((scene) => scene.cameraMotion)).toEqual(['none', 'zoom_in', 'none']);
    // Transition is owned by the incoming scene: scene 1 owns 0 -> 1, scene 2 owns 1 -> 2.
    expect(result.manifest.timeline.scenes.map((scene) => scene.transition.type)).toEqual(['cut', 'crossfade', 'cut']);
  });

  it('keeps explicit fields stable while global defaults change inherited fields', () => {
    const override = { motion: 'zoom_in' as const };
    expect(resolveEffectiveSceneComposition({ motion: 'static', transition: 'crossfade' }, override, 1))
      .toEqual({ motion: 'zoom_in', transition: 'crossfade' });
    expect(resolveEffectiveSceneComposition({ motion: 'zoom_out', transition: 'none' }, override, 1))
      .toEqual({ motion: 'zoom_in', transition: 'none' });
    expect(resolveEffectiveSceneComposition({ motion: 'zoom_out', transition: 'crossfade' }, { transition: 'crossfade' }, 0))
      .toEqual({ motion: 'zoom_out', transition: 'none' });
  });

  it('applies changed globals only to fields still inherited in the compiled plan', async () => {
    const baseline = recipeInput();
    baseline.motionStyle = 'static';
    baseline.transitionStyle = 'none';
    baseline.scenes[1].compositionOverride = { motion: 'zoom_in', transition: 'crossfade' };
    const changed = structuredClone(baseline);
    changed.motionStyle = 'zoom_out';
    changed.transitionStyle = 'crossfade';
    const [before, after] = await Promise.all([build(baseline), build(changed)]);

    expect(before.manifest.timeline.scenes.map((scene) => [scene.cameraMotion, scene.transition.type]))
      .toEqual([['none', 'cut'], ['zoom_in', 'crossfade'], ['none', 'cut']]);
    expect(after.manifest.timeline.scenes.map((scene) => [scene.cameraMotion, scene.transition.type]))
      .toEqual([['zoom_out', 'cut'], ['zoom_in', 'crossfade'], ['zoom_out', 'crossfade']]);
  });

  it('clears fields back to inheritance without changing unrelated scene state', () => {
    const scenes = recipeInput().scenes;
    const original = structuredClone(scenes);
    const set = setSceneCompositionOverride(scenes, target(scenes, 1), { motion: 'pan', transition: 'none' }, DEFAULTS);
    expect(set.status).toBe('updated');
    expect(scenes).toEqual(original);
    expect(set.scenes[0]).toBe(scenes[0]);
    expect(set.scenes[2]).toBe(scenes[2]);
    expect(set.scenes[1]).not.toBe(scenes[1]);
    const cleared = clearSceneCompositionOverride(set.scenes, target(set.scenes, 1), 'motion');
    expect(cleared.status).toBe('updated');
    expect(cleared.scenes[1]).toMatchObject({ text: scenes[1].text, imageStorage: scenes[1].imageStorage, compositionOverride: { transition: 'none' } });
    expect(clearSceneCompositionOverride(cleared.scenes, target(cleared.scenes, 1)).scenes[1].compositionOverride).toBeUndefined();
  });

  it('updates one override field without silently clearing the other', () => {
    const scenes = recipeInput().scenes;
    scenes[1].compositionOverride = { transition: 'none' };
    const result = setSceneCompositionOverride(scenes, target(scenes, 1), { motion: 'zoom_in' }, DEFAULTS);
    expect(result.scenes[1].compositionOverride).toEqual({ motion: 'zoom_in', transition: 'none' });
    expect(setSceneCompositionOverride(result.scenes, target(result.scenes, 1), { motion: 'zoom_in', transition: 'none' }, DEFAULTS).status).toBe('no-op');
    const inherited = recipeInput().scenes;
    expect(setSceneCompositionOverride(inherited, target(inherited, 1), { motion: 'kenburns', transition: 'crossfade' }, { motion: 'kenburns', transition: 'crossfade' }).status).toBe('no-op');
  });

  it('preserves legacy output and collapses redundant overrides to output-semantic identity', async () => {
    const legacy = normalizeStudioProductionRecipeV1(recipeInput(), ownerContext());
    const redundantInput = recipeInput();
    redundantInput.scenes[1].compositionOverride = { motion: redundantInput.motionStyle, transition: 'crossfade' };
    const redundant = normalizeStudioProductionRecipeV1(redundantInput, ownerContext());
    expect(redundant.recipe).toEqual(legacy.recipe);
    expect(redundant.identity).toBe(legacy.identity);

    const changedInput = recipeInput();
    changedInput.scenes[1].compositionOverride = { motion: 'zoom_in', transition: 'none' };
    const changed = normalizeStudioProductionRecipeV1(changedInput, ownerContext());
    expect(changed.identity).not.toBe(legacy.identity);
    const [before, after] = await Promise.all([build(recipeInput()), build(changedInput)]);
    expect(await fingerprint(before.manifest)).not.toBe(await fingerprint(after.manifest));
  });

  it('treats identity display geometry as an executable no-op and non-identity orientation as pixel authority', async () => {
    const baseline = recipeInput();
    const identity = structuredClone(baseline);
    const rotated = structuredClone(baseline);
    const path = baseline.scenes[0].imageStorage!.objectPath;
    identity.scenes[0].imageDisplayGeometry = trustedGeometry(`media:${path}`, 1200, 800, 'identity');
    rotated.scenes[0].imageDisplayGeometry = trustedGeometry(`media:${path}`, 1200, 800, 'rotate-90-cw');

    const baselineRecipe = normalizeStudioProductionRecipeV1(baseline, ownerContext());
    const identityRecipe = normalizeStudioProductionRecipeV1(identity, ownerContext());
    const rotatedRecipe = normalizeStudioProductionRecipeV1(rotated, ownerContext());
    expect(identityRecipe.identity).toBe(baselineRecipe.identity);
    expect(identityRecipe.recipe.scenes[0].media).not.toHaveProperty('displayOrientation');
    expect(rotatedRecipe.recipe.scenes[0].media).toHaveProperty('displayOrientation', 'rotate-90-cw');
    expect(rotatedRecipe.identity).not.toBe(baselineRecipe.identity);
    expect(canonicalStudioCompositionOutput(identity.scenes, DEFAULTS)).toEqual(canonicalStudioCompositionOutput(baseline.scenes, DEFAULTS));
    expect(canonicalStudioCompositionOutput(rotated.scenes, DEFAULTS)).not.toEqual(canonicalStudioCompositionOutput(baseline.scenes, DEFAULTS));

    const [before, after] = await Promise.all([build(baseline), build(rotated)]);
    expect(after.manifest.timeline.scenes[0].imageGeometryAuthority?.expectedOrientation).toBe('rotate-90-cw');
    expect(buildFFmpegCommand({ manifest: after.manifest, preset: PRESET }).args.join(','))
      .toContain('{{IMAGE_DISPLAY_GEOMETRY_INPUT_0}},scale=');
    expect(await createSceneFingerprint(before.manifest.timeline.scenes[0], before.manifest, PRESET))
      .not.toBe(await createSceneFingerprint(after.manifest.timeline.scenes[0], after.manifest, PRESET));
    expect(await fingerprint(before.manifest)).not.toBe(await fingerprint(after.manifest));

    const completedRevision = JSON.stringify(canonicalStudioCompositionOutput(identity.scenes, DEFAULTS));
    expect(isStudioOutputRevisionCurrent(completedRevision, JSON.stringify(canonicalStudioCompositionOutput(rotated.scenes, DEFAULTS)))).toBe(false);
  });

  it('invalidates identity and freshness when immutable encoded dimensions change', async () => {
    const first = recipeInput();
    const second = structuredClone(first);
    const path = first.scenes[0].imageStorage!.objectPath;
    second.scenes[0].imageDisplayGeometry = trustedGeometry(`media:${path}`, 600, 400, 'identity');
    const firstRecipe = normalizeStudioProductionRecipeV1(first, ownerContext());
    const secondRecipe = normalizeStudioProductionRecipeV1(second, ownerContext());
    expect(secondRecipe.identity).not.toBe(firstRecipe.identity);
    const firstRevision = JSON.stringify(canonicalStudioCompositionOutput(first.scenes, DEFAULTS));
    const secondRevision = JSON.stringify(canonicalStudioCompositionOutput(second.scenes, DEFAULTS));
    expect(isStudioOutputRevisionCurrent(firstRevision, secondRevision)).toBe(false);
    const [firstBuild, secondBuild] = await Promise.all([build(first), build(second)]);
    expect(await fingerprint(secondBuild.manifest)).not.toBe(await fingerprint(firstBuild.manifest));
  });

  it('normalizes exact-center framing out of Studio freshness while meaningful framing stales it', () => {
    const baseline = recipeInput();
    const centered = structuredClone(baseline);
    centered.scenes[0].imageFraming = { version: 1, mode: 'focal-cover', anchor: { x: 0.5, y: 0.5 } };
    const framed = structuredClone(baseline);
    framed.scenes[0].imageFraming = { version: 1, mode: 'focal-cover', anchor: { x: 0.1, y: 0.9 } };
    framed.scenes[0].imageFramingBinding = imageFramingBindingFromTrustedGeometry(framed.scenes[0].imageDisplayGeometry!);

    expect(canonicalStudioCompositionOutput(centered.scenes, DEFAULTS))
      .toEqual(canonicalStudioCompositionOutput(baseline.scenes, DEFAULTS));
    expect(canonicalStudioCompositionOutput(framed.scenes, DEFAULTS))
      .not.toEqual(canonicalStudioCompositionOutput(baseline.scenes, DEFAULTS));
  });

  it('stales Recipe, scene, render, and Studio freshness when exact private image bytes change', async () => {
    const first = recipeInput();
    const second = structuredClone(first);
    second.scenes[0].imageDisplayGeometry = {
      ...second.scenes[0].imageDisplayGeometry!,
      contentDigest: 'b'.repeat(64),
    };
    const firstRecipe = normalizeStudioProductionRecipeV1(first, ownerContext());
    const secondRecipe = normalizeStudioProductionRecipeV1(second, ownerContext());
    expect(secondRecipe.identity).not.toBe(firstRecipe.identity);
    expect(canonicalStudioCompositionOutput(second.scenes, DEFAULTS)).not.toEqual(canonicalStudioCompositionOutput(first.scenes, DEFAULTS));
    const [firstBuild, secondBuild] = await Promise.all([build(first), build(second)]);
    expect(await createSceneFingerprint(firstBuild.manifest.timeline.scenes[0], firstBuild.manifest, PRESET))
      .not.toBe(await createSceneFingerprint(secondBuild.manifest.timeline.scenes[0], secondBuild.manifest, PRESET));
    expect(await fingerprint(firstBuild.manifest)).not.toBe(await fingerprint(secondBuild.manifest));
  });

  it('rejects media-mismatched geometry and strips image geometry from video drafts', () => {
    const input = recipeInput(); const path = input.scenes[0].imageStorage!.objectPath;
    input.scenes[0].imageDisplayGeometry = trustedGeometry(`media:${path.replace('000.png', '999.png')}`, 1200, 800, 'rotate-180');
    expect(() => normalizeStudioProductionRecipeV1(input, ownerContext())).toThrow(/geometry/i);

    const draft = draftFrom(recipeInput());
    draft.scenes[0].imageDisplayGeometry = trustedGeometry(`media:${path}`, 1200, 800, 'rotate-180');
    draft.scenes[0].videoStorage = { bucket: 'media', objectPath: `${TEST_OWNER}/videos/00000000-0000-4000-8000-000000000009.mp4` };
    draft.scenes[0].imageStorage = undefined;
    expect(normalizeStudioDraft(draft).scenes[0].imageDisplayGeometry).toBeUndefined();
  });

  it('strips all persisted technical geometry before hydration', () => {
    const original = draftFrom(recipeInput());
    original.scenes[0].imageDisplayGeometry = trustedGeometry(
      `media:${original.scenes[0].imageStorage!.objectPath}`, 1200, 800, 'transverse',
    );
    const hydrated = normalizeStudioDraft(JSON.parse(JSON.stringify(normalizeStudioDraft(original))) as StudioDraft);
    expect(hydrated.scenes[0].imageDisplayGeometry).toBeUndefined();

    const replaced = structuredClone(hydrated);
    replaced.scenes[0].imageStorage!.objectPath = replaced.scenes[0].imageStorage!.objectPath.replace('000.png', '777.png');
    expect(normalizeStudioDraft(replaced).scenes[0].imageDisplayGeometry).toBeUndefined();
  });

  it('fails canonical Recipe compilation closed when private image geometry is unresolved', () => {
    const input = recipeInput();
    input.scenes[0].imageDisplayGeometry = undefined;
    expect(() => normalizeStudioProductionRecipeV1(input, ownerContext())).toThrow(/requires source-derived display geometry/i);
  });

  it('rejects invalid overrides and keeps the first scene free of a phantom transition', async () => {
    const inputScenes = recipeInput().scenes;
    expect(() => setSceneCompositionOverride(inputScenes, target(inputScenes, 0), { motion: 'unsafe' as never }, DEFAULTS)).toThrow(/invalid/i);
    const malformed = recipeInput();
    malformed.scenes[1].compositionOverride = { motion: 'zoom_in', unexpected: 'unsafe' } as never;
    expect(() => normalizeStudioProductionRecipeV1(malformed, ownerContext())).toThrow(/scene composition override is invalid/i);
    const input = recipeInput();
    input.transitionStyle = 'none';
    input.scenes[0].compositionOverride = { transition: 'crossfade' };
    expect(normalizeStudioProductionRecipeV1(input, ownerContext()).recipe.scenes[0].compositionOverride).toBeUndefined();
    const buildResult = await build(input);
    expect(buildResult.manifest.timeline.scenes[0].transition).toEqual({ type: 'cut', durationMs: 0 });

    const compiled = compileStudioProductionRecipeV1(normalizeStudioProductionRecipeV1(recipeInput(), ownerContext()));
    const bus = new TypedEventBus<ApplicationEventMap>();
    await expect(createMediaEngine(bus, createAssetProviderEngine(bus)).buildProject({
      ...compiled,
      sceneComposition: [{ motion: { mode: 'zoompan=unsafe' }, transition: { type: 'cut' } }, ...compiled.sceneComposition!.slice(1)] as never,
    })).rejects.toThrow(/invalid/i);
  });

  it('targets composition by canonical identity plus current order context', () => {
    const scenes = recipeInput().scenes;
    const moved = [scenes[1], scenes[0], scenes[2]];
    const staleTarget = { sceneId: scenes[1].sceneId, sceneIndex: 1 };
    expect(setSceneCompositionOverride(moved, staleTarget, { motion: 'pan' }, DEFAULTS)).toEqual({ status: 'invalid-scene', scenes: moved });

    const result = setSceneCompositionOverride(moved, target(moved, 0), { motion: 'pan', transition: 'none' }, DEFAULTS);
    expect(result.status).toBe('updated');
    if (result.status !== 'updated') return;
    expect(result.scenes[0]).toMatchObject({ sceneId: scenes[1].sceneId, compositionOverride: { motion: 'pan' } });
    expect(result.scenes[1]).toBe(scenes[0]);
    expect(result.scenes[2]).toBe(scenes[2]);
  });

  it('keeps opaque canonical IDs outside Studio, Recipe, scene, and final executable identity', async () => {
    const firstInput = recipeInput();
    const secondInput = structuredClone(firstInput);
    secondInput.scenes.forEach((scene, index) => { scene.sceneId = `visual-scene-99999999-9999-4999-8999-${String(index + 1).padStart(12, '0')}`; });

    expect(canonicalStudioCompositionOutput(firstInput.scenes, DEFAULTS)).toEqual(canonicalStudioCompositionOutput(secondInput.scenes, DEFAULTS));
    const firstRecipe = normalizeStudioProductionRecipeV1(firstInput, ownerContext());
    const secondRecipe = normalizeStudioProductionRecipeV1(secondInput, ownerContext());
    expect(firstRecipe.identity).toBe(secondRecipe.identity);
    expect(firstRecipe.recipe.scenes.map((scene) => scene.canonicalSceneId)).not.toEqual(secondRecipe.recipe.scenes.map((scene) => scene.canonicalSceneId));

    const first = await build(firstInput);
    const identityOnly = structuredClone(first.manifest);
    const oldId = identityOnly.timeline.scenes[0].id;
    const newId = secondInput.scenes[0].sceneId;
    identityOnly.timeline.scenes[0].id = newId;
    identityOnly.timeline.scenes[0].sourceScene.sceneId = newId;
    identityOnly.assets.forEach((asset) => { if (asset.metadata.sceneId === oldId) Object.assign(asset.metadata, { sceneId: newId }); });
    identityOnly.timeline.tracks.forEach((track) => track.clips.forEach((clip) => { if (clip.sceneId === oldId) clip.sceneId = newId; }));
    identityOnly.subtitles.cues.forEach((cue) => { if (cue.sceneId === oldId) cue.sceneId = newId; });
    identityOnly.audio.voice.forEach((cue) => { if (cue.sceneId === oldId) cue.sceneId = newId; });
    identityOnly.audio.sfx.forEach((cue) => { if (cue.sceneId === oldId) cue.sceneId = newId; });

    expect(await createSceneFingerprint(first.manifest.timeline.scenes[0], first.manifest, PRESET))
      .toBe(await createSceneFingerprint(identityOnly.timeline.scenes[0], identityOnly, PRESET));
    expect(await fingerprint(first.manifest)).toBe(await fingerprint(identityOnly));
  });

  it.each([
    null,
    [],
    {},
    { motion: null },
    { motion: {} },
    { motion: '' },
    { motion: 'ZOOM_IN' },
    { motion: ' zoom_in ' },
    { motion: "zoompan=z='unsafe'" },
    { transition: null },
    { transition: {} },
    { transition: '' },
    { transition: 'Crossfade' },
    { transition: ' crossfade ' },
    { transition: 'xfade=transition=wipeleft' },
    { motion: 'zoom_in', extra: true },
  ])('rejects malformed hydrated override %#', (compositionOverride) => {
    const input = recipeInput();
    input.scenes[1].compositionOverride = compositionOverride as never;
    expect(() => normalizeStudioProductionRecipeV1(input, ownerContext())).toThrow(/invalid/i);
  });

  it('persists valid overrides through the established draft shape', () => {
    const input = recipeInput();
    input.scenes[1].compositionOverride = { motion: 'pan' };
    const draft = {
      ...input, version: 1, savedAt: '2026-09-03T00:00:00.000Z', step: 'render', channelId: 'channel', topic: 'topic', niche: '', tone: '', duration: 12,
      hook: '', script: 'script', cta: '', targetLanguage: 'tr', selectedVoice: '', browserTtsFinalIntent: undefined,
    } as StudioDraft;
    const restored = studioProductionRecipeInputFromDraft(normalizeStudioDraft(draft));
    expect(restored.scenes[1].compositionOverride).toEqual({ motion: 'pan' });
    expect(resolveEffectiveSceneComposition({ motion: restored.motionStyle, transition: 'crossfade' }, restored.scenes[1].compositionOverride, 1))
      .toEqual({ motion: 'pan', transition: 'crossfade' });
  });

  it('uses one incoming-boundary authority for a mixed four-scene Media Engine and FFmpeg plan', async () => {
    const input = recipeInput();
    input.scenes = [...input.scenes, {
      sceneId: 'visual-scene-00000000-0000-4000-8000-000000000004', text: 'Scene 4', duration: 4, visual: 'Visual', keywords: ['visual'],
      imageStorage: { bucket: 'media', objectPath: `${TEST_OWNER}/generated-images/00000000-0000-4000-8000-000000000003.png` },
      imageDisplayGeometry: trustedGeometry(`media:${TEST_OWNER}/generated-images/00000000-0000-4000-8000-000000000003.png`, 1200, 800, 'identity'),
    }];
    input.motionStyle = 'static';
    input.transitionStyle = 'crossfade';
    input.scenes[1].compositionOverride = { motion: 'zoom_in', transition: 'none' };
    input.scenes[3].compositionOverride = { motion: 'zoom_out', transition: 'crossfade' };

    const normalized = normalizeStudioProductionRecipeV1(input, ownerContext());
    const compiled = compileStudioProductionRecipeV1(normalized);
    expect(compiled.sceneComposition).toEqual([
      { motion: { mode: 'none' }, transition: { type: 'cut' } },
      { motion: { mode: 'zoom_in' }, transition: { type: 'cut' } },
      { motion: { mode: 'none' }, transition: { type: 'crossfade' } },
      { motion: { mode: 'zoom_out' }, transition: { type: 'crossfade' } },
    ]);
    expect(normalized.recipe.scenes[3].compositionOverride).toEqual({ motion: 'zoom_out' });

    const result = await build(input);
    const scenes = result.manifest.timeline.scenes;
    expect(scenes.map((scene) => scene.cameraMotion)).toEqual(['none', 'zoom_in', 'none', 'zoom_out']);
    expect(scenes.map((scene) => scene.transition.type)).toEqual(['cut', 'cut', 'crossfade', 'crossfade']);
    expect(scenes.map((scene) => scene.overlapBeforeMs > 0)).toEqual([false, false, true, true]);
    expect(scenes.map((scene) => scene.overlapAfterMs > 0)).toEqual([false, true, true, false]);
    expect(result.manifest.durationMs).toBeCloseTo(scenes.reduce((sum, scene) => sum + scene.durationMs - scene.overlapBeforeMs, 0), 5);
    expect(result.audioTimeline.durationMs).toBe(result.manifest.durationMs);
    expect(result.subtitleTimeline.durationMs).toBe(result.manifest.durationMs);
    expect(result.manifest.timeline.tracks.find((track) => track.type === 'video')?.clips.map((clip) => clip.metadata.cameraMotion))
      .toEqual(['none', 'zoom_in', 'none', 'zoom_out']);

    const command = buildFFmpegCommand({ manifest: result.manifest, preset: PRESET });
    const filter = command.args[command.args.indexOf('-filter_complex') + 1];
    expect(filter.match(/xfade=transition=fade/g)).toHaveLength(2);
    expect(filter).toContain('concat=n=2:v=1:a=0');
  });

  it('computes alternating crossfade/none boundaries without timeline or AV drift', async () => {
    const input = recipeInput();
    input.scenes = Array.from({ length: 5 }, (_, index) => ({
      sceneId: `visual-scene-00000000-0000-4000-8000-00000000001${index}`, text: `Alternating scene ${index + 1}`, duration: 4, visual: 'Visual', keywords: ['visual'],
      imageStorage: { bucket: 'media' as const, objectPath: `${TEST_OWNER}/generated-images/10000000-0000-4000-8000-00000000000${index}.png` },
      imageDisplayGeometry: trustedGeometry(`media:${TEST_OWNER}/generated-images/10000000-0000-4000-8000-00000000000${index}.png`, 1200, 800, 'identity'),
      ...(index === 2 || index === 4 ? { compositionOverride: { transition: 'none' as const } } : {}),
    }));
    input.transitionStyle = 'crossfade';
    const result = await build(input);
    const scenes = result.manifest.timeline.scenes;

    expect(scenes.map((scene) => scene.transition.type)).toEqual(['cut', 'crossfade', 'cut', 'crossfade', 'cut']);
    expect(scenes.map((scene) => scene.overlapBeforeMs > 0)).toEqual([false, true, false, true, false]);
    const expectedDuration = scenes.reduce((sum, scene) => sum + scene.durationMs - scene.overlapBeforeMs, 0);
    expect(result.manifest.durationMs).toBeCloseTo(expectedDuration, 5);
    expect(result.audioTimeline.durationMs).toBe(result.manifest.durationMs);
    expect(result.subtitleTimeline.durationMs).toBe(result.manifest.durationMs);
    expect(Math.max(...result.subtitleTimeline.cues.map((cue) => cue.endMs))).toBeLessThanOrEqual(result.manifest.durationMs);
  });

  it('makes draft normalization deviation-only and keeps redundant state artifact-fresh', () => {
    const input = recipeInput();
    input.scenes[0].compositionOverride = { transition: 'crossfade' };
    input.scenes[1].compositionOverride = { motion: 'kenburns', transition: 'crossfade' };
    const draft = draftFrom(input);
    const normalized = normalizeStudioDraft(draft);
    expect(normalized.scenes[0].compositionOverride).toBeUndefined();
    expect(normalized.scenes[1].compositionOverride).toBeUndefined();
    const changedDefault = normalizeStudioDraft({ ...normalized, motionStyle: 'zoom_out' });
    expect(resolveEffectiveSceneComposition(
      { motion: changedDefault.motionStyle, transition: 'crossfade' },
      changedDefault.scenes[1].compositionOverride,
      1,
    ).motion).toBe('zoom_out');
    expect(canonicalStudioCompositionOutput(input.scenes, DEFAULTS))
      .toEqual(canonicalStudioCompositionOutput(recipeInput().scenes, DEFAULTS));
    const changed = recipeInput().scenes;
    changed[1].compositionOverride = { motion: 'zoom_in' };
    expect(canonicalStudioCompositionOutput(changed, DEFAULTS))
      .not.toEqual(canonicalStudioCompositionOutput(recipeInput().scenes, DEFAULTS));
  });

  it('round-trips overrides through JSON hydration with identical effective output and render fingerprint', async () => {
    const input = recipeInput();
    input.scenes[1].compositionOverride = { motion: 'pan', transition: 'none' };
    const saved = normalizeStudioDraft(draftFrom(input));
    const hydrated = normalizeStudioDraft(JSON.parse(JSON.stringify(saved)) as StudioDraft);
    const restored = studioProductionRecipeInputFromDraft(hydrated);
    expect(restored.scenes.every((scene) => scene.imageDisplayGeometry === undefined)).toBe(true);
    restored.scenes = restored.scenes.map((scene, index) => ({ ...scene, imageDisplayGeometry: input.scenes[index].imageDisplayGeometry }));
    const [before, after] = await Promise.all([build(input), build(restored)]);

    expect(restored.scenes[1].compositionOverride).toEqual({ motion: 'pan', transition: 'none' });
    expect(after.manifest.timeline.scenes.map((scene) => [scene.cameraMotion, scene.transition.type]))
      .toEqual(before.manifest.timeline.scenes.map((scene) => [scene.cameraMotion, scene.transition.type]));
    expect(await fingerprint(after.manifest)).toBe(await fingerprint(before.manifest));
  });

  it('keeps zero-boundary transition output-equivalent but fingerprints meaningful boundaries', async () => {
    const crossfade = recipeInput();
    crossfade.scenes = [crossfade.scenes[0]];
    const none = structuredClone(crossfade);
    none.transitionStyle = 'none';
    const [crossfadeBuild, noneBuild] = await Promise.all([build(crossfade), build(none)]);
    expect(crossfadeBuild.manifest.timeline.scenes[0].transition.type).toBe('cut');
    expect(await fingerprint(crossfadeBuild.manifest)).toBe(await fingerprint(noneBuild.manifest));

    const meaningful = recipeInput();
    meaningful.transitionStyle = 'none';
    expect(await fingerprint(await awaitManifest(meaningful))).not.toBe(await fingerprint(await awaitManifest(recipeInput())));
  });

  it('fails closed instead of silently ignoring raw overrides on alternate Media Engine paths', async () => {
    const bus = new TypedEventBus<ApplicationEventMap>();
    const media = createMediaEngine(bus, createAssetProviderEngine(bus));
    const input = recipeInput();
    input.scenes[1].compositionOverride = { motion: 'zoom_in' };
    await expect(media.buildProject({ projectId: input.projectId, title: input.title, scenes: [...input.scenes] }))
      .rejects.toThrow(/require canonical Recipe compilation/i);
    await expect(media.buildProject({
      projectId: input.projectId,
      title: input.title,
      scenes: [...recipeInput().scenes],
      sceneImageGeometryAuthorities: [{ authorityReference: 'idga1_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', mediaIdentity: `media:${input.scenes[0].imageStorage!.objectPath}`, expectedOrientation: 'rotate-90-cw', contentDigest: 'a'.repeat(64), encodedDimensions: { width: 1200, height: 800 }, displayDimensions: { width: 800, height: 1200 } }, null, null],
    })).rejects.toThrow(/compilation authority is invalid/i);
  });

  it('rejects malformed current mutation state and prototype-shaped compiled composition', async () => {
    const scenes = recipeInput().scenes;
    scenes[1].compositionOverride = { motion: 'zoom_in', unsafe: 'value' } as never;
    expect(() => setSceneCompositionOverride(scenes, target(scenes, 1), { transition: 'none' }, DEFAULTS)).toThrow(/invalid/i);
    expect(() => clearSceneCompositionOverride(scenes, target(scenes, 1), 'motion')).toThrow(/invalid/i);

    const compiled = compileStudioProductionRecipeV1(normalizeStudioProductionRecipeV1(recipeInput(), ownerContext()));
    const inherited = Object.create({
      motion: { mode: 'zoom_in' },
      transition: { type: 'crossfade' },
    }) as Record<string, unknown>;
    inherited.extraA = true;
    inherited.extraB = true;
    const bus = new TypedEventBus<ApplicationEventMap>();
    await expect(createMediaEngine(bus, createAssetProviderEngine(bus)).buildProject({
      ...compiled,
      sceneComposition: [compiled.sceneComposition![0], inherited, ...compiled.sceneComposition!.slice(2)] as never,
    })).rejects.toThrow(/invalid/i);
    await expect(createMediaEngine(bus, createAssetProviderEngine(bus)).buildProject({
      ...compiled,
      sceneComposition: [
        { motion: { mode: 'none' }, transition: { type: 'crossfade' } },
        ...compiled.sceneComposition!.slice(1),
      ],
    })).rejects.toThrow(/compilation authority is invalid/i);
  });

  it('does not canonicalize forged Recipe values into safe-looking renderer defaults', () => {
    const motion = structuredClone(normalizeStudioProductionRecipeV1(recipeInput(), ownerContext()));
    (motion.recipe.composition as { motion: string }).motion = "zoompan=z='unsafe'";
    expect(() => compileStudioProductionRecipeV1(motion)).toThrow(/normalization authority is invalid/i);

    const transition = structuredClone(normalizeStudioProductionRecipeV1(recipeInput(), ownerContext()));
    (transition.recipe.composition as { transition: string }).transition = 'xfade=wipeleft';
    expect(() => compileStudioProductionRecipeV1(transition)).toThrow(/normalization authority is invalid/i);
  });
});

async function build(input: StudioProductionRecipeInput) {
  const bus = new TypedEventBus<ApplicationEventMap>();
  const media = createMediaEngine(bus, createAssetProviderEngine(bus));
  return media.buildProject(compileStudioProductionRecipeV1(normalizeStudioProductionRecipeV1(input, ownerContext())));
}

function fingerprint(manifest: Awaited<ReturnType<typeof build>>['manifest']) {
  return createRenderFingerprint({ manifest, preset: PRESET, adapterId: 'ffmpeg' });
}

async function awaitManifest(input: StudioProductionRecipeInput) {
  return (await build(input)).manifest;
}

function draftFrom(input: StudioProductionRecipeInput): StudioDraft {
  return {
    ...input, version: 1, savedAt: '2026-09-03T00:00:00.000Z', step: 'render', channelId: 'channel', topic: 'topic', niche: '', tone: '', duration: 12,
    hook: '', script: 'script', cta: '', targetLanguage: 'tr', selectedVoice: '', browserTtsFinalIntent: undefined,
  } as StudioDraft;
}

function recipeInput(): StudioProductionRecipeInput {
  return {
    projectId: 'scene-composition-project', title: 'Scene composition',
    scenes: [0, 1, 2].map((index) => {
      const objectPath = `${TEST_OWNER}/generated-images/00000000-0000-4000-8000-00000000000${index}.png`;
      return {
        sceneId: `visual-scene-00000000-0000-4000-8000-00000000000${index}`, text: `Scene ${index + 1}`, duration: 4, visual: 'Visual', keywords: ['visual'],
        imageStorage: { bucket: 'media' as const, objectPath },
        imageDisplayGeometry: trustedGeometry(`media:${objectPath}`, 1200, 800, 'identity'),
      };
    }),
    captionStyle: 'karaoke', transitionStyle: 'crossfade', motionStyle: 'kenburns', showSubtitles: true,
    captionTextColor: '', captionHighlightColor: '', voiceoverMode: 'none', narration: null,
    musicId: '', musicStorage: null, musicVolume: 0, beatSync: false,
    watermarkText: '', watermarkPosition: 'bottom-right', visualMode: 'auto', selectedStyleId: '', characterProfileId: '',
    useBroll: false, characterName: '', characterAppearance: '', characterArtStyle: '',
  };
}

function ownerContext() {
  setValidatedOwnerId(TEST_OWNER);
  return captureValidatedMediaOwnerContext();
}

function trustedGeometry(mediaIdentity: string, width: number, height: number, orientation: ImageEncodedToDisplayOrientation) {
  return {
    ...createImageDisplayGeometry(mediaIdentity, width, height, orientation),
    contentDigest: 'a'.repeat(64),
    executionAuthority: { version: 1 as const, reference: 'idga1_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', expiresAt: '2099-01-01T00:00:00.000Z' },
  };
}

function target(scenes: readonly Scene[], sceneIndex: number) {
  return { sceneId: scenes[sceneIndex].sceneId, sceneIndex };
}
