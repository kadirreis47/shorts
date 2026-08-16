import { describe, expect, it } from 'vitest';
import {
  compileStudioProductionRecipeV1,
  createAssetProviderEngine,
  createMediaEngine,
  normalizeStudioProductionRecipeV1,
} from '@/core/media';
import type { StudioProductionRecipeInput } from '@/core/media';
import { studioProductionRecipeInputFromDraft, type StudioDraft } from '@/lib/studioDraft';
import { createRenderFingerprint } from '@/core/render/renderFingerprint';
import { TypedEventBus } from '@/core/events/eventBus';
import type { ApplicationEventMap } from '@/core/events';
import { captureValidatedMediaOwnerContext } from '@/lib/mediaStorage';
import { setValidatedOwnerId } from '@/auth/identity';

const OWNER_A = 'owner-a';

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

  it('changes recipe identity for approved production decisions', () => {
    const baseline = normalizeStudioProductionRecipeV1(recipeInput(), ownerContext());
    const changed = recipeInput();
    changed.motionStyle = 'zoom_in';
    changed.transitionStyle = 'slide';
    changed.captionTextColor = '#FF00AA';
    changed.watermarkText = '@ShortsFlow';

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
    });
  });

  it('carries compiled narration and recipe provenance into the existing MediaProject', async () => {
    const normalized = normalizeStudioProductionRecipeV1(recipeInput(), ownerContext());
    const bus = new TypedEventBus<ApplicationEventMap>();
    const media = createMediaEngine(bus, createAssetProviderEngine(bus));
    const build = await media.buildProject(compileStudioProductionRecipeV1(normalized));

    expect(build.project.assets).toContainEqual(expect.objectContaining({
      type: 'voice', metadata: expect.objectContaining({
        storageObjectPath: 'owner-a/voiceovers/00000000-0000-4000-8000-000000000000.mp3', durationMs: 25_000,
      }),
    }));
    expect(build.manifest.metadata.productionRecipe?.identity).toBe(normalized.identity);
  });

  it('keeps Browser TTS preview-only and unsupported controls truthful', () => {
    const browser = recipeInput();
    browser.voiceoverMode = 'browser';
    browser.narration = null;
    const normalized = normalizeStudioProductionRecipeV1(browser, ownerContext());
    const compiled = compileStudioProductionRecipeV1(normalized);

    expect(compiled.audio).toEqual({ narrationMode: 'silent' });
    expect(compiled.narration).toBeUndefined();
    expect(normalized.exportSupport).toMatchObject({
      browserSpeech: 'preview-only', motion: 'unsupported', transitions: 'unsupported', watermark: 'unsupported', music: 'unsupported',
    });
  });

  it('reconstructs an equivalent normalized recipe from durable draft fields without persisting execution data', () => {
    const draft = { ...recipeInput(), version: 1, savedAt: '2026-08-17T00:00:00.000Z', step: 'render', channelId: 'channel', topic: 'topic', niche: '', tone: 'engaging', duration: 30, hook: '', script: 'script', cta: '', targetLanguage: 'tr' } as StudioDraft;
    const direct = normalizeStudioProductionRecipeV1(recipeInput(), ownerContext());
    const restored = normalizeStudioProductionRecipeV1(studioProductionRecipeInputFromDraft(draft), ownerContext());

    expect(restored.recipe).toEqual(direct.recipe);
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
    musicId: 'ambient', musicVolume: .25, beatSync: true,
    watermarkText: '', watermarkPosition: 'bottom-right', visualMode: 'auto', selectedStyleId: '', characterProfileId: '',
    useBroll: false, characterName: '', characterAppearance: '', characterArtStyle: 'realistic',
  };
}

function ownerContext() {
  setValidatedOwnerId(OWNER_A);
  return captureValidatedMediaOwnerContext();
}
