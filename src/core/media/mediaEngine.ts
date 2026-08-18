import type { ApplicationEventMap, EventBus } from '@/core/events';
import type { AssetProviderEngine } from './assetProviderTypes';
import { normalizeMediaSettings } from './durationPlanner';
import { buildRenderManifest, isRenderManifestReady } from './manifestBuilder';
import { planScenes } from './scenePlanner';
import { buildIntelligentTimeline } from './timelineIntelligence';
import { buildSubtitleTimeline } from './subtitleSynchronizer';
import { buildAudioTimeline } from './audioComposer';
import { composeTracks } from './trackComposer';
import { validateMediaProject } from './mediaValidator';
import { privateStorageSource } from './storageIdentity';
import { normalizeCanonicalBrandingConfiguration } from './brandingTypes';
import type { CameraMotion, CanonicalMotionMode, CanonicalTransitionType, CreateMediaProjectInput, MediaProject, MediaProjectBuildResult, MediaScene } from './types';

export interface MediaEngine { buildProject(input: CreateMediaProjectInput): Promise<MediaProjectBuildResult>; }

export function createMediaEngine(
  eventBus: EventBus<ApplicationEventMap>,
  assetProviderEngine: AssetProviderEngine,
): MediaEngine {
  return {
    async buildProject(input) {
      const settings = normalizeMediaSettings(input.settings);
      const branding = normalizeCanonicalBrandingConfiguration(input.branding);
      let plannedScenes = applyCanonicalMotion(
        reconcileNarrationDuration(planScenes(input.scenes, settings), input.narration?.durationMs),
        canonicalMotionMode(input.motion?.mode),
      );
      // Recipe-compiled projects always provide the bounded canonical
      // transition configuration. Preserve the legacy planner's transition
      // metadata for non-Recipe callers such as the editing audit pipeline;
      // it is not an authorization path for Studio canonical export.
      if (input.transition !== undefined) {
        plannedScenes = applyCanonicalTransition(
          plannedScenes,
          canonicalTransitionType(input.transition.type),
          settings.defaultTransitionMs,
        );
      }
      let timelinePlan = buildIntelligentTimeline(plannedScenes, settings);
      for (let attempt = 0; input.narration && timelinePlan.durationMs < input.narration.durationMs && attempt < 3; attempt += 1) {
        const sum = plannedScenes.reduce((total, scene) => total + scene.durationMs, 0);
        plannedScenes = reconcileNarrationDuration(plannedScenes, Math.ceil(sum * input.narration.durationMs / timelinePlan.durationMs));
        if (plannedScenes.some((scene) => scene.durationMs > settings.maximumSceneDurationMs)) throw new Error('Narration duration exceeds canonical scene-duration limits.');
        timelinePlan = buildIntelligentTimeline(plannedScenes, settings);
      }
      if (input.narration && timelinePlan.durationMs < input.narration.durationMs) throw new Error('Narration duration cannot be reconciled with the canonical timeline.');
      const scenes = timelinePlan.scenes;
      const now = new Date().toISOString();
      const projectId = input.projectId?.trim() || createId('media-project');

      await eventBus.emit('media:project-created', {
        projectId, title: input.title, sceneCount: scenes.length, createdAt: now,
      });

      const { assets, report: assetResolution } = await assetProviderEngine.resolve(scenes, settings);
      await eventBus.emit('media:assets-resolved', {
        projectId, assetCount: assets.length, resolvedAt: new Date().toISOString(),
      });

      const narrationAsset = input.narration ? {
        id: createId('asset-voice'),
        type: 'voice' as const,
        source: privateStorageSource(input.narration.storage),
        mimeType: 'audio/mpeg',
        metadata: {
          storageBucket: input.narration.storage.bucket,
          storageObjectPath: input.narration.storage.objectPath,
          durationMs: input.narration.durationMs,
          scriptRevision: input.narration.scriptRevision,
          voiceId: input.narration.voiceId,
          source: 'canonical-narration',
        },
      } : null;
      if (narrationAsset) assets.push(narrationAsset);
      const subtitleTimeline = buildSubtitleTimeline(scenes, settings, {
        canonical: input.subtitles,
      });
      const audioTimeline = buildAudioTimeline(
        scenes,
        timelinePlan.markers,
        timelinePlan.durationMs,
        { ...input.audio, narrationAssetId: narrationAsset?.id },
      );
      const tracks = composeTracks(scenes, subtitleTimeline, audioTimeline);
      const project: MediaProject = {
        id: projectId,
        version: 1,
        settings,
        metadata: {
          title: input.title.trim() || 'Untitled Media Project',
          source: 'ai-script',
          createdAt: now,
          updatedAt: now,
          tags: input.tags ?? [],
          productionRecipe: input.productionRecipe,
        },
        scenes,
        assets,
        tracks,
        subtitles: subtitleTimeline,
        audio: audioTimeline,
        branding,
        timeline: {
          durationMs: timelinePlan.durationMs,
          scenes,
          tracks,
          markers: timelinePlan.markers,
          metrics: timelinePlan.metrics,
        },
      };

      await eventBus.emit('subtitle:timeline-built', {
        projectId,
        wordCount: subtitleTimeline.metrics.wordCount,
        cueCount: subtitleTimeline.metrics.cueCount,
        readingSpeedWpm: subtitleTimeline.metrics.readingSpeedWpm,
        builtAt: new Date().toISOString(),
      });

      await eventBus.emit('audio:timeline-built', {
        projectId,
        voiceSegmentCount: audioTimeline.voice.length,
        sfxCount: audioTimeline.metrics.sfxCount,
        duckingEventCount: audioTimeline.metrics.duckingEventCount,
        voiceCoverage: audioTimeline.metrics.voiceCoverage,
        builtAt: new Date().toISOString(),
      });

      await eventBus.emit('media:timeline-built', {
        projectId,
        durationMs: timelinePlan.durationMs,
        sceneCount: scenes.length,
        trackCount: tracks.length,
        markerCount: timelinePlan.markers.length,
        pacingScore: timelinePlan.metrics.pacingScore,
        builtAt: new Date().toISOString(),
      });

      const manifest = buildRenderManifest(project);
      const validation = validateMediaProject({ project, manifest, assetResolution });
      manifest.validation = validation;
      const renderReady = isRenderManifestReady(manifest);
      await eventBus.emit('media:validation-completed', {
        projectId,
        score: validation.score,
        renderReady: validation.renderReady,
        errorCount: validation.errorCount,
        warningCount: validation.warningCount,
        validatedAt: validation.validatedAt,
      });

      await eventBus.emit('media:manifest-built', {
        projectId, durationMs: timelinePlan.durationMs, renderReady, builtAt: manifest.createdAt,
      });
      return {
        project,
        manifest,
        renderReady,
        assetResolution,
        subtitleTimeline,
        audioTimeline,
        validation,
      };
    },
  };
}

/** Resolve global Recipe V1 intent once, before the canonical timeline exists. */
function applyCanonicalMotion(scenes: MediaScene[], mode: CanonicalMotionMode): MediaScene[] {
  return scenes.map((scene, index) => ({
    ...scene,
    cameraMotion: resolveCanonicalCameraMotion(mode, index),
  }));
}

function canonicalMotionMode(value: unknown): CanonicalMotionMode {
  if (value === undefined) return 'none';
  if (value === 'none' || value === 'ken_burns' || value === 'pan' || value === 'zoom_in' || value === 'zoom_out') return value;
  throw new Error('Canonical motion mode is invalid.');
}

function resolveCanonicalCameraMotion(mode: CanonicalMotionMode, sceneIndex: number): CameraMotion {
  switch (mode) {
    case 'none': return 'none';
    case 'ken_burns': return 'ken_burns';
    case 'zoom_in': return 'zoom_in';
    case 'zoom_out': return 'zoom_out';
    // The Studio has one generic pan choice. Alternating direction by stable
    // scene index avoids random motion while making adjacent image scenes vary.
    case 'pan': return sceneIndex % 2 === 0 ? 'pan_right' : 'pan_left';
  }
}

function canonicalTransitionType(value: unknown): CanonicalTransitionType {
  if (value === undefined) return 'cut';
  if (value === 'cut' || value === 'crossfade') return value;
  throw new Error('Canonical transition type is invalid.');
}

function applyCanonicalTransition(
  scenes: MediaScene[],
  type: CanonicalTransitionType,
  durationMs: number,
): MediaScene[] {
  return scenes.map((scene, index) => ({
    ...scene,
    transition: index === 0 || type === 'cut'
      ? { type: 'cut', durationMs: 0 }
      : { type: 'crossfade', durationMs },
  }));
}

function reconcileNarrationDuration<T extends { durationMs: number }>(scenes: T[], narrationDurationMs: number | undefined): T[] {
  if (typeof narrationDurationMs !== 'number' || !Number.isSafeInteger(narrationDurationMs) || narrationDurationMs <= 0) return scenes;
  const total = scenes.reduce((sum, scene) => sum + scene.durationMs, 0);
  if (narrationDurationMs <= total || total <= 0) return scenes;
  const target = narrationDurationMs;
  let allocated = 0;
  return scenes.map((scene, index) => {
    const durationMs = index === scenes.length - 1
      ? target - allocated
      : Math.max(1, Math.floor(scene.durationMs * target / total));
    allocated += durationMs;
    return { ...scene, durationMs, endMs: durationMs };
  });
}

function createId(prefix: string): string {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}
