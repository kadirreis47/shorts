import type { DirectorEngine, DirectorInput, DirectorReport, DirectorSceneInput } from '@/core/director';
import type { ApplicationEventMap, EventBus } from '@/core/events';
import type { RenderManifest } from '@/core/media';

export interface DirectorApplicationOptions {
  readonly signal?: AbortSignal;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface DirectorApplicationService {
  analyzeManifest(
    manifest: RenderManifest,
    options?: DirectorApplicationOptions,
  ): Promise<DirectorReport>;
  analyzeInput(
    input: DirectorInput,
    options?: DirectorApplicationOptions,
  ): Promise<DirectorReport>;
}

export function createDirectorInput(manifest: RenderManifest): DirectorInput {
  const assetsById = new Map(manifest.assets.map((asset) => [asset.id, asset]));
  const scenes: DirectorSceneInput[] = manifest.timeline.scenes.map((scene) => ({
    id: scene.id,
    index: scene.index,
    role: scene.role,
    text: scene.text,
    visualPrompt: scene.visualPrompt,
    startMs: scene.startMs,
    endMs: scene.endMs,
    durationMs: scene.durationMs,
    intensity: scene.intensity,
    cameraMotion: scene.cameraMotion,
    transition: scene.transition.type,
    assetTypes: scene.assetIds.flatMap((assetId) => {
      const asset = assetsById.get(assetId);
      return asset ? [asset.type] : [];
    }),
    firstVisualChangeMs:
      scene.cameraMotion !== 'none'
        ? Math.min(1_000, scene.durationMs)
        : scene.transition.durationMs > 0
          ? Math.min(scene.transition.durationMs, scene.durationMs)
          : null,
  }));
  return {
    projectId: manifest.projectId,
    createdAt: manifest.createdAt,
    durationMs: manifest.durationMs,
    scenes,
    metadata: {
      title: manifest.metadata.title,
      source: manifest.metadata.source,
      schemaVersion: manifest.schemaVersion,
    },
  };
}

export function createDirectorApplicationService(
  engine: DirectorEngine,
  eventBus: EventBus<ApplicationEventMap>,
): DirectorApplicationService {
  async function analyzeInput(
    input: DirectorInput,
    options: DirectorApplicationOptions = {},
  ): Promise<DirectorReport> {
    const startedAt = new Date().toISOString();
    await eventBus.emit('director:analysis-started', {
      projectId: input.projectId,
      sceneCount: input.scenes.length,
      startedAt,
    });

    try {
      const report = await engine.analyze(input, {
        signal: options.signal,
        onAnalyzerCompleted: async (diagnostic) => {
          await eventBus.emit('director:analyzer-completed', {
            projectId: input.projectId,
            analyzerId: diagnostic.analyzerId,
            status: diagnostic.status,
            affectedSceneCount: diagnostic.affectedSceneIds.length,
            message: diagnostic.message,
            completedAt: new Date().toISOString(),
          });
        },
      });
      await eventBus.emit('director:analysis-completed', {
        projectId: input.projectId,
        overallScore: report.overallScore,
        recommendationCount: report.highPriorityRecommendations.length,
        analyzerFailureCount: report.analyzerDiagnostics.filter((item) => item.status === 'failed').length,
        completedAt: new Date().toISOString(),
      });
      return report;
    } catch (error) {
      await eventBus.emit('director:analysis-failed', {
        projectId: input.projectId,
        message: error instanceof Error ? error.message : 'Director analysis failed.',
        cancelled: options.signal?.aborted === true || isAbortError(error),
        failedAt: new Date().toISOString(),
      });
      throw error;
    }
  }

  return {
    analyzeManifest(manifest, options) {
      return analyzeInput(createDirectorInput(manifest), options);
    },
    analyzeInput,
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}
