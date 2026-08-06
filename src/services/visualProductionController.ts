import { createManifestRevisionId, createTimelineSnapshot, isTimelineSnapshotCurrent, type TimelineSnapshot } from '@/core/editing';
import { validateMediaProject, type MediaValidationReport, type RenderManifest } from '@/core/media';
import { useMediaStore } from '@/store/mediaStore';
import { useVisualProductionStore } from '@/store/visualProductionStore';
import type { VisualProductionApplicationService } from './visualProductionApplicationService';
import { createVisualAnalysisRequestIdentity, createVisualPreviewRequestIdentity } from '@/core/visual-production';
import { acquireVisualOperation, getActiveVisualOperation, releaseVisualOperation, resetVisualOperationCoordinator, type VisualOperationLease } from './visualOperationCoordinator';

const STALE_MESSAGE = 'Manifest was changed by another operation; visual revision history is no longer current.';
let service: VisualProductionApplicationService | null = null;
let previewGeneration = 0;
let previewAbort: AbortController | null = null;
let analysisGeneration = 0;
let analysisAbort: AbortController | null = null;

export function configureVisualProductionController(value: VisualProductionApplicationService | null) { previewAbort?.abort(); previewAbort = null; analysisAbort?.abort(); analysisAbort = null; if (value === null) resetVisualOperationCoordinator(); service = value; }
export function cancelActiveVisualAnalysis() { const requestId = useVisualProductionStore.getState().analysisRequest?.requestId; analysisAbort?.abort(); analysisAbort = null; if (requestId !== undefined) useVisualProductionStore.getState().analysisCancelled(requestId); }
export function cancelActiveVisualPreview() { const requestId = useVisualProductionStore.getState().previewRequest?.requestId; previewAbort?.abort(); previewAbort = null; if (requestId !== undefined) useVisualProductionStore.getState().previewCancelled(requestId); }
export async function createActiveVisualPlan(): Promise<boolean> {
  const active = requireService(), manifest = requireManifest();
  const lease = acquireVisualOperation(manifest.projectId, 'analyzing');
  try {
  const store = useVisualProductionStore.getState();
  const existing = store.snapshot;
  const snapshot = existing && isTimelineSnapshotCurrent(existing, manifest) ? existing : createTimelineSnapshot(manifest, createManifestRevisionId(manifest));
  if (snapshot !== existing) store.replace(snapshot);
  analysisAbort?.abort();
  const abort = new AbortController();
  analysisAbort = abort;
  const request = createVisualAnalysisRequestIdentity(snapshot, ++analysisGeneration);
  useVisualProductionStore.getState().start(request);
  try {
    const result = await active.createPlan(manifest, snapshot, abort.signal, request.requestId);
    if (abort.signal.aborted) return false;
    if (!analysisBindingsAreCurrent(request, snapshot)) { useVisualProductionStore.getState().analysisCancelled(request.requestId); return false; }
    if (!useVisualProductionStore.getState().complete(request, result.plan, result.snapshot)) return false;
    await refreshVisualPreviewUnderLease(lease);
    return true;
  } catch (error) {
    if (abort.signal.aborted || isAbortError(error)) return false;
    const message = error instanceof Error ? error.message : 'Analysis failed.';
    if (useVisualProductionStore.getState().analysisFailed(request, message)) throw error;
    return false;
  } finally {
    if (analysisAbort === abort) analysisAbort = null;
  }
  } finally { releaseVisualOperation(lease); }
}
export async function refreshVisualPreview(): Promise<boolean> {
  const state = useVisualProductionStore.getState();
  if (!state.plan || !state.snapshot) throw new Error('Create a visual plan first.');
  const lease = acquireVisualOperation(state.snapshot.projectId, 'previewing');
  try { return await refreshVisualPreviewUnderLease(lease); } finally { releaseVisualOperation(lease); }
}
async function refreshVisualPreviewUnderLease(lease: VisualOperationLease): Promise<boolean> {
  const state = useVisualProductionStore.getState();
  if (!state.plan || !state.snapshot || state.snapshot.projectId !== lease.projectId) throw new Error('Create a visual plan first.');
  previewAbort?.abort();
  const abort = new AbortController();
  previewAbort = abort;
  const approvedIds = [...new Set(state.approvedIds)].sort();
  const request = createVisualPreviewRequestIdentity(state.plan, state.snapshot, approvedIds, ++previewGeneration);
  useVisualProductionStore.getState().previewStarted(request);
  try {
    const preview = await requireService().createPreview(state.plan, state.snapshot, approvedIds, abort.signal);
    if (abort.signal.aborted) return false;
    const currentManifest = useMediaStore.getState().manifest;
    if (!currentManifest || !isTimelineSnapshotCurrent(state.snapshot, currentManifest)) throw new Error('The project changed while previewing. Refresh the visual plan.');
    return useVisualProductionStore.getState().previewCompleted(request, preview);
  } catch (error) {
    if (abort.signal.aborted || isAbortError(error)) return false;
    const message = error instanceof Error ? error.message : 'Visual preview failed.';
    if (useVisualProductionStore.getState().previewFailed(request, message)) throw error;
    return false;
  } finally {
    if (previewAbort === abort) previewAbort = null;
  }
}

export async function applyActiveVisualPlan() {
  const state = useVisualProductionStore.getState();
  const projectId = state.activeProjectId ?? useMediaStore.getState().manifest?.projectId;
  if (!projectId) throw new Error('Build the active media manifest in Studio first.');
  if (getActiveVisualOperation(projectId)?.operation === 'previewing' && (!state.plan || !state.preview || !state.snapshot || !state.isPreviewCurrent())) throw new Error('Wait for the latest preview before applying.');
  const lease = acquireVisualOperation(projectId, 'applying');
  const visualBefore = useVisualProductionStore.getState();
  const mediaBefore = useMediaStore.getState();
  try {
  if (!state.plan || !state.preview || !state.snapshot || !state.isPreviewCurrent()) throw new Error('Wait for the latest preview before applying.');
  const source = state.snapshot;
  assertSourceCurrent(source, 'Stale visual revision; create a new plan.');
  state.applying();
  const result = await requireService().apply(state.plan, state.preview, source, state.approvedIds);
  if (result.previousRevision.id !== source.revisionId || result.previousRevision.snapshot.manifestFingerprint !== source.manifestFingerprint) { quarantineCurrentManifest(); throw new Error('Stale visual apply result was rejected.'); }
  const preparedInstall = prepareManifestInstall(source, result.revision.snapshot.manifest);
  useVisualProductionStore.getState().applied(result);
  try { preparedInstall.install(); } catch (error) { useVisualProductionStore.setState(visualBefore, true); rollbackInstalledMedia(preparedInstall.fingerprint, mediaBefore); throw error; }
  } catch (error) { if (useMediaStore.getState().manifest === mediaBefore.manifest) useVisualProductionStore.setState(visualBefore, true); throw error; } finally { releaseVisualOperation(lease); }
}

export async function undoVisual() { await moveVisualRevision('undo'); }
export async function redoVisual() { await moveVisualRevision('redo'); }

async function moveVisualRevision(kind: 'undo' | 'redo') {
  const before = useVisualProductionStore.getState();
  const source = before.snapshot;
  if (!source) { if (before.activeProjectId && (before.history[before.activeProjectId]?.length ?? 0) > 0) { quarantineCurrentManifest(); throw new Error(STALE_MESSAGE); } return; }
  assertSourceCurrent(source, STALE_MESSAGE);
  const lease = acquireVisualOperation(source.projectId, kind === 'undo' ? 'undoing' : 'redoing');
  try {
  const move = useVisualProductionStore.getState().prepareRevisionMove(kind);
  if (!move) return;
  await requireService().revisionCompleted(kind, move.target.projectId, move.target.id);
  assertSourceCurrent(source, STALE_MESSAGE);
  const preparedInstall = prepareManifestInstall(source, move.target.snapshot.manifest);
  const rollback = useVisualProductionStore.getState().captureRevisionRollback(move.projectId);
  if (!rollback || rollback.snapshot?.revisionId !== move.sourceRevisionId) throw new Error(STALE_MESSAGE);
  if (!useVisualProductionStore.getState().commitRevisionMove(move)) {
    throw new Error(STALE_MESSAGE);
  }
  const mediaBefore = useMediaStore.getState();
  try { preparedInstall.install(); } catch (error) { useVisualProductionStore.getState().rollbackRevisionMove(move, rollback); rollbackInstalledMedia(preparedInstall.fingerprint, mediaBefore); throw error; }
  } finally { releaseVisualOperation(lease); }
}

function prepareManifestInstall(source: TimelineSnapshot, candidate: RenderManifest) {
  assertSourceCurrent(source, STALE_MESSAGE);
  if (candidate.projectId !== source.projectId) { quarantineCurrentManifest(); throw new Error('Visual revision project does not match the active manifest.'); }
  const media = useMediaStore.getState();
  let validation: MediaValidationReport | null = null;
  if (media.project && media.assetResolution) validation = validateMediaProject({ project: media.project, manifest: { ...candidate, validation: null }, assetResolution: media.assetResolution });
  assertSourceCurrent(source, STALE_MESSAGE);
  return { fingerprint: createManifestRevisionId(candidate), install: () => {
    const currentMedia = useMediaStore.getState();
    if (!currentMedia.manifest || !isTimelineSnapshotCurrent(source, currentMedia.manifest)) throw new Error(STALE_MESSAGE);
    if (validation) currentMedia.replaceValidatedManifest(candidate, validation); else currentMedia.replaceEditedManifest(candidate);
  } };
}

function rollbackInstalledMedia(candidateFingerprint: string, before: ReturnType<typeof useMediaStore.getState>) { const current = useMediaStore.getState().manifest; if (current && createManifestRevisionId(current) === candidateFingerprint) useMediaStore.setState(before, true); }

function assertSourceCurrent(source: TimelineSnapshot, message: string) {
  const current = useMediaStore.getState().manifest;
  if (!current || !isTimelineSnapshotCurrent(source, current)) { if (current) quarantineCurrentManifest(current); throw new Error(message); }
}
function quarantineCurrentManifest(manifest = useMediaStore.getState().manifest) { if (!manifest) return; useVisualProductionStore.getState().replace(createTimelineSnapshot(manifest, createManifestRevisionId(manifest))); }
function requireManifest() { const value = useMediaStore.getState().manifest; if (!value) throw new Error('Build the active media manifest in Studio first.'); return value; }
function requireService() { if (!service) throw new Error('AI Visual Production service is not ready.'); return service; }
function isAbortError(error: unknown) { return error instanceof Error && error.name === 'AbortError'; }
function analysisBindingsAreCurrent(request: ReturnType<typeof createVisualAnalysisRequestIdentity>, snapshot: TimelineSnapshot) {
  const manifest = useMediaStore.getState().manifest;
  const state = useVisualProductionStore.getState();
  return Boolean(manifest && isTimelineSnapshotCurrent(snapshot, manifest) && manifest.projectId === request.projectId && state.activeProjectId === request.projectId && state.analysisRequest?.requestId === request.requestId);
}
