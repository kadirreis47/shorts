import { describe, expect, it } from 'vitest';
import {
  compileStudioProductionRecipeV1,
  createAssetProviderEngine,
  createMediaEngine,
  canonicalSubtitleStyle,
  normalizeStudioProductionRecipeV1,
  type SubtitleCue,
  type SubtitleStyle,
} from '@/core/media';
import type { StudioProductionRecipeInput } from '@/core/media';
import { studioProductionRecipeInputFromDraft, type StudioDraft } from '@/lib/studioDraft';
import { createRenderFingerprint } from '@/core/render/renderFingerprint';
import { TypedEventBus } from '@/core/events/eventBus';
import type { ApplicationEventMap } from '@/core/events';
import { captureValidatedMediaOwnerContext } from '@/lib/mediaStorage';
import { setValidatedOwnerId } from '@/auth/identity';
import { buildCanonicalSubtitleRenderPlan, buildFFmpegCommand, buildSegmentConcatCommand, type RenderPreset } from '@/core/render';

const OWNER_A = 'owner-a';
const RENDER_PRESET: RenderPreset = { id: 'recipe-subtitles', name: 'Recipe subtitles', container: 'mp4', videoCodec: 'h264', audioCodec: 'aac', frameRate: 30, quality: 'standard', hardwareAcceleration: 'disabled' };

describe('StudioProductionRecipeV1', () => {
  it('normalizes the same logical Studio state deterministically', () => {
    const first = normalizeStudioProductionRecipeV1(recipeInput(), ownerContext());
    const second = normalizeStudioProductionRecipeV1(recipeInput(), ownerContext());

    expect(first.recipe).toEqual(second.recipe);
    expect(first.identity).toBe(second.identity);
    expect(first.recipe.scenes[0]).toMatchObject({ id: 'scene-1', order: 0 });
  });

  it('uses stable private identity instead of transient playback URLs', () => {
    const first = normalizeStudioProductionRecipeV1(recipeInput(), ownerContext());
    const rotated = recipeInput();
    rotated.scenes = [{ ...rotated.scenes[0], imageUrl: 'https://example.test/rotated-playback-url.jpg' }];
    const second = normalizeStudioProductionRecipeV1(rotated, ownerContext());

    expect(first.identity).toBe(second.identity);
    expect(JSON.stringify(first.recipe)).not.toContain('signed');
    expect(JSON.stringify(first.recipe)).not.toContain('blob:');
  });

  it('keeps bounded Pexels provenance separate from Recipe V1 output identity', async () => {
    const firstInput = recipeInput();
    firstInput.scenes = [{
      ...firstInput.scenes[0],
      imageProvenance: { provider: 'pexels', providerMediaId: 42, originalSourceUrl: 'https://images.pexels.com/photos/42/original.jpg', creator: 'Creator', providerPageUrl: 'https://www.pexels.com/photo/42/', query: 'first query' },
    }];
    const changedProvenance = structuredClone(firstInput);
    changedProvenance.scenes[0].imageProvenance!.query = 'changed query';
    const first = normalizeStudioProductionRecipeV1(firstInput, ownerContext());
    const second = normalizeStudioProductionRecipeV1(changedProvenance, ownerContext());

    expect(first.recipe.scenes[0].media).toMatchObject({ type: 'image', storage: firstInput.scenes[0].imageStorage, sourceUrl: null, provenance: { providerMediaId: 42 } });
    expect(first.identity).toBe(second.identity);
    const bus = new TypedEventBus<ApplicationEventMap>();
    const media = createMediaEngine(bus, createAssetProviderEngine(bus));
    const firstBuild = await media.buildProject(compileStudioProductionRecipeV1(first));
    const provenanceOnlyManifest = structuredClone(firstBuild.manifest);
    provenanceOnlyManifest.assets[0].metadata = { ...provenanceOnlyManifest.assets[0].metadata, providerProvenance: second.recipe.scenes[0].media?.provenance };
    provenanceOnlyManifest.timeline.scenes[0].sourceScene.imageProvenance = second.recipe.scenes[0].media?.provenance ?? undefined;
    const embeddedRecipe = provenanceOnlyManifest.metadata.productionRecipe as unknown as { recipe: { scenes: Array<{ media: { provenance?: unknown } | null }> } } | undefined;
    if (embeddedRecipe?.recipe.scenes[0].media) {
      embeddedRecipe.recipe.scenes[0].media.provenance = second.recipe.scenes[0].media?.provenance;
    }
    expect(await createRenderFingerprint({ manifest: firstBuild.manifest, preset: RENDER_PRESET, adapterId: 'ffmpeg' }))
      .toBe(await createRenderFingerprint({ manifest: provenanceOnlyManifest, preset: RENDER_PRESET, adapterId: 'ffmpeg' }));

    const replaced = structuredClone(firstInput);
    replaced.scenes[0].imageStorage!.objectPath = 'owner-a/generated-images/00000000-0000-4000-8000-000000000099.png';
    expect(normalizeStudioProductionRecipeV1(replaced, ownerContext()).identity).not.toBe(first.identity);
  });

  it('keeps durable Pexels video provenance informational while rejecting its quarantine as canonical media', () => {
    const input = recipeInput();
    input.scenes = [{
      text: 'Video scene', duration: 4, visual: 'Visual', keywords: ['visual'],
      videoStorage: { bucket: 'media', objectPath: 'owner-a/videos/00000000-0000-4000-8000-000000000042.mp4' },
      videoUrl: 'https://signed.example/private-video.mp4?token=rotated',
      videoProvenance: { provider: 'pexels', providerMediaId: 42, originalSourceUrl: 'https://www.pexels.com/video/42/', creator: 'Creator', providerPageUrl: 'https://www.pexels.com/video/42/', query: 'first query' },
    }];
    const changed = structuredClone(input);
    changed.scenes[0].videoProvenance!.query = 'changed query';
    expect(normalizeStudioProductionRecipeV1(input, ownerContext()).identity)
      .toBe(normalizeStudioProductionRecipeV1(changed, ownerContext()).identity);
    expect(normalizeStudioProductionRecipeV1(input, ownerContext()).recipe.scenes[0].media)
      .toMatchObject({ type: 'video', storage: input.scenes[0].videoStorage, sourceUrl: null, provenance: { providerMediaId: 42 } });

    const quarantine = structuredClone(input);
    quarantine.scenes[0].videoStorage!.objectPath = 'owner-a/pexels-video-quarantine/00000000-0000-4000-8000-000000000042.mp4';
    expect(() => normalizeStudioProductionRecipeV1(quarantine, ownerContext())).toThrow(/identity is invalid/i);
  });

  it('changes recipe identity for approved production decisions', () => {
    const baseline = normalizeStudioProductionRecipeV1(recipeInput(), ownerContext());
    const changed = recipeInput();
    changed.motionStyle = 'zoom_in';
    changed.transitionStyle = 'none';
    changed.captionTextColor = '#FF00AA';
    changed.watermarkText = '@ShortsFlow';

    expect(normalizeStudioProductionRecipeV1(changed, ownerContext()).identity).not.toBe(baseline.identity);
  });

  it('keeps visual-planning identity outside Recipe V1 while durable media remains significant', () => {
    const baseline = recipeInput();
    baseline.scenes[0].visualPlanningId = 'visual-scene-00000000-0000-4000-8000-000000000001';
    const planningOnly = structuredClone(baseline);
    planningOnly.scenes[0].visualPlanningId = 'visual-scene-00000000-0000-4000-8000-000000000099';
    const changedMedia = structuredClone(planningOnly);
    changedMedia.scenes[0].imageStorage!.objectPath = 'owner-a/generated-images/00000000-0000-4000-8000-000000000099.png';

    const normalized = normalizeStudioProductionRecipeV1(baseline, ownerContext());
    expect(normalizeStudioProductionRecipeV1(planningOnly, ownerContext()).identity).toBe(normalized.identity);
    expect(normalizeStudioProductionRecipeV1(planningOnly, ownerContext()).recipe).toEqual(normalized.recipe);
    expect(normalizeStudioProductionRecipeV1(changedMedia, ownerContext()).identity).not.toBe(normalized.identity);
  });

  it('normalizes every unsupported legacy transition to the effective None/cut identity', async () => {
    const none = recipeInput();
    none.transitionStyle = 'none';
    const normalizedNone = normalizeStudioProductionRecipeV1(none, ownerContext());
    const bus = new TypedEventBus<ApplicationEventMap>();
    const media = createMediaEngine(bus, createAssetProviderEngine(bus));
    const noneBuild = await media.buildProject(compileStudioProductionRecipeV1(normalizedNone));
    const fingerprint = (manifest: Awaited<typeof noneBuild>['manifest']) => createRenderFingerprint({
      manifest,
      preset: RENDER_PRESET,
      adapterId: 'ffmpeg',
    });

    for (const transitionStyle of ['slide', 'zoom', 'fadeblack', 'glitch', 'shake', 'whippan'] as const) {
      const legacy = recipeInput();
      legacy.transitionStyle = transitionStyle;
      const normalizedLegacy = normalizeStudioProductionRecipeV1(legacy, ownerContext());
      const legacyBuild = await media.buildProject(compileStudioProductionRecipeV1(normalizedLegacy));

      expect(normalizedLegacy.recipe.composition.transition).toBe('none');
      expect(normalizedLegacy.identity).toBe(normalizedNone.identity);
      expect(compileStudioProductionRecipeV1(normalizedLegacy)).toEqual(compileStudioProductionRecipeV1(normalizedNone));
      expect(legacyBuild.manifest.timeline.scenes.map((scene) => ({
        durationMs: scene.durationMs,
        startMs: scene.startMs,
        endMs: scene.endMs,
        overlapBeforeMs: scene.overlapBeforeMs,
        overlapAfterMs: scene.overlapAfterMs,
        transition: scene.transition,
      }))).toEqual(noneBuild.manifest.timeline.scenes.map((scene) => ({
        durationMs: scene.durationMs,
        startMs: scene.startMs,
        endMs: scene.endMs,
        overlapBeforeMs: scene.overlapBeforeMs,
        overlapAfterMs: scene.overlapAfterMs,
        transition: scene.transition,
      })));
      const manifestWithEquivalentLegacyRecipe = structuredClone(noneBuild.manifest);
      manifestWithEquivalentLegacyRecipe.metadata.productionRecipe = normalizedLegacy;
      expect(await fingerprint(manifestWithEquivalentLegacyRecipe)).toBe(await fingerprint(noneBuild.manifest));
    }

    const crossfade = recipeInput();
    crossfade.transitionStyle = 'crossfade';
    const normalizedCrossfade = normalizeStudioProductionRecipeV1(crossfade, ownerContext());
    expect(normalizedCrossfade.identity).not.toBe(normalizedNone.identity);
    expect(compileStudioProductionRecipeV1(normalizedCrossfade).transition).toEqual({ type: 'crossfade' });
  });

  it.each([
    ['visibility', (input: StudioProductionRecipeInput) => { input.showSubtitles = false; }],
    ['preset', (input: StudioProductionRecipeInput) => { input.captionStyle = 'classic'; }],
    ['text color', (input: StudioProductionRecipeInput) => { input.captionTextColor = '#FF00AA'; }],
    ['highlight color', (input: StudioProductionRecipeInput) => { input.captionHighlightColor = '#00FF00'; }],
  ])('changes Recipe V1 identity for canonical subtitle %s', (_name, mutate) => {
    const baseline = normalizeStudioProductionRecipeV1(recipeInput(), ownerContext());
    const changed = recipeInput();
    mutate(changed);
    expect(normalizeStudioProductionRecipeV1(changed, ownerContext()).identity).not.toBe(baseline.identity);
  });

  it('feeds recipe identity into the canonical render fingerprint without execution URLs', async () => {
    const first = normalizeStudioProductionRecipeV1(recipeInput(), ownerContext());
    const changedInput = recipeInput();
    changedInput.watermarkText = '@ShortsFlow';
    const changed = normalizeStudioProductionRecipeV1(changedInput, ownerContext());

    const fingerprint = (productionRecipe: typeof first) => createRenderFingerprint({
      manifest: {
        schemaVersion: '1.4', projectId: 'recipe-project', createdAt: 'fixed', durationMs: 4_000,
        render: { fps: 30, width: 1080, height: 1920, aspectRatio: '9:16' }, assets: [],
        timeline: { scenes: [], tracks: [], markers: [], durationMs: 4_000, metrics: {} },
        subtitles: { cues: [], words: [], style: {}, metrics: {}, source: 'estimated', language: 'tr', durationMs: 4_000 },
        audio: { narrationMode: 'silent', voice: [], music: [], sfx: [], automation: [], settings: {} }, validation: null,
        metadata: { title: 'Recipe video', source: 'ai-script', createdAt: 'fixed', updatedAt: 'fixed', tags: [], productionRecipe },
      } as never,
      preset: { id: 'preset', name: 'Preset', container: 'mp4', videoCodec: 'h264', audioCodec: 'aac', frameRate: 30, quality: 'standard', hardwareAcceleration: 'disabled' },
      adapterId: 'ffmpeg',
    });

    expect(await fingerprint(first)).not.toBe(await fingerprint(changed));
  });

  it('rejects foreign, signed, Blob, and malformed durable media identities', () => {
    const foreign = recipeInput();
    foreign.scenes = [{ ...foreign.scenes[0], imageStorage: { bucket: 'media', objectPath: 'owner-b/generated-images/00000000-0000-4000-8000-000000000000.png' } }];
    expect(() => normalizeStudioProductionRecipeV1(foreign, ownerContext())).toThrow(/not owned/i);

    const signed = recipeInput();
    signed.scenes = [{ text: 'Scene one', duration: 4, visual: 'Visual', imageUrl: 'https://example.test/storage/v1/object/sign/media/a.jpg?token=signed' }];
    expect(() => normalizeStudioProductionRecipeV1(signed, ownerContext())).toThrow(/durable private identity|trusted HTTPS/i);

    const tokenizedExternal = recipeInput();
    tokenizedExternal.scenes = [{ text: 'Scene one', duration: 4, visual: 'Visual', imageUrl: 'https://example.test/a.jpg?access_token=secret' }];
    expect(() => normalizeStudioProductionRecipeV1(tokenizedExternal, ownerContext())).toThrow(/durable private identity|trusted HTTPS/i);

    const blob = recipeInput();
    blob.scenes = [{ text: 'Scene one', duration: 4, visual: 'Visual', imageUrl: 'blob:preview' }];
    expect(() => normalizeStudioProductionRecipeV1(blob, ownerContext())).toThrow(/durable private identity|trusted HTTPS/i);
  });

  it('accepts an authenticated owner JPEG private image and rejects foreign or malformed JPEG identities', () => {
    const ownJpeg = recipeInput();
    ownJpeg.scenes = [{
      ...ownJpeg.scenes[0],
      imageStorage: { bucket: 'media', objectPath: 'owner-a/generated-images/00000000-0000-4000-8000-000000000001.jpg' },
    }];
    const normalized = normalizeStudioProductionRecipeV1(ownJpeg, ownerContext());
    expect(normalized.recipe.scenes[0].media).toEqual({
      type: 'image',
      storage: { bucket: 'media', objectPath: 'owner-a/generated-images/00000000-0000-4000-8000-000000000001.jpg' },
      sourceUrl: null,
    });

    const foreignJpeg = recipeInput();
    foreignJpeg.scenes = [{
      ...foreignJpeg.scenes[0],
      imageStorage: { bucket: 'media', objectPath: 'owner-b/generated-images/00000000-0000-4000-8000-000000000001.jpg' },
    }];
    expect(() => normalizeStudioProductionRecipeV1(foreignJpeg, ownerContext())).toThrow(/not owned/i);

    const malformedJpeg = recipeInput();
    malformedJpeg.scenes = [{
      ...malformedJpeg.scenes[0],
      imageStorage: { bucket: 'media', objectPath: 'owner-a/generated-images/00000000-0000-4000-8000-000000000001.jpeg' },
    }];
    expect(() => normalizeStudioProductionRecipeV1(malformedJpeg, ownerContext())).toThrow(/identity is invalid/i);
  });

  it('rejects a stale owner context before it can compile an A recipe for B', () => {
    const staleA = ownerContext();
    setValidatedOwnerId('owner-b');
    expect(() => normalizeStudioProductionRecipeV1(recipeInput(), staleA)).toThrow(/authenticated user changed/i);
  });

  it('compiles durable ElevenLabs narration into the existing MediaProject input', () => {
    const normalized = normalizeStudioProductionRecipeV1(recipeInput(), ownerContext());
    const compiled = compileStudioProductionRecipeV1(normalized);

    expect(compiled).toMatchObject({
      projectId: 'recipe-project',
      audio: { narrationMode: 'required' },
      narration: {
        storage: { bucket: 'media', objectPath: 'owner-a/voiceovers/00000000-0000-4000-8000-000000000000.mp3' },
        durationMs: 25_000,
        voiceId: 'voice-a',
      },
      productionRecipe: { identity: normalized.identity },
      subtitles: { enabled: true, preset: 'karaoke', textColor: null, highlightColor: null },
    });
  });

  it('keeps validated narration timing fingerprint-significant while legacy narration stays valid', () => {
    const legacy = normalizeStudioProductionRecipeV1(recipeInput(), ownerContext());
    const alignedInput = recipeInput();
    alignedInput.narration = {
      ...alignedInput.narration!,
      alignment: { characters: ['H', 'i'], characterStartTimesMs: [0, 80], characterEndTimesMs: [80, 160] },
    };
    const aligned = normalizeStudioProductionRecipeV1(alignedInput, ownerContext());
    const changed = structuredClone(alignedInput);
    changed.narration = { ...changed.narration!, alignment: { ...changed.narration!.alignment!, characterStartTimesMs: [0, 90] } };
    expect(aligned.identity).not.toBe(legacy.identity);
    expect(normalizeStudioProductionRecipeV1(changed, ownerContext()).identity).not.toBe(aligned.identity);
  });

  it('compiles only owner-scoped durable music into the existing canonical audio timeline', async () => {
    const normalized = normalizeStudioProductionRecipeV1(recipeInput(), ownerContext());
    const compiled = compileStudioProductionRecipeV1(normalized);
    const bus = new TypedEventBus<ApplicationEventMap>();
    const build = await createMediaEngine(bus, createAssetProviderEngine(bus)).buildProject(compiled);

    expect(compiled.music).toEqual({
      storage: { bucket: 'media', objectPath: 'owner-a/music/00000000-0000-4000-8000-000000000000.mp3' },
      volume: .25,
    });
    expect(build.manifest.assets).toContainEqual(expect.objectContaining({
      type: 'music', metadata: expect.objectContaining({ storageObjectPath: 'owner-a/music/00000000-0000-4000-8000-000000000000.mp3' }),
    }));
    expect(build.manifest.audio.music).toMatchObject([{ assetId: expect.any(String), gain: .25, startMs: 0, endMs: build.manifest.durationMs }]);
  });

  it('rejects selected transient or foreign music before it can become canonical media', () => {
    const missing = recipeInput();
    delete missing.musicStorage;
    expect(() => normalizeStudioProductionRecipeV1(missing, ownerContext())).toThrow(/durable private media identity/i);

    const foreign = recipeInput();
    foreign.musicStorage = { bucket: 'media', objectPath: 'owner-b/music/00000000-0000-4000-8000-000000000000.mp3' };
    expect(() => normalizeStudioProductionRecipeV1(foreign, ownerContext())).toThrow(/not owned/i);
  });

  it('keeps legacy Beat Sync intent out of canonical recipe and media-project identity', () => {
    const enabled = recipeInput();
    const disabled = { ...recipeInput(), beatSync: false };
    const normalizedEnabled = normalizeStudioProductionRecipeV1(enabled, ownerContext());
    const normalizedDisabled = normalizeStudioProductionRecipeV1(disabled, ownerContext());

    expect(normalizedEnabled.identity).toBe(normalizedDisabled.identity);
    expect(normalizedEnabled.recipe).toEqual(normalizedDisabled.recipe);
    expect(compileStudioProductionRecipeV1(normalizedEnabled)).toEqual(compileStudioProductionRecipeV1(normalizedDisabled));
  });

  it('changes final recipe identity for canonical music-only edits while leaving scene segment semantics music-neutral', () => {
    const baseline = normalizeStudioProductionRecipeV1(recipeInput(), ownerContext());
    const changedVolume = recipeInput();
    changedVolume.musicVolume = .4;
    const changedAsset = recipeInput();
    changedAsset.musicStorage = { bucket: 'media', objectPath: 'owner-a/music/00000000-0000-4000-8000-000000000099.mp3' };
    expect(normalizeStudioProductionRecipeV1(changedVolume, ownerContext()).identity).not.toBe(baseline.identity);
    expect(normalizeStudioProductionRecipeV1(changedAsset, ownerContext()).identity).not.toBe(baseline.identity);
  });

  it('compiles bounded Recipe V1 subtitle intent into canonical media input', () => {
    const input = recipeInput();
    input.captionStyle = 'minimal';
    input.captionTextColor = '#ff00aa';
    input.captionHighlightColor = '#00ff00';
    const compiled = compileStudioProductionRecipeV1(normalizeStudioProductionRecipeV1(input, ownerContext()));

    expect(compiled.subtitles).toEqual({ enabled: true, preset: 'minimal', textColor: '#FF00AA', highlightColor: '#00FF00' });
  });

  it('makes disabled Recipe V1 subtitles canonically empty and export-ready in both execution paths', async () => {
    const input = recipeInput();
    input.showSubtitles = false;
    const normalized = normalizeStudioProductionRecipeV1(input, ownerContext());
    const bus = new TypedEventBus<ApplicationEventMap>();
    const build = await createMediaEngine(bus, createAssetProviderEngine(bus)).buildProject(compileStudioProductionRecipeV1(normalized));
    const full = buildFFmpegCommand({ manifest: build.manifest, preset: RENDER_PRESET });
    const concat = buildSegmentConcatCommand({ manifest: build.manifest, preset: RENDER_PRESET, segmentPaths: build.manifest.timeline.scenes.map((_, index) => `scene-${index}.mp4`) });

    expect(build.project.subtitles).toMatchObject({ enabled: false, cues: [], words: [] });
    expect(build.validation.renderReady).toBe(true);
    expect(build.renderReady).toBe(true);
    expect(full.subtitleContent).toBe('');
    expect(concat.subtitleContent).toBeUndefined();
    expect(full.args.join(' ')).not.toContain('subtitles=filename');
    expect(concat.args.join(' ')).not.toContain('subtitles=filename');
  });

  it('keeps an explicitly disabled manifest subtitle-free even if stale cues are present', async () => {
    const bus = new TypedEventBus<ApplicationEventMap>();
    const build = await createMediaEngine(bus, createAssetProviderEngine(bus)).buildProject(compileStudioProductionRecipeV1(normalizeStudioProductionRecipeV1(recipeInput(), ownerContext())));
    build.manifest.subtitles.enabled = false;
    const full = buildFFmpegCommand({ manifest: build.manifest, preset: RENDER_PRESET });
    const concat = buildSegmentConcatCommand({ manifest: build.manifest, preset: RENDER_PRESET, segmentPaths: build.manifest.timeline.scenes.map((_, index) => `scene-${index}.mp4`) });

    expect(build.manifest.subtitles.cues.length).toBeGreaterThan(0);
    expect(full.subtitleContent).toBe('');
    expect(concat.subtitleContent).toBeUndefined();
  });

  it.each([
    ['karaoke', 'karaoke'],
    ['highlight', 'none'],
    ['classic', 'fade'],
    ['minimal', 'none'],
  ] as const)('maps the %s preset to deterministic bounded ASS semantics', (preset, animation) => {
    const style = canonicalSubtitleStyle({ enabled: true, preset, textColor: '#FF00AA', highlightColor: '#00FF00' });
    expect(style).toMatchObject({ animation, textColor: '#FF00AA', highlightColor: '#00FF00', position: 'bottom' });
  });

  it('uses deterministic canonical defaults when no custom colors are selected', () => {
    expect(canonicalSubtitleStyle({ enabled: true, preset: 'highlight', textColor: null, highlightColor: null }))
      .toMatchObject({ textColor: '#FFFFFF', highlightColor: '#10B981' });
  });

  it('propagates normalized colors into deterministic, safely escaped ASS output', () => {
    const canonical = canonicalSubtitleStyle({ enabled: true, preset: 'karaoke', textColor: '#FF00AA', highlightColor: '#00FF00' });
    const style: SubtitleStyle = { fontFamily: 'Inter', fontSize: 64, fontWeight: canonical.fontWeight ?? 800, lineSpacing: 1, strokeWidth: canonical.strokeWidth ?? 4, shadowDepth: canonical.shadowDepth ?? 1, textColor: canonical.textColor!, highlightColor: canonical.highlightColor!, backgroundColor: '#000000', backgroundOpacity: canonical.backgroundOpacity ?? .34, position: canonical.position ?? 'bottom', maxWordsPerCue: 4, maxCharactersPerLine: 26, animation: canonical.animation!, uppercase: false };
    const cues: SubtitleCue[] = [
      { id: 'cue-2', sceneId: 'scene-2', startMs: 1_000, endMs: 2_000, durationMs: 1_000, text: 'Second {line}\\next', wordIds: [], emphasisWordIds: [], lineCount: 1 },
      { id: 'cue-1', sceneId: 'scene-1', startMs: 0, endMs: 900, durationMs: 900, text: 'First\nline', wordIds: [], emphasisWordIds: [], lineCount: 1 },
    ];
    const first = buildCanonicalSubtitleRenderPlan({ cues, width: 1080, height: 1920, style });
    const second = buildCanonicalSubtitleRenderPlan({ cues: [...cues].reverse(), width: 1080, height: 1920, style });

    expect(first.assContent).toContain('&H00AA00FF&');
    expect(first.assContent).toContain('&H0000FF00&');
    expect(first.assContent).toContain('\\{line\\}\\\\next');
    expect(first.assContent).toContain('First\\N');
    expect(first.assContent).toBe(second.assContent);
  });

  it('renders the highlight preset through the bounded emphasized-word ASS path', () => {
    const canonical = canonicalSubtitleStyle({ enabled: true, preset: 'highlight', textColor: '#FFFFFF', highlightColor: '#00FF00' });
    const style: SubtitleStyle = { fontFamily: 'Inter', fontSize: 64, fontWeight: canonical.fontWeight ?? 800, lineSpacing: 1, strokeWidth: canonical.strokeWidth ?? 4, shadowDepth: canonical.shadowDepth ?? 1, textColor: canonical.textColor!, highlightColor: canonical.highlightColor!, backgroundColor: '#000000', backgroundOpacity: canonical.backgroundOpacity ?? .34, position: canonical.position ?? 'bottom', maxWordsPerCue: 4, maxCharactersPerLine: 26, animation: canonical.animation!, uppercase: false };
    const plan = buildCanonicalSubtitleRenderPlan({ cues: [{ id: 'highlight-cue', sceneId: 'scene', startMs: 0, endMs: 1_000, durationMs: 1_000, text: 'Focus now', wordIds: ['focus', 'now'], emphasisWordIds: ['focus'], lineCount: 1 }], width: 1080, height: 1920, style });

    expect(plan.preset).toBe('clean');
    expect(plan.assContent).toContain('{\\c&H0000FF00&}Focus{\\c&H00FFFFFF&}');
    expect(plan.assContent).not.toContain('\\k');
  });

  it.each(['highlight', 'karaoke'] as const)('selects a deterministic emphasized word for ordinary %s Recipe text', async (preset) => {
    const input = recipeInput();
    input.captionStyle = preset;
    input.captionHighlightColor = '#10b981';
    const bus = new TypedEventBus<ApplicationEventMap>();
    const build = await createMediaEngine(bus, createAssetProviderEngine(bus)).buildProject(compileStudioProductionRecipeV1(normalizeStudioProductionRecipeV1(input, ownerContext())));
    const cue = build.project.subtitles.cues[0];
    const plan = buildCanonicalSubtitleRenderPlan({ cues: [cue], width: 1080, height: 1920, style: build.project.subtitles.style, enabled: true });

    expect(cue.emphasisWordIds).toEqual([cue.wordIds[0]]);
    expect(plan.assContent).toContain('{\\c&H0081B910&}');
    expect(plan.assContent).toContain('{\\c&H00FFFFFF&}');
  });

  it('rejects malformed Recipe color input before it can reach ASS', () => {
    const input = recipeInput();
    input.captionTextColor = '#ffffff,{\\pos(0,0)}';
    expect(() => normalizeStudioProductionRecipeV1(input, ownerContext())).toThrow('six-digit hex');
  });

  it('carries compiled narration and recipe provenance into the existing MediaProject', async () => {
    const input = recipeInput();
    input.captionStyle = 'classic';
    input.captionTextColor = '#FF00AA';
    input.captionHighlightColor = '#00FF00';
    const normalized = normalizeStudioProductionRecipeV1(input, ownerContext());
    const bus = new TypedEventBus<ApplicationEventMap>();
    const media = createMediaEngine(bus, createAssetProviderEngine(bus));
    const build = await media.buildProject(compileStudioProductionRecipeV1(normalized));

    expect(build.project.assets).toContainEqual(expect.objectContaining({
      type: 'voice', metadata: expect.objectContaining({
        storageObjectPath: 'owner-a/voiceovers/00000000-0000-4000-8000-000000000000.mp3', durationMs: 25_000,
      }),
    }));
    expect(build.manifest.metadata.productionRecipe?.identity).toBe(normalized.identity);
    expect(build.project.subtitles).toMatchObject({
      enabled: true,
      style: { animation: 'fade', textColor: '#FF00AA', highlightColor: '#00FF00' },
    });
    expect(build.project.subtitles.cues.length).toBeGreaterThan(0);
    expect(build.project.scenes[0].cameraMotion).toBe('ken_burns');
  });

  it('derives unequal semantic scene windows from durable narration before subtitles are built', async () => {
    const input = recipeInput();
    input.transitionStyle = 'none';
    input.scenes = ['One', 'Two', 'Three'].map((text, index) => ({
      text, duration: 5, visual: 'Visual', keywords: ['visual'],
      imageStorage: { bucket: 'media', objectPath: `owner-a/generated-images/00000000-0000-4000-8000-00000000000${index}.png` },
    }));
    const characters = [...'One Two Three'];
    const starts = [0, 80, 160, 300, 1_000, 1_080, 1_160, 1_300, 2_000, 2_080, 2_160, 2_240, 2_320];
    input.narration = {
      ...input.narration!,
      durationMs: 3_000,
      alignment: { characters, characterStartTimesMs: starts, characterEndTimesMs: starts.map((time) => time + 40) },
    };

    const build = await createMediaEngine(new TypedEventBus<ApplicationEventMap>(), createAssetProviderEngine(new TypedEventBus<ApplicationEventMap>()))
      .buildProject(compileStudioProductionRecipeV1(normalizeStudioProductionRecipeV1(input, ownerContext())));

    expect(build.project.scenes.map((scene) => [scene.startMs, scene.endMs])).toEqual([[0, 600], [600, 1_600], [1_600, 3_000]]);
    expect(build.subtitleTimeline?.source).toBe('word-timestamps');
    expect(build.subtitleTimeline?.words.map((word) => word.startMs)).toEqual([0, 1_000, 2_000]);
  });

  it('keeps the production-shaped scene-two onset inside a narration-informed crossfade window', async () => {
    const input = recipeInput();
    input.scenes = ['First', 'Second', 'Third'].map((text, index) => ({
      text, duration: 5, visual: 'Visual', keywords: ['visual'],
      imageStorage: { bucket: 'media', objectPath: `owner-a/generated-images/00000000-0000-4000-8000-00000000001${index}.png` },
    }));
    const characters = [...'First Second Third'];
    const starts = characters.map((_, index) => {
      if (index < 5) return index * 180;
      if (index === 5) return 1_000;
      if (index < 12) return 2_043 + (index - 6) * 180;
      if (index === 12) return 3_500;
      return 4_600 + (index - 13) * 180;
    });
    input.narration = {
      ...input.narration!,
      durationMs: 7_497,
      alignment: { characters, characterStartTimesMs: starts, characterEndTimesMs: starts.map((time) => time + 160) },
    };

    const bus = new TypedEventBus<ApplicationEventMap>();
    const build = await createMediaEngine(bus, createAssetProviderEngine(bus))
      .buildProject(compileStudioProductionRecipeV1(normalizeStudioProductionRecipeV1(input, ownerContext())));
    const sceneTwo = build.project.scenes[1];
    const semanticSubtitleSceneTwo = { ...sceneTwo, endMs: sceneTwo.endMs - sceneTwo.overlapAfterMs };

    expect(semanticSubtitleSceneTwo.startMs).toBeLessThanOrEqual(2_043);
    expect(semanticSubtitleSceneTwo.endMs).toBeGreaterThanOrEqual(2_345);
    expect(build.subtitleTimeline?.source).toBe('word-timestamps');
  });

  it('compiles the existing bounded text watermark into canonical project state', async () => {
    const input = recipeInput();
    input.watermarkText = "Brand: O'Reilly";
    input.watermarkPosition = 'top-left';
    const normalized = normalizeStudioProductionRecipeV1(input, ownerContext());
    const compiled = compileStudioProductionRecipeV1(normalized);
    const bus = new TypedEventBus<ApplicationEventMap>();
    const build = await createMediaEngine(bus, createAssetProviderEngine(bus)).buildProject(compiled);

    expect(compiled.branding).toEqual({ watermark: { text: "Brand: O'Reilly", position: 'top-left' } });
    expect(build.project.branding).toEqual(compiled.branding);
    expect(build.manifest.branding).toEqual(compiled.branding);
  });

  it('normalizes whitespace while rejecting multiline, control-character, and overlong watermark text', () => {
    const padded = recipeInput();
    padded.watermarkText = '  Brand  ';
    expect(normalizeStudioProductionRecipeV1(padded, ownerContext()).recipe.branding.watermark?.text).toBe('Brand');
    for (const text of ['Brand\nLine', 'Brand\u0000', 'W'.repeat(21)]) {
      const invalid = recipeInput();
      invalid.watermarkText = text;
      expect(() => normalizeStudioProductionRecipeV1(invalid, ownerContext())).toThrow(/watermark text/i);
    }
  });

  it('keeps Browser TTS preview-only while exposing bounded canonical image motion', () => {
    const browser = recipeInput();
    browser.voiceoverMode = 'browser';
    browser.narration = null;
    const normalized = normalizeStudioProductionRecipeV1(browser, ownerContext());
    const compiled = compileStudioProductionRecipeV1(normalized);

    expect(compiled.audio).toEqual({ narrationMode: 'silent' });
    expect(compiled.narration).toBeUndefined();
    expect(normalized.exportSupport).toMatchObject({
      browserSpeech: 'preview-only', motion: 'supported', transitions: 'partial', watermark: 'supported', music: 'partial',
    });
  });

  it.each([
    ['static', 'none'],
    ['kenburns', 'ken_burns'],
    ['zoom_in', 'zoom_in'],
    ['zoom_out', 'zoom_out'],
  ] as const)('compiles %s motion into bounded canonical scene motion %s', (motionStyle, expected) => {
    const input = recipeInput();
    input.motionStyle = motionStyle;
    const compiled = compileStudioProductionRecipeV1(normalizeStudioProductionRecipeV1(input, ownerContext()));
    expect(compiled.motion).toEqual({ mode: expected });
  });

  it('resolves the generic Studio pan intent deterministically before the canonical timeline', async () => {
    const input = recipeInput();
    input.motionStyle = 'pan';
    const normalized = normalizeStudioProductionRecipeV1(input, ownerContext());
    const bus = new TypedEventBus<ApplicationEventMap>();
    const build = await createMediaEngine(bus, createAssetProviderEngine(bus))
      .buildProject(compileStudioProductionRecipeV1(normalized));
    expect(build.project.scenes[0].cameraMotion).toBe('pan_right');
    expect(build.manifest.timeline.scenes[0].cameraMotion).toBe('pan_right');
  });

  it('rejects malformed direct canonical motion input before it can reach FFmpeg planning', async () => {
    const input = recipeInput();
    const compiled = compileStudioProductionRecipeV1(normalizeStudioProductionRecipeV1(input, ownerContext()));
    const bus = new TypedEventBus<ApplicationEventMap>();
    await expect(createMediaEngine(bus, createAssetProviderEngine(bus)).buildProject({
      ...compiled,
      motion: { mode: 'zoompan=unsafe' as never },
    })).rejects.toThrow('Canonical motion mode is invalid');
  });

  it.each([
    ['crossfade', 'crossfade'],
    ['none', 'cut'],
    ['slide', 'cut'],
    ['zoom', 'cut'],
  ] as const)('compiles %s transition to the bounded canonical %s policy', (transitionStyle, expected) => {
    const input = recipeInput();
    input.transitionStyle = transitionStyle;
    const compiled = compileStudioProductionRecipeV1(normalizeStudioProductionRecipeV1(input, ownerContext()));
    expect(compiled.transition).toEqual({ type: expected });
  });

  it('rejects malformed direct canonical transition input before it can reach FFmpeg planning', async () => {
    const input = recipeInput();
    const compiled = compileStudioProductionRecipeV1(normalizeStudioProductionRecipeV1(input, ownerContext()));
    const bus = new TypedEventBus<ApplicationEventMap>();
    await expect(createMediaEngine(bus, createAssetProviderEngine(bus)).buildProject({
      ...compiled,
      transition: { type: 'xfade=unsafe' as never },
    })).rejects.toThrow('Canonical transition type is invalid');
  });

  it('rejects malformed direct canonical branding before it can reach FFmpeg planning', async () => {
    const compiled = compileStudioProductionRecipeV1(normalizeStudioProductionRecipeV1(recipeInput(), ownerContext()));
    const bus = new TypedEventBus<ApplicationEventMap>();
    await expect(createMediaEngine(bus, createAssetProviderEngine(bus)).buildProject({
      ...compiled,
      branding: { watermark: { text: 'Brand', position: 'center' as never } },
    })).rejects.toThrow('Canonical watermark position is invalid');
  });

  it('reconstructs an equivalent normalized recipe from durable draft fields without persisting execution data', () => {
    const draft = { ...recipeInput(), beatSync: true, version: 1, savedAt: '2026-08-17T00:00:00.000Z', step: 'render', channelId: 'channel', topic: 'topic', niche: '', tone: 'engaging', duration: 30, hook: '', script: 'script', cta: '', targetLanguage: 'tr' } as StudioDraft;
    const direct = normalizeStudioProductionRecipeV1(recipeInput(), ownerContext());
    const restored = normalizeStudioProductionRecipeV1(studioProductionRecipeInputFromDraft(draft), ownerContext());

    expect(restored.recipe).toEqual(direct.recipe);
    expect(studioProductionRecipeInputFromDraft(draft).beatSync).toBe(true);
    expect(JSON.stringify(restored.recipe)).not.toMatch(/blob:|base64|storage\/v1\/object\/sign/i);
  });
});

function recipeInput(): StudioProductionRecipeInput {
  return {
    projectId: 'recipe-project', title: 'Recipe video',
    scenes: [{
      text: 'Scene one', duration: 4, visual: 'Visual', keywords: ['visual'],
      imageStorage: { bucket: 'media', objectPath: 'owner-a/generated-images/00000000-0000-4000-8000-000000000000.png' },
      imageUrl: 'https://example.test/storage/v1/object/sign/media/owner-a/generated-images/ignored.png?token=signed',
    }],
    captionStyle: 'karaoke', transitionStyle: 'crossfade', motionStyle: 'kenburns', showSubtitles: true,
    captionTextColor: '', captionHighlightColor: '', voiceoverMode: 'elevenlabs',
    narration: {
      storage: { bucket: 'media', objectPath: 'owner-a/voiceovers/00000000-0000-4000-8000-000000000000.mp3' },
      durationMs: 25_000, scriptRevision: 'script-revision', voiceId: 'voice-a',
    },
    musicId: 'ambient', musicStorage: { bucket: 'media', objectPath: 'owner-a/music/00000000-0000-4000-8000-000000000000.mp3' }, musicVolume: .25, beatSync: true,
    watermarkText: '', watermarkPosition: 'bottom-right', visualMode: 'auto', selectedStyleId: '', characterProfileId: '',
    useBroll: false, characterName: '', characterAppearance: '', characterArtStyle: 'realistic',
  };
}

function ownerContext() {
  setValidatedOwnerId(OWNER_A);
  return captureValidatedMediaOwnerContext();
}
