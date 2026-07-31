import type { ApplicationEventMap, EventBus } from '@/core/events';
import { createAssetResolver, type AssetResolver } from './assetResolver';
import { normalizeMediaSettings } from './durationPlanner';
import { buildRenderManifest, isRenderManifestReady } from './manifestBuilder';
import { planScenes } from './scenePlanner';
import { composeTracks } from './trackComposer';
import type {
  CreateMediaProjectInput,
  MediaProject,
  MediaProjectBuildResult,
} from './types';

export interface MediaEngine {
  buildProject(input: CreateMediaProjectInput): Promise<MediaProjectBuildResult>;
}

export function createMediaEngine(
  eventBus: EventBus<ApplicationEventMap>,
  assetResolver: AssetResolver = createAssetResolver(),
): MediaEngine {
  return {
    async buildProject(input) {
      const settings = normalizeMediaSettings(input.settings);
      const scenes = planScenes(input.scenes, settings);
      const now = new Date().toISOString();
      const projectId = createId('media-project');

      await eventBus.emit('media:project-created', {
        projectId,
        title: input.title,
        sceneCount: scenes.length,
        createdAt: now,
      });

      const assets = await assetResolver.resolve(scenes);
      await eventBus.emit('media:assets-resolved', {
        projectId,
        assetCount: assets.length,
        resolvedAt: new Date().toISOString(),
      });

      const tracks = composeTracks(scenes);
      const durationMs = scenes.length > 0 ? scenes[scenes.length - 1].endMs : 0;
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
        timeline: {
          durationMs,
          scenes,
          tracks,
        },
      };

      await eventBus.emit('media:timeline-built', {
        projectId,
        durationMs,
        sceneCount: scenes.length,
        trackCount: tracks.length,
        builtAt: new Date().toISOString(),
      });

      const manifest = buildRenderManifest(project);
      const renderReady = isRenderManifestReady(manifest);

      await eventBus.emit('media:manifest-built', {
        projectId,
        durationMs,
        renderReady,
        builtAt: manifest.createdAt,
      });

      return { project, manifest, renderReady };
    },
  };
}

function createId(prefix: string): string {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}
