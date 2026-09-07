import {
  isVisualBoundDirectorReportV2_1,
  type DirectorEngine,
  type DirectorInput,
  type DirectorReport,
  type DirectorSceneInput,
  type LegacyDirectorReportV2,
  type VisualBoundDirectorReportV2_1,
} from '@/core/director';
import type { ApplicationEventMap, DirectorCompletionAdmissionV1, EventBus } from '@/core/events';
import type { RenderManifest } from '@/core/media';
import { createManifestRevisionId, MANIFEST_FINGERPRINT_VERSION } from '@/core/editing';
import { earliestSceneRelativeOffset, toSceneRelativeOffset } from './sceneRelativeTiming';
import type { DirectorAnalysisRejectionReason, DirectorRequestValidation } from './directorSnapshotRequestAdapter';

export interface DirectorRequestLifecycleV1 {
  /** Progress/completion events use this cooperative guard. */
  readonly canEmitLifecycleEvent: () => boolean;
  /** Failure admission ignores explicit cancellation but still requires request ownership. */
  readonly ownsRequestLifecycle: () => boolean;
  /** Creates the immutable 2.1 report from this request's same-boundary Visual provenance. */
  readonly bindReport: (report: LegacyDirectorReportV2) => Promise<VisualBoundDirectorReportV2_1>;
  /** Re-evaluated both before emit and synchronously by the completion monitor. */
  readonly validateCompletion: (report: DirectorReport) => DirectorRequestValidation;
}

export interface DirectorApplicationOptions {
  readonly signal?: AbortSignal;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly lifecycle: DirectorRequestLifecycleV1;
}

export class DirectorLifecycleContractError extends Error {
  constructor() {
    super('Director application analysis requires a bound request lifecycle.');
    this.name = 'DirectorLifecycleContractError';
  }
}

export class DirectorLifecycleRejectedError extends Error {
  constructor(readonly reason: DirectorAnalysisRejectionReason) {
    super(`Director analysis result was rejected: ${reason}.`);
    this.name = 'DirectorLifecycleRejectedError';
  }
}

export class DirectorCompletionNotAdmittedError extends Error {
  constructor(message = 'Director completion was not admitted by the report store.') {
    super(message);
    this.name = 'DirectorCompletionNotAdmittedError';
  }
}

export interface DirectorApplicationService {
  reportFailure(
    projectId: string,
    error: unknown,
    options: DirectorApplicationOptions,
  ): Promise<void>;
  analyzeManifest(
    manifest: RenderManifest,
    options: DirectorApplicationOptions,
  ): Promise<VisualBoundDirectorReportV2_1>;
  analyzeInput(
    input: DirectorInput,
    options: DirectorApplicationOptions,
  ): Promise<VisualBoundDirectorReportV2_1>;
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
    options: DirectorApplicationOptions,
  ): Promise<VisualBoundDirectorReportV2_1> {
    const lifecycle = requireDirectorApplicationLifecycle(options);
    const startedAt = new Date().toISOString();
    try {
      requireLifecycleAdmission(lifecycle);
      await eventBus.emit('director:analysis-started', {
        projectId: input.projectId,
        sceneCount: input.scenes.length,
        startedAt,
        admit: lifecycle.canEmitLifecycleEvent,
      });
      requireLifecycleAdmission(lifecycle);
      const engineReport = await engine.analyze(input, {
        signal: options.signal,
        onAnalyzerCompleted: async (diagnostic) => {
          if (!lifecycle.canEmitLifecycleEvent()) return;
          await eventBus.emit('director:analyzer-completed', {
            projectId: input.projectId,
            analyzerId: diagnostic.analyzerId,
            status: diagnostic.status,
            affectedSceneCount: diagnostic.affectedSceneIds.length,
            message: diagnostic.message,
            completedAt: new Date().toISOString(),
            admit: lifecycle.canEmitLifecycleEvent,
          });
        },
      });
      const report = await lifecycle.bindReport(engineReport);
      if (!isVisualBoundDirectorReportV2_1(report)) throw new DirectorLifecycleContractError();
      await emitIfCurrent('director:scene-ranked', { projectId: input.projectId, sceneCount: report.sceneRanking.scenes.length, rankedAt: new Date().toISOString(), admit: lifecycle.canEmitLifecycleEvent }, lifecycle);
      await emitIfCurrent('director:retention-map-completed', { projectId: input.projectId, segmentCount: report.retentionRiskMap.length, completedAt: new Date().toISOString(), admit: lifecycle.canEmitLifecycleEvent }, lifecycle);
      await emitIfCurrent('director:edit-plan-created', { projectId: input.projectId, decisionCount: report.editDecisionPlan.decisions.length, createdAt: new Date().toISOString(), admit: lifecycle.canEmitLifecycleEvent }, lifecycle);
      let completionRejection: DirectorAnalysisRejectionReason | null = null;
      const completion: { state: 'pending' | 'stored' | 'failed'; failure?: unknown } = { state: 'pending' };
      const admission: DirectorCompletionAdmissionV1 = Object.freeze({
        validate(candidate: DirectorReport): boolean {
          if (completion.state !== 'pending' || candidate !== report) return false;
          try {
            const validation = lifecycle.validateCompletion(report);
            if (!validation.accepted) completionRejection = validation.reason;
            return validation.accepted;
          } catch (error) {
            completion.state = 'failed';
            completion.failure = error;
            return false;
          }
        },
        acknowledgeStored(candidate: DirectorReport): void {
          if (completion.state !== 'pending' || candidate !== report) return;
          completion.state = 'stored';
        },
        fail(error: unknown): void {
          if (completion.state !== 'pending') return;
          completion.state = 'failed';
          completion.failure = error;
        },
      });
      if (!admission.validate(report)) throw completionAdmissionError(completionRejection, completion.failure);
      await eventBus.emit('director:analysis-completed', {
        projectId: input.projectId,
        overallScore: report.overallScore,
        recommendationCount: new Set(report.sceneScores.flatMap((scene) => scene.recommendations.map((item) => item.id))).size,
        analyzerFailureCount: report.analyzerDiagnostics.filter((item) => item.status === 'failed').length,
        completedAt: new Date().toISOString(),
        report,
        admission,
      });
      if (completion.state !== 'stored') throw completionAdmissionError(completionRejection, completion.failure);
      return report;
    } catch (error) {
      await reportFailure(input.projectId, error, options);
      throw error;
    }
  }

  async function reportFailure(
    projectId: string,
    error: unknown,
    options: DirectorApplicationOptions,
  ): Promise<void> {
    const lifecycle = requireDirectorApplicationLifecycle(options);
    if (!lifecycle.ownsRequestLifecycle()) return;
    await eventBus.emit('director:analysis-failed', {
      projectId,
      message: error instanceof Error ? error.message : 'Director analysis failed.',
      cancelled: options.signal?.aborted === true || isAbortError(error),
      failedAt: new Date().toISOString(),
      admit: lifecycle.ownsRequestLifecycle,
    });
  }

  async function emitIfCurrent<EventName extends 'director:scene-ranked' | 'director:retention-map-completed' | 'director:edit-plan-created'>(
    eventName: EventName,
    payload: ApplicationEventMap[EventName],
    lifecycle: DirectorRequestLifecycleV1,
  ): Promise<void> {
    if (!lifecycle.canEmitLifecycleEvent()) return;
    await eventBus.emit(eventName, payload);
  }

  return {
    reportFailure,
    analyzeManifest(manifest, options) {
      requireDirectorApplicationLifecycle(options);
      return analyzeInput(createDirectorInput(manifest), options);
    },
    analyzeInput,
  };
}

function requireDirectorApplicationLifecycle(options: unknown): DirectorRequestLifecycleV1 {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new DirectorLifecycleContractError();
  const lifecycle = (options as { lifecycle?: unknown }).lifecycle;
  if (!lifecycle || typeof lifecycle !== 'object' || Array.isArray(lifecycle)) throw new DirectorLifecycleContractError();
  const candidate = lifecycle as Partial<DirectorRequestLifecycleV1>;
  if (typeof candidate.canEmitLifecycleEvent !== 'function'
    || typeof candidate.ownsRequestLifecycle !== 'function'
    || typeof candidate.bindReport !== 'function'
    || typeof candidate.validateCompletion !== 'function') {
    throw new DirectorLifecycleContractError();
  }
  return lifecycle as DirectorRequestLifecycleV1;
}

function requireLifecycleAdmission(lifecycle: DirectorRequestLifecycleV1): void {
  if (!lifecycle.canEmitLifecycleEvent()) throw new DirectorLifecycleRejectedError('superseded');
}

function completionAdmissionError(
  rejection: DirectorAnalysisRejectionReason | null,
  failure: unknown,
): Error {
  if (rejection) return new DirectorLifecycleRejectedError(rejection);
  if (failure instanceof Error) return failure;
  return new DirectorCompletionNotAdmittedError();
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}
