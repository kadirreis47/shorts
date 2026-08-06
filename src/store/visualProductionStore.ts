import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isTimelineSnapshotInternallyValid, type TimelineRevision, type TimelineSnapshot } from '@/core/editing';
import type { VisualOperation, VisualProductionPlan, VisualProductionPreview, VisualProductionResult } from '@/core/visual-production';
import { createVisualPreviewRequestIdentity, previewMatchesRequest, type VisualAnalysisRequestIdentity, type VisualPreviewRequestIdentity } from '@/core/visual-production';
import { createPersistentStorage } from '@/persistence/storeStorage';

export interface VisualRevisionMove {
  readonly kind: 'undo' | 'redo';
  readonly projectId: string;
  readonly sourceRevisionId: string;
  readonly target: TimelineRevision;
  readonly history: readonly TimelineRevision[];
  readonly redoStack: readonly TimelineRevision[];
}

export interface VisualRevisionRollback {
  readonly projectId: string;
  readonly activeProjectId: string | null;
  readonly snapshot: TimelineSnapshot | null;
  readonly plan: VisualProductionPlan | null;
  readonly preview: VisualProductionPreview | null;
  readonly operations: readonly VisualOperation[];
  readonly approvedIds: readonly string[];
  readonly history: readonly TimelineRevision[];
  readonly redoStack: readonly TimelineRevision[];
  readonly status: 'idle' | 'analyzing' | 'ready' | 'applying' | 'failed';
  readonly error: string | null;
  readonly previewStatus: 'idle' | 'loading' | 'ready' | 'failed';
  readonly previewRequest: VisualPreviewRequestIdentity | null;
  readonly analysisRequest: VisualAnalysisRequestIdentity | null;
}

interface State {
  activeProjectId: string | null;
  plan: VisualProductionPlan | null;
  preview: VisualProductionPreview | null;
  snapshot: TimelineSnapshot | null;
  operations: readonly VisualOperation[];
  approvedIds: readonly string[];
  history: Record<string, TimelineRevision[]>;
  redoStack: Record<string, TimelineRevision[]>;
  status: 'idle' | 'analyzing' | 'ready' | 'applying' | 'failed';
  error: string | null;
  previewStatus: 'idle' | 'loading' | 'ready' | 'failed';
  previewRequest: VisualPreviewRequestIdentity | null;
  analysisRequest: VisualAnalysisRequestIdentity | null;
  start(request: VisualAnalysisRequestIdentity): void;
  complete(request: VisualAnalysisRequestIdentity, plan: VisualProductionPlan, snapshot: TimelineSnapshot): boolean;
  analysisFailed(request: VisualAnalysisRequestIdentity, error: string): boolean;
  analysisCancelled(requestId: number): void;
  previewStarted(request: VisualPreviewRequestIdentity): void;
  previewCompleted(request: VisualPreviewRequestIdentity, value: VisualProductionPreview): boolean;
  previewFailed(request: VisualPreviewRequestIdentity, error: string): boolean;
  previewCancelled(requestId: number): void;
  isPreviewCurrent(): boolean;
  approve(id: string, value: boolean): void;
  toggle(id: string, value: boolean): void;
  applying(): void;
  applied(result: VisualProductionResult): void;
  fail(error: string): void;
  replace(snapshot: TimelineSnapshot): void;
  prepareRevisionMove(kind: 'undo' | 'redo'): VisualRevisionMove | null;
  commitRevisionMove(move: VisualRevisionMove): boolean;
  captureRevisionRollback(projectId: string): VisualRevisionRollback | null;
  rollbackRevisionMove(move: VisualRevisionMove, rollback: VisualRevisionRollback): boolean;
}

const initial = { activeProjectId: null, plan: null, preview: null, snapshot: null, operations: [], approvedIds: [], history: {}, redoStack: {}, status: 'idle' as const, error: null, previewStatus: 'idle' as const, previewRequest: null, analysisRequest: null };

export const useVisualProductionStore = create<State>()(persist((set, get) => ({
  ...initial,
  start: (analysisRequest) => set({ activeProjectId: analysisRequest.projectId, analysisRequest, status: 'analyzing', plan: null, preview: null, operations: [], approvedIds: [], error: null, previewStatus: 'idle', previewRequest: null }),
  complete: (request, plan, snapshot) => { if (!analysisRequestIsCurrent(get(), request) || !analysisResultMatches(request, plan, snapshot)) return false; set({ analysisRequest: null, plan, snapshot, operations: plan.operations, status: 'ready', preview: null, previewStatus: 'idle', previewRequest: null }); return true; },
  analysisFailed: (request, error) => { if (!analysisRequestIsCurrent(get(), request)) return false; set({ analysisRequest: null, status: 'failed', error, plan: null, preview: null, operations: [], approvedIds: [], previewStatus: 'idle', previewRequest: null }); return true; },
  analysisCancelled: (requestId) => { if (get().analysisRequest?.requestId === requestId) set({ status: 'idle', analysisRequest: null }); },
  previewStarted: (previewRequest) => set({ previewRequest, preview: null, previewStatus: 'loading', error: null }),
  previewCompleted: (request, preview) => { const state = get(); if (!requestIsCurrent(state, request) || !previewMatchesRequest(preview, request)) return false; set({ preview, previewStatus: 'ready' }); return true; },
  previewFailed: (request, error) => { if (!requestIsCurrent(get(), request)) return false; set({ preview: null, previewStatus: 'failed', error }); return true; },
  previewCancelled: (requestId) => { if (get().previewRequest?.requestId === requestId) set({ preview: null, previewStatus: 'idle', previewRequest: null }); },
  isPreviewCurrent: () => { const state = get(); return Boolean(state.preview && state.previewRequest && state.previewStatus === 'ready' && requestIsCurrent(state, state.previewRequest) && previewMatchesRequest(state.preview, state.previewRequest)); },
  approve: (id, value) => set((state) => ({ approvedIds: value ? [...new Set([...state.approvedIds, id])].sort() : state.approvedIds.filter((item) => item !== id), preview: null, previewStatus: 'idle', previewRequest: null })),
  toggle: (id, value) => set((state) => { const operations = state.operations.map((item) => item.id === id ? { ...item, status: value ? 'proposed' as const : 'disabled' as const } : item); return { operations, plan: state.plan ? { ...state.plan, operations } : null, approvedIds: state.approvedIds.filter((item) => item !== id), preview: null, previewStatus: 'idle', previewRequest: null }; }),
  applying: () => set({ status: 'applying', error: null }),
  applied: (result) => set((state) => { const history = unique([...(state.history[result.projectId] ?? []), result.previousRevision, result.revision]).slice(-10); return { snapshot: result.revision.snapshot, history: { ...state.history, [result.projectId]: history }, redoStack: { ...state.redoStack, [result.projectId]: [] }, approvedIds: [], preview: null, previewStatus: 'idle', previewRequest: null, status: 'ready' }; }),
  fail: (error) => set({ status: 'failed', error }),
  replace: (snapshot) => set((state) => ({ activeProjectId: snapshot.projectId, snapshot, history: { ...state.history, [snapshot.projectId]: [revision(snapshot)] }, redoStack: { ...state.redoStack, [snapshot.projectId]: [] }, plan: null, preview: null, previewStatus: 'idle', previewRequest: null, operations: [], approvedIds: [] })),
  prepareRevisionMove: (kind) => prepareMove(get(), kind),
  commitRevisionMove: (move) => {
    const state = get();
    if (state.activeProjectId !== move.projectId || state.snapshot?.revisionId !== move.sourceRevisionId) return false;
    set({ history: { ...state.history, [move.projectId]: [...move.history] }, redoStack: { ...state.redoStack, [move.projectId]: [...move.redoStack] }, snapshot: move.target.snapshot, plan: null, preview: null, operations: [], approvedIds: [], status: 'idle', error: null, previewStatus: 'idle', previewRequest: null, analysisRequest: null });
    return true;
  },
  captureRevisionRollback: (projectId) => captureRollback(get(), projectId),
  rollbackRevisionMove: (move, rollback) => { const state = get(); if (rollback.projectId !== move.projectId || state.activeProjectId !== move.projectId || state.snapshot?.revisionId !== move.target.id) return false; set({ activeProjectId: rollback.activeProjectId, snapshot: rollback.snapshot, plan: rollback.plan, preview: rollback.preview, operations: rollback.operations, approvedIds: rollback.approvedIds, history: { ...state.history, [move.projectId]: [...rollback.history] }, redoStack: { ...state.redoStack, [move.projectId]: [...rollback.redoStack] }, status: rollback.status, error: rollback.error, previewStatus: rollback.previewStatus, previewRequest: rollback.previewRequest, analysisRequest: rollback.analysisRequest }); return true; },
}), { name: 'shortsflow-visual-production', version: 1, storage: createPersistentStorage(), partialize: (state) => ({ activeProjectId: state.activeProjectId, history: state.history }) as State }));

function prepareMove(state: State, kind: 'undo' | 'redo'): VisualRevisionMove | null {
  const projectId = state.activeProjectId;
  const sourceRevisionId = state.snapshot?.revisionId;
  if (!projectId || !sourceRevisionId) return null;
  const history = state.history[projectId] ?? [];
  const redoStack = state.redoStack[projectId] ?? [];
  const target = kind === 'redo' ? redoStack.at(-1) : history.at(-2);
  if (!target || !isTimelineSnapshotInternallyValid(target.snapshot)) return null;
  if (kind === 'redo') return { kind, projectId, sourceRevisionId, target, history: [...history, target], redoStack: redoStack.slice(0, -1) };
  const removed = history.at(-1);
  if (!removed) return null;
  return { kind, projectId, sourceRevisionId, target, history: history.slice(0, -1), redoStack: [...redoStack, removed] };
}

function captureRollback(state: State, projectId: string): VisualRevisionRollback | null { if (state.activeProjectId !== projectId) return null; return { projectId, activeProjectId: state.activeProjectId, snapshot: state.snapshot, plan: state.plan, preview: state.preview, operations: state.operations, approvedIds: state.approvedIds, history: [...(state.history[projectId] ?? [])], redoStack: [...(state.redoStack[projectId] ?? [])], status: state.status, error: state.error, previewStatus: state.previewStatus, previewRequest: state.previewRequest, analysisRequest: state.analysisRequest }; }

function revision(snapshot: TimelineSnapshot): TimelineRevision { return { id: snapshot.revisionId, projectId: snapshot.projectId, parentRevisionId: snapshot.parentRevisionId, createdAt: snapshot.createdAt, operationIds: [], snapshot }; }
function unique(items: TimelineRevision[]) { return items.filter((item, index) => items.findIndex((candidate) => candidate.id === item.id) === index); }

function requestIsCurrent(state: State, request: VisualPreviewRequestIdentity): boolean {
  if (!state.previewRequest || state.previewRequest.requestId !== request.requestId || !state.plan || !state.snapshot) return false;
  const current = createVisualPreviewRequestIdentity(state.plan, state.snapshot, state.approvedIds, request.requestId);
  return JSON.stringify(current) === JSON.stringify(request);
}

function analysisRequestIsCurrent(state: State, request: VisualAnalysisRequestIdentity): boolean {
  return state.analysisRequest?.requestId === request.requestId
    && state.activeProjectId === request.projectId
    && state.analysisRequest.projectId === request.projectId
    && state.analysisRequest.sourceRevisionId === request.sourceRevisionId
    && state.analysisRequest.sourceManifestFingerprint === request.sourceManifestFingerprint;
}

function analysisResultMatches(request: VisualAnalysisRequestIdentity, plan: VisualProductionPlan, snapshot: TimelineSnapshot): boolean {
  return plan.projectId === request.projectId && snapshot.projectId === request.projectId && snapshot.revisionId === request.sourceRevisionId && snapshot.manifestFingerprint === request.sourceManifestFingerprint;
}
