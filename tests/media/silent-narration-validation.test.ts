import { describe, expect, it } from 'vitest';
import { createManifestRevisionId } from '@/core/editing';
import { TypedEventBus, type ApplicationEventMap } from '@/core/events';
import { buildFFmpegCommand, createRenderFingerprint, type RenderPreset } from '@/core/render';
import {
  buildRenderManifest,
  createAssetProviderEngine,
  createMediaEngine,
  isRenderManifestReady,
  validateMediaProject,
  type AssetResolutionReport,
  type MediaProjectBuildResult,
} from '@/core/media';

describe('canonical silent narration validation', () => {
  it('builds an explicitly silent project without voice segments and makes it render-ready', async () => {
    const build = await buildFixture('silent');

    expect(build.project.audio.narrationMode).toBe('silent');
    expect(build.project.audio.voice).toEqual([]);
    expect(build.validation.issues.map((issue) => issue.code)).not.toContain('VOICE_TRACK_EMPTY');
    expect(build.validation.issues.map((issue) => issue.code)).not.toContain('VOICE_COVERAGE_LOW');
    expect(build.validation.renderReady).toBe(true);
    expect(build.renderReady).toBe(true);
    expect(isRenderManifestReady(build.manifest)).toBe(true);
  });

  it('keeps legacy and explicit narration-enabled projects invalid when voice is missing', async () => {
    const explicit = await buildFixture('required');
    const explicitReport = validateWithoutVoice(explicit, 'required');
    const legacyReport = validateWithoutVoice(explicit, undefined);

    for (const report of [explicitReport, legacyReport]) {
      expect(report.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'VOICE_TRACK_EMPTY', severity: 'error' }),
        expect.objectContaining({ code: 'VOICE_COVERAGE_LOW', severity: 'error' }),
      ]));
      expect(report.renderReady).toBe(false);
    }
  });

  it('retains the existing narration coverage thresholds', async () => {
    const build = await buildFixture('required');
    const warning = revalidate(build, (project) => { project.audio.metrics.voiceCoverage = 0.8; });
    const error = revalidate(build, (project) => { project.audio.metrics.voiceCoverage = 0.69; });

    expect(warning.issues).toContainEqual(expect.objectContaining({ code: 'VOICE_COVERAGE_LOW', severity: 'warning' }));
    expect(error.issues).toContainEqual(expect.objectContaining({ code: 'VOICE_COVERAGE_LOW', severity: 'error' }));
  });

  it('does not bypass asset, subtitle, timeline, or render validation in silent mode', async () => {
    const build = await buildFixture('silent');
    const project = structuredClone(build.project);
    project.subtitles.cues = [];
    project.timeline.scenes[0].durationMs = 0;
    project.scenes[0].sourceScene.visualMode = 'ai_realistic';
    const report = structuredClone(build.assetResolution);
    report.resolutions[0].asset = null;
    report.resolvedCount -= 1;
    report.unresolvedCount += 1;
    const manifest = buildRenderManifest(project);
    manifest.render = { ...manifest.render, width: 1920, height: 1080 };
    const validation = validateMediaProject({ project, manifest, assetResolution: report });

    expect(validation.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'SCENE_DURATION_INVALID',
      'SCENE_ASSET_UNRESOLVED',
      'SUBTITLE_CUES_EMPTY',
      'RENDER_NOT_VERTICAL',
    ]));
    expect(validation.renderReady).toBe(false);
  });

  it('fingerprints narration intent deterministically', async () => {
    const silent = await buildFixture('silent');
    const clone = structuredClone(silent.manifest);
    const narrationRequired = structuredClone(silent.manifest);
    narrationRequired.audio.narrationMode = 'required';

    expect(createManifestRevisionId(clone)).toBe(createManifestRevisionId(silent.manifest));
    expect(createManifestRevisionId(narrationRequired)).not.toBe(createManifestRevisionId(silent.manifest));
    const preset: RenderPreset = {
      id: 'silent-test', name: 'Silent test', container: 'mp4', videoCodec: 'h264',
      audioCodec: 'aac', quality: 'standard', hardwareAcceleration: 'disabled',
    };
    const first = await createRenderFingerprint({ manifest: silent.manifest, preset, adapterId: 'test' });
    const second = await createRenderFingerprint({ manifest: clone, preset, adapterId: 'test' });
    const narrated = await createRenderFingerprint({ manifest: narrationRequired, preset, adapterId: 'test' });
    expect(second).toBe(first);
    expect(narrated).not.toBe(first);
  });

  it('accepts the deterministic auto composition used by the Studio preview and FFmpeg export', async () => {
    const build = await buildFixture('silent');
    const project = structuredClone(build.project);
    const report = structuredClone(build.assetResolution);
    project.scenes.forEach((scene) => {
      scene.sourceScene = { ...scene.sourceScene, imageUrl: undefined, videoUrl: undefined, visualMode: 'auto' };
      scene.assetIds = [];
    });
    project.timeline.scenes.forEach((scene) => { scene.assetIds = []; });
    project.assets = [];
    report.resolutions.forEach((resolution) => { resolution.asset = null; });
    report.resolvedCount = 0;
    report.unresolvedCount = report.resolutions.length;
    const manifest = buildRenderManifest(project);
    const validation = validateMediaProject({ project, manifest, assetResolution: report });
    manifest.validation = validation;

    expect(validation.issues.map((issue) => issue.code)).not.toContain('SCENE_ASSET_UNRESOLVED');
    expect(validation.renderReady).toBe(true);
    const plan = buildFFmpegCommand({
      manifest,
      preset: {
        id: 'composition-test', name: 'Composition test', container: 'mp4', videoCodec: 'h264',
        audioCodec: 'aac', quality: 'standard', hardwareAcceleration: 'disabled',
      },
    });
    expect(plan.args).toContain('lavfi');
    expect(plan.args.join(' ')).toContain('color=c=');
  });

  it('rejects a signed-only or foreign scene URL instead of treating it as canonical media', async () => {
    const build = await buildFixture('silent');
    const project = structuredClone(build.project);
    const report = structuredClone(build.assetResolution);
    const signedUrl = 'https://example.supabase.co/storage/v1/object/sign/media/owner/image.png?token=expired';
    project.scenes[0].sourceScene = { ...project.scenes[0].sourceScene, imageUrl: signedUrl };
    const assetId = project.scenes[0].assetIds[0]!;
    const asset = project.assets.find((candidate) => candidate.id === assetId)!;
    asset.source = signedUrl;
    report.resolutions[0].asset = asset;
    const manifest = buildRenderManifest(project);
    const validation = validateMediaProject({ project, manifest, assetResolution: report });

    expect(validation.issues).toContainEqual(expect.objectContaining({
      code: 'SCENE_MEDIA_SOURCE_INVALID', severity: 'error', sceneId: project.scenes[0].id,
    }));
    expect(validation.renderReady).toBe(false);
  });
});

async function buildFixture(narrationMode: 'required' | 'silent'): Promise<MediaProjectBuildResult> {
  const bus = new TypedEventBus<ApplicationEventMap>();
  const engine = createMediaEngine(bus, createAssetProviderEngine(bus));
  return engine.buildProject({
    projectId: `narration-${narrationMode}`,
    title: 'Narration validation fixture',
    audio: { narrationMode },
    scenes: [
      { sceneId: 'visual-scene-00000000-0000-4000-8000-000000000001', text: 'A clear opening line.', duration: 3, visual: 'Opening', imageUrl: 'https://images.pexels.com/photos/opening.jpg' },
      { sceneId: 'visual-scene-00000000-0000-4000-8000-000000000002', text: 'A useful middle explanation.', duration: 4, visual: 'Middle', imageUrl: 'https://images.pexels.com/photos/middle.jpg' },
      { sceneId: 'visual-scene-00000000-0000-4000-8000-000000000003', text: 'A concise closing line.', duration: 3, visual: 'Closing', imageUrl: 'https://images.pexels.com/photos/closing.jpg' },
    ],
  });
}

function validateWithoutVoice(
  build: MediaProjectBuildResult,
  narrationMode: 'required' | undefined,
) {
  return revalidate(build, (project) => {
    project.audio.narrationMode = narrationMode;
    project.audio.voice = [];
    project.audio.automation = [];
    project.audio.metrics.voiceCoverage = 0;
  });
}

function revalidate(
  build: MediaProjectBuildResult,
  mutate: (project: MediaProjectBuildResult['project']) => void,
) {
  const project = structuredClone(build.project);
  mutate(project);
  const manifest = buildRenderManifest(project);
  return validateMediaProject({
    project,
    manifest,
    assetResolution: structuredClone(build.assetResolution) as AssetResolutionReport,
  });
}
