import type { MediaEngine } from '@/core/media';
import { createManifestRevisionId } from '@/core/editing';
import {
  bindDirectorReportV2_1,
  createDirectorVisualPlanningBindingV1,
  type VisualBoundDirectorReportV2_1,
} from '@/core/director';
import { useMediaStore } from '@/store/mediaStore';
import {
  DirectorLifecycleRejectedError,
  type DirectorApplicationService,
  type DirectorRequestLifecycleV1,
} from './directorApplicationService';
import {
  createDirectorVisualAnalysisRequestV1,
  DirectorRequestConsistencyError,
  validateDirectorRequestCompletionV1,
  validateDirectorRequestSourceCurrentV1,
  type DirectorAnalysisOutcome,
  type DirectorAnalysisRejectionReason,
  type DirectorMediaStoreLeaseV1,
  type DirectorSnapshotRequestSourceV1,
  type DirectorVisualAnalysisRequestV1,
} from './directorSnapshotRequestAdapter';

let directorService: DirectorApplicationService | null = null;
let mediaEngine: MediaEngine | null = null;
let nextRequestId = 0;

interface ActiveDirectorRequest {
  readonly requestId: number;
  readonly controller: AbortController;
  cancelled: boolean;
}

let activeRequest: ActiveDirectorRequest | null = null;

export type ActiveDirectorProjectRequest = DirectorSnapshotRequestSourceV1;
export type { DirectorAnalysisOutcome } from './directorSnapshotRequestAdapter';

export function configureDirectorAnalysisController(
  service: DirectorApplicationService | null,
  engine: MediaEngine | null,
): void {
  activeRequest?.controller.abort();
  activeRequest = null;
  nextRequestId += 1;
  directorService = service;
  mediaEngine = engine;
}

export function cancelActiveDirectorAnalysis(): void {
  if (!activeRequest) return;
  activeRequest.cancelled = true;
  activeRequest.controller.abort();
}

export async function analyzeActiveDirectorProject(
  source: ActiveDirectorProjectRequest,
): Promise<DirectorAnalysisOutcome> {
  if (!directorService) throw new Error('AI Director service henüz hazır değil.');
  if (!mediaEngine) throw new Error('Media Engine henüz hazır değil; uygulamayı yeniden başlatıp tekrar deneyin.');
  const service = directorService;
  const engine = mediaEngine;
  if (!source.projectId.trim()) throw new Error('AI Director analizi için geçerli bir aktif proje kimliği gerekli.');
  if (!source.buildInput.scenes.length) throw new Error('AI Director analizi için projeye en az bir sahne ekleyin.');

  const previous = activeRequest;
  const request: ActiveDirectorRequest = {
    requestId: ++nextRequestId,
    controller: new AbortController(),
    cancelled: false,
  };
  // Ownership moves synchronously before cooperative cancellation can invoke callbacks.
  activeRequest = request;
  previous?.controller.abort();
  const startingLease = captureMediaStoreLease();
  let submitted = false;

  try {
    const build = await engine.buildProject(source.buildInput);
    const postBuildRejection = currentLifecycleRejection(request, source);
    if (postBuildRejection) return rejected(postBuildRejection);
    if (build.project.id !== source.projectId || build.manifest.projectId !== source.projectId) {
      return rejected('inconsistent-request');
    }
    if (build.project.metadata.productionRecipe?.identity !== source.studioRecipeIdentity
      || build.manifest.metadata.productionRecipe?.identity !== source.studioRecipeIdentity) {
      return rejected('inconsistent-request');
    }
    if (!mediaStoreLeaseMatches(startingLease)) return rejected('manifest-stale');

    const sourceValidation = readAndValidateSource(source);
    if (!sourceValidation.accepted) return rejected(sourceValidation.reason);

    let envelope: DirectorVisualAnalysisRequestV1;
    try {
      envelope = createDirectorVisualAnalysisRequestV1(request.requestId, source, build.manifest, startingLease);
    } catch (error) {
      if (error instanceof DirectorRequestConsistencyError) return rejected(error.reason);
      throw error;
    }

    const preInstallRejection = currentLifecycleRejection(request, source);
    if (preInstallRejection) return rejected(preInstallRejection);
    if (!mediaStoreLeaseMatches(startingLease)) return rejected('manifest-stale');
    const preInstallSource = readAndValidateSource(source);
    if (!preInstallSource.accepted) return rejected(preInstallSource.reason);

    useMediaStore.getState().setBuildResult(
      build.project,
      build.manifest,
      build.renderReady,
      build.assetResolution,
      build.validation,
    );

    const installedManifest = useMediaStore.getState().manifest;
    if (!installedManifest
      || installedManifest.projectId !== source.projectId
      || createManifestRevisionId(installedManifest) !== envelope.manifestBinding.analyzedManifestFingerprint) {
      return rejected('manifest-stale');
    }
    const preSubmitRejection = currentLifecycleRejection(request, source);
    if (preSubmitRejection) return rejected(preSubmitRejection);

    const lifecycle = createLifecycle(request, source, envelope);
    try {
      submitted = true;
      const report = await service.analyzeManifest(build.manifest, {
        signal: request.controller.signal,
        lifecycle,
      });
      return Object.freeze({ status: 'accepted', report });
    } catch (error) {
      const rejection = rejectionAfterAnalysisError(error, request, source);
      if (rejection) return rejected(rejection);
      throw error;
    }
  } catch (error) {
    if (!submitted && ownsGeneration(request) && safeCurrentProjectId(source) === source.projectId) {
      await service.reportFailure(source.projectId, error, {
        signal: request.controller.signal,
        lifecycle: createPreSubmitFailureLifecycle(request, source),
      });
    }
    throw error;
  } finally {
    if (activeRequest === request) activeRequest = null;
  }
}

function createPreSubmitFailureLifecycle(
  request: ActiveDirectorRequest,
  source: DirectorSnapshotRequestSourceV1,
): DirectorRequestLifecycleV1 {
  return Object.freeze({
    canEmitLifecycleEvent: () => currentLifecycleRejection(request, source) === null,
    ownsRequestLifecycle: () => ownsGeneration(request) && safeCurrentProjectId(source) === source.projectId,
    bindReport: async () => { throw new DirectorLifecycleRejectedError('inconsistent-request'); },
    validateCompletion: () => Object.freeze({ accepted: false as const, reason: 'inconsistent-request' as const }),
  });
}

function createLifecycle(
  request: ActiveDirectorRequest,
  source: DirectorSnapshotRequestSourceV1,
  envelope: DirectorVisualAnalysisRequestV1,
): DirectorRequestLifecycleV1 {
  let boundReport: VisualBoundDirectorReportV2_1 | null = null;
  const lifecycle: DirectorRequestLifecycleV1 = {
    canEmitLifecycleEvent: () => currentLifecycleRejection(request, source) === null,
    ownsRequestLifecycle: () => ownsGeneration(request) && safeCurrentProjectId(source) === source.projectId,
    bindReport: async (report) => {
      if (boundReport !== null) throw new DirectorLifecycleRejectedError('inconsistent-request');
      const visualPlanningBinding = await createDirectorVisualPlanningBindingV1(envelope.visualPlanningBundle);
      const created = bindDirectorReportV2_1(report, visualPlanningBinding);
      boundReport = created;
      return created;
    },
    validateCompletion: (report) => {
      const lifecycleRejection = currentLifecycleRejection(request, source);
      if (lifecycleRejection) return Object.freeze({ accepted: false as const, reason: lifecycleRejection });
      if (report !== boundReport) return Object.freeze({ accepted: false as const, reason: 'inconsistent-request' as const });
      return validateDirectorRequestCompletionV1(envelope, report, useMediaStore.getState().manifest);
    },
  };
  return Object.freeze(lifecycle);
}

function currentLifecycleRejection(
  request: ActiveDirectorRequest,
  source: DirectorSnapshotRequestSourceV1,
): DirectorAnalysisRejectionReason | null {
  if (!ownsGeneration(request)) return 'superseded';
  if (request.cancelled || request.controller.signal.aborted) return 'cancelled';
  const currentProjectId = safeCurrentProjectId(source);
  if (currentProjectId === null) return 'source-unavailable';
  return currentProjectId === source.projectId ? null : 'project-changed';
}

function ownsGeneration(request: ActiveDirectorRequest): boolean {
  return activeRequest === request && activeRequest.requestId === request.requestId;
}

function safeCurrentProjectId(source: DirectorSnapshotRequestSourceV1): string | null {
  try {
    return source.readCurrentProjectId();
  } catch {
    return null;
  }
}

function readAndValidateSource(source: DirectorSnapshotRequestSourceV1) {
  try {
    const current = source.readCurrentSource();
    return current
      ? validateDirectorRequestSourceCurrentV1(source, current)
      : Object.freeze({ accepted: false as const, reason: 'source-unavailable' as const });
  } catch {
    return Object.freeze({ accepted: false as const, reason: 'visual-snapshot-stale' as const });
  }
}

function captureMediaStoreLease(): DirectorMediaStoreLeaseV1 {
  const { project, manifest } = useMediaStore.getState();
  return Object.freeze({
    startingMediaProjectId: project?.id ?? manifest?.projectId ?? null,
    startingMediaManifestFingerprint: manifest ? createManifestRevisionId(manifest) : null,
  });
}

function mediaStoreLeaseMatches(lease: DirectorMediaStoreLeaseV1): boolean {
  const current = captureMediaStoreLease();
  return current.startingMediaProjectId === lease.startingMediaProjectId
    && current.startingMediaManifestFingerprint === lease.startingMediaManifestFingerprint;
}

function rejectionAfterAnalysisError(
  error: unknown,
  request: ActiveDirectorRequest,
  source: DirectorSnapshotRequestSourceV1,
): DirectorAnalysisRejectionReason | null {
  const lifecycleRejection = currentLifecycleRejection(request, source);
  if (lifecycleRejection) return lifecycleRejection;
  if (error instanceof DirectorLifecycleRejectedError) return error.reason;
  return isAbortError(error) ? 'cancelled' : null;
}

function rejected(reason: DirectorAnalysisRejectionReason): DirectorAnalysisOutcome {
  return Object.freeze({ status: 'rejected', reason });
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}
