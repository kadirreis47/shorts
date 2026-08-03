import type { DirectorEngine, DirectorInput, DirectorReport, DirectorSceneInput } from '@/core/director';
import type { ApplicationEventMap, EventBus } from '@/core/events';
import type { RenderManifest } from '@/core/media';
import { createManifestRevisionId, MANIFEST_FINGERPRINT_VERSION } from '@/core/editing';
import { earliestSceneRelativeOffset, toSceneRelativeOffset } from './sceneRelativeTiming';

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
    assetIds: scene.assetIds,
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
    firstCutMs: scene.transition.type === 'cut'
      ? toSceneRelativeOffset({ startMs: scene.startMs }, scene)
      : null,
    firstSubtitleMs: earliestSceneRelativeOffset(
      manifest.subtitles.cues.filter((cue) => cue.sceneId === scene.id), scene,
    ),
    firstAudioCueMs: earliestSceneRelativeOffset(
      [...manifest.audio.voice, ...manifest.audio.music, ...manifest.audio.sfx],
      scene,
    ),
    audioSignals: (['voice', 'music', 'sfx'] as const).filter((type) =>
      manifest.audio[type].some((segment) => segment.sceneId === scene.id || (segment.startMs < scene.endMs && segment.endMs > scene.startMs))),
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
      manifestBindingVersion: '1.0',
      analyzedManifestFingerprint: createManifestRevisionId(manifest),
      manifestFingerprintVersion: MANIFEST_FINGERPRINT_VERSION,
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
      await eventBus.emit('director:scene-ranked', { projectId: input.projectId, sceneCount: report.sceneRanking.scenes.length, rankedAt: new Date().toISOString() });
      await eventBus.emit('director:retention-map-completed', { projectId: input.projectId, segmentCount: report.retentionRiskMap.length, completedAt: new Date().toISOString() });
      await eventBus.emit('director:edit-plan-created', { projectId: input.projectId, decisionCount: report.editDecisionPlan.decisions.length, createdAt: new Date().toISOString() });
      await eventBus.emit('director:analysis-completed', {
        projectId: input.projectId,
        overallScore: report.overallScore,
        recommendationCount: new Set(report.sceneScores.flatMap((scene) => scene.recommendations.map((item) => item.id))).size,
        analyzerFailureCount: report.analyzerDiagnostics.filter((item) => item.status === 'failed').length,
        completedAt: new Date().toISOString(),
        report,
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
