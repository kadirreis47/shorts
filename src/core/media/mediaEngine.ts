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
import type { CreateMediaProjectInput, MediaProject, MediaProjectBuildResult } from './types';

export interface MediaEngine { buildProject(input: CreateMediaProjectInput): Promise<MediaProjectBuildResult>; }

export function createMediaEngine(
  eventBus: EventBus<ApplicationEventMap>,
  assetProviderEngine: AssetProviderEngine,
): MediaEngine {
  return {
    async buildProject(input) {
      const settings = normalizeMediaSettings(input.settings);
      const plannedScenes = planScenes(input.scenes, settings);
      const timelinePlan = buildIntelligentTimeline(plannedScenes, settings);
      const scenes = timelinePlan.scenes;
      const now = new Date().toISOString();
      const projectId = createId('media-project');

      await eventBus.emit('media:project-created', {
        projectId, title: input.title, sceneCount: scenes.length, createdAt: now,
      });

      const { assets, report: assetResolution } = await assetProviderEngine.resolve(scenes, settings);
      await eventBus.emit('media:assets-resolved', {
        projectId, assetCount: assets.length, resolvedAt: new Date().toISOString(),
      });

      const subtitleTimeline = buildSubtitleTimeline(scenes, settings);
      const audioTimeline = buildAudioTimeline(
        scenes,
        timelinePlan.markers,
        timelinePlan.durationMs,
        input.audio,
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
        },
        scenes,
        assets,
        tracks,
        subtitles: subtitleTimeline,
        audio: audioTimeline,
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

function createId(prefix: string): string {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}
