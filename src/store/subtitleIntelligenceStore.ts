import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { canonicalSerialize, isTimelineSnapshotInternallyValid, MANIFEST_FINGERPRINT_VERSION, type TimelineRevision, type TimelineSnapshot } from '@/core/editing';
import type { SubtitleIntelligencePlan, SubtitleIntelligencePreview, SubtitleIntelligenceResult, SubtitleOperation } from '@/core/subtitle-intelligence';
import { createPersistentStorage } from '@/persistence/storeStorage';
import { stableId } from '@/core/editing/utils';

const HISTORY_LIMIT = 10;
export interface SubtitleRequest { requestId: number; projectId: string; revisionId: string; fingerprint: string; }
export interface SubtitleRevisionMove { kind: 'undo' | 'redo'; projectId: string; sourceRevisionId: string; target: TimelineRevision; history: readonly TimelineRevision[]; redo: readonly TimelineRevision[]; }
export interface SubtitleRollback { snapshot: TimelineSnapshot | null; plan: SubtitleIntelligencePlan | null; preview: SubtitleIntelligencePreview | null; operations: readonly SubtitleOperation[]; approvedIds: readonly string[]; history: readonly TimelineRevision[]; redo: readonly TimelineRevision[]; status: State['status']; error: string | null; }
export interface PersistedSubtitleState {
  activeProjectId: string | null;
  snapshot: TimelineSnapshot | null;
  currentRevisionId: string | null;
  fingerprintVersion: number;
  snapshotFingerprint: string | null;
  history: Record<string, TimelineRevision[]>;
  redoStack: Record<string, TimelineRevision[]>;
  quarantinedHistory: Record<string, TimelineRevision[]>;
}
interface State { activeProjectId: string | null; snapshot: TimelineSnapshot | null; currentRevisionId: string | null; plan: SubtitleIntelligencePlan | null; preview: SubtitleIntelligencePreview | null; operations: readonly SubtitleOperation[]; approvedIds: readonly string[]; history: Record<string, TimelineRevision[]>; redoStack: Record<string, TimelineRevision[]>; quarantinedHistory: Record<string, TimelineRevision[]>; status: 'idle' | 'analyzing' | 'previewing' | 'ready' | 'applying' | 'failed'; error: string | null; analysisRequest: SubtitleRequest | null; previewRequest: SubtitleRequest | null;
  replace(snapshot: TimelineSnapshot): void; start(request: SubtitleRequest): void; complete(request: SubtitleRequest, plan: SubtitleIntelligencePlan, snapshot: TimelineSnapshot): boolean; failRequest(request: SubtitleRequest, error: string): boolean; cancelRequest(kind: 'analysis' | 'preview', requestId: number): void; previewStarted(request: SubtitleRequest): void; previewCompleted(request: SubtitleRequest, preview: SubtitleIntelligencePreview): boolean; approve(id: string, value: boolean): void; toggle(id: string, value: boolean): void; isPreviewCurrent(): boolean; applying(): void; applied(result: SubtitleIntelligenceResult): void; fail(error: string): void; prepareRevisionMove(kind: 'undo' | 'redo'): SubtitleRevisionMove | null; commitRevisionMove(move: SubtitleRevisionMove): boolean; captureRollback(projectId: string): SubtitleRollback | null; rollbackRevisionMove(move: SubtitleRevisionMove, rollback: SubtitleRollback): boolean; }
const initial = { activeProjectId: null, snapshot: null, currentRevisionId: null, plan: null, preview: null, operations: [], approvedIds: [], history: {}, redoStack: {}, quarantinedHistory: {}, status: 'idle' as const, error: null, analysisRequest: null, previewRequest: null };

export const useSubtitleIntelligenceStore = create<State>()(persist((set, get) => ({ ...initial,
  replace: (snapshot) => set((state) => {
    const projectId = snapshot.projectId;
    const existing = [...(state.history[projectId] ?? []), ...(state.redoStack[projectId] ?? [])];
    return { activeProjectId: projectId, snapshot, currentRevisionId: snapshot.revisionId, history: { ...state.history, [projectId]: [revision(snapshot)] }, redoStack: { ...state.redoStack, [projectId]: [] }, quarantinedHistory: existing.length ? { ...state.quarantinedHistory, [projectId]: unique([...(state.quarantinedHistory[projectId] ?? []), ...existing]).slice(-HISTORY_LIMIT) } : state.quarantinedHistory, plan: null, preview: null, operations: [], approvedIds: [], status: 'idle', error: null, analysisRequest: null, previewRequest: null };
  }),
  start: (analysisRequest) => set({ activeProjectId: analysisRequest.projectId, analysisRequest, plan: null, preview: null, operations: [], approvedIds: [], status: 'analyzing', error: null, previewRequest: null }),
  complete: (request, plan, snapshot) => { if (!same(get().analysisRequest, request) || plan.projectId !== request.projectId || snapshot.manifestFingerprint !== request.fingerprint) return false; set({ analysisRequest: null, plan, snapshot, currentRevisionId: snapshot.revisionId, operations: plan.operations, preview: null, status: 'ready' }); return true; },
  failRequest: (request, error) => { if (!same(get().analysisRequest, request) && !same(get().previewRequest, request)) return false; set({ analysisRequest: null, previewRequest: null, status: 'failed', error }); return true; },
  cancelRequest: (kind, requestId) => { const key = kind === 'analysis' ? 'analysisRequest' : 'previewRequest'; if (get()[key]?.requestId === requestId) set({ [key]: null, status: get().plan ? 'ready' : 'idle' }); },
  previewStarted: (previewRequest) => set({ previewRequest, preview: null, status: 'previewing', error: null }),
  previewCompleted: (request, preview) => { if (!same(get().previewRequest, request) || preview.sourceRevisionId !== request.revisionId || preview.sourceManifestFingerprint !== request.fingerprint) return false; set({ previewRequest: request, preview, status: 'ready' }); return true; },
  approve: (id, value) => set((state) => ({ approvedIds: value ? [...new Set([...state.approvedIds, id])].sort() : state.approvedIds.filter((item) => item !== id), preview: null, previewRequest: null, status: 'ready' })),
  toggle: (id, value) => set((state) => { const operations = state.operations.map((item) => item.id === id ? { ...item, status: value ? 'proposed' as const : 'disabled' as const } : item); return { operations, plan: state.plan ? { ...state.plan, operations } : null, approvedIds: state.approvedIds.filter((item) => item !== id), preview: null, previewRequest: null }; }),
  isPreviewCurrent: () => { const state = get(); return Boolean(state.preview && state.previewRequest && state.plan && state.snapshot && state.preview.planId === state.plan.id && state.preview.sourceRevisionId === state.snapshot.revisionId && state.preview.approvalSignature === approval(state.approvedIds)); },
  applying: () => set({ status: 'applying', error: null }),
  applied: (result) => set((state) => ({ snapshot: result.revision.snapshot, currentRevisionId: result.revision.id, history: { ...state.history, [result.projectId]: unique([...(state.history[result.projectId] ?? []), result.previousRevision, result.revision]).slice(-HISTORY_LIMIT) }, redoStack: { ...state.redoStack, [result.projectId]: [] }, approvedIds: [], preview: null, previewRequest: null, status: 'ready' })),
  fail: (error) => set({ status: 'failed', error }),
  prepareRevisionMove: (kind) => prepare(get(), kind),
  commitRevisionMove: (move) => { const state = get(); if (state.activeProjectId !== move.projectId || state.snapshot?.revisionId !== move.sourceRevisionId) return false; set({ snapshot: move.target.snapshot, currentRevisionId: move.target.id, history: { ...state.history, [move.projectId]: [...move.history] }, redoStack: { ...state.redoStack, [move.projectId]: [...move.redo] }, plan: null, preview: null, operations: [], approvedIds: [], status: 'idle', error: null, analysisRequest: null, previewRequest: null }); return true; },
  captureRollback: (projectId) => { const state = get(); return state.activeProjectId !== projectId ? null : { snapshot: state.snapshot, plan: state.plan, preview: state.preview, operations: state.operations, approvedIds: state.approvedIds, history: [...(state.history[projectId] ?? [])], redo: [...(state.redoStack[projectId] ?? [])], status: state.status, error: state.error }; },
  rollbackRevisionMove: (move, rollback) => { const state = get(); if (state.snapshot?.revisionId !== move.target.id || state.activeProjectId !== move.projectId) return false; set({ snapshot: rollback.snapshot, currentRevisionId: rollback.snapshot?.revisionId ?? null, plan: rollback.plan, preview: rollback.preview, operations: rollback.operations, approvedIds: rollback.approvedIds, history: { ...state.history, [move.projectId]: [...rollback.history] }, redoStack: { ...state.redoStack, [move.projectId]: [...rollback.redo] }, status: rollback.status, error: rollback.error }); return true; },
}), { name: 'shortsflow-subtitle-intelligence', version: 2, storage: createPersistentStorage<PersistedSubtitleState>(), skipHydration: true,
  partialize: (state) => ({ activeProjectId: state.activeProjectId, snapshot: state.snapshot, currentRevisionId: state.currentRevisionId, fingerprintVersion: MANIFEST_FINGERPRINT_VERSION, snapshotFingerprint: state.snapshot?.manifestFingerprint ?? null, history: state.history, redoStack: state.redoStack, quarantinedHistory: state.quarantinedHistory }),
  migrate: (persisted) => normalizePersistedSubtitleState(persisted),
  merge: (persisted, current) => mergePersistedSubtitleState(persisted, current),
}));

export function normalizePersistedSubtitleState(value: unknown): PersistedSubtitleState {
  const empty: PersistedSubtitleState = { activeProjectId: null, snapshot: null, currentRevisionId: null, fingerprintVersion: MANIFEST_FINGERPRINT_VERSION, snapshotFingerprint: null, history: {}, redoStack: {}, quarantinedHistory: {} };
  if (!isRecord(value)) return empty;
  const activeProjectId = typeof value.activeProjectId === 'string' ? value.activeProjectId : null;
  const rawHistory = revisionMap(value.history);
  const rawRedo = revisionMap(value.redoStack);
  const quarantinedHistory = revisionMap(value.quarantinedHistory);
  const history: Record<string, TimelineRevision[]> = {};
  const redoStack: Record<string, TimelineRevision[]> = {};
  const droppedHistory: Record<string, TimelineRevision[]> = {};
  for (const [projectId, revisions] of Object.entries(rawHistory.valid)) { history[projectId] = coherentHistory(revisions); droppedHistory[projectId] = revisions.filter((item) => !history[projectId].some((entry) => entry.id === item.id)); }
  for (const [projectId, revisions] of Object.entries(rawRedo.valid)) redoStack[projectId] = revisions.filter((item) => !history[projectId]?.some((entry) => entry.id === item.id));
  const persistedSnapshot = validSnapshot(value.snapshot) ? value.snapshot : null;
  const historySnapshot = activeProjectId ? history[activeProjectId]?.at(-1)?.snapshot ?? null : null;
  const snapshot = persistedSnapshot && persistedSnapshot.projectId === activeProjectId && history[activeProjectId]?.some((item) => item.id === persistedSnapshot.revisionId) ? persistedSnapshot : historySnapshot;
  const snapshotMatchesMetadata = snapshot && (value.currentRevisionId === undefined || value.currentRevisionId === snapshot.revisionId) && (value.snapshotFingerprint === undefined || value.snapshotFingerprint === snapshot.manifestFingerprint);
  const usableSnapshot = snapshotMatchesMetadata ? snapshot : historySnapshot;
  const quarantined = mergeRevisionMaps(quarantinedHistory.valid, rawHistory.invalid, rawRedo.invalid, droppedHistory);
  for (const [projectId, revisions] of Object.entries(redoStack)) { const current = history[projectId]?.at(-1)?.snapshot ?? null; const accepted = coherentRedo(revisions, current); const rejected = revisions.filter((item) => !accepted.some((entry) => entry.id === item.id)); redoStack[projectId] = accepted; if (rejected.length) quarantined[projectId] = unique([...(quarantined[projectId] ?? []), ...rejected]).slice(-HISTORY_LIMIT); }
  if (activeProjectId && persistedSnapshot && usableSnapshot !== persistedSnapshot) quarantined[activeProjectId] = unique([...(quarantined[activeProjectId] ?? []), revision(persistedSnapshot)]).slice(-HISTORY_LIMIT);
  return { activeProjectId: usableSnapshot?.projectId ?? activeProjectId, snapshot: usableSnapshot, currentRevisionId: usableSnapshot?.revisionId ?? null, fingerprintVersion: MANIFEST_FINGERPRINT_VERSION, snapshotFingerprint: usableSnapshot?.manifestFingerprint ?? null, history, redoStack, quarantinedHistory: quarantined };
}

export function mergePersistedSubtitleState(persisted: unknown, current: State): State {
  const value = normalizePersistedSubtitleState(persisted);
  return { ...current, ...value, plan: null, preview: null, operations: [], approvedIds: [], status: 'idle', error: null, analysisRequest: null, previewRequest: null };
}

function prepare(state: State, kind: 'undo' | 'redo'): SubtitleRevisionMove | null { const projectId = state.activeProjectId; const sourceRevisionId = state.snapshot?.revisionId; if (!projectId || !sourceRevisionId) return null; const history = state.history[projectId] ?? []; const redo = state.redoStack[projectId] ?? []; const target = kind === 'undo' ? history.at(-2) : redo.at(-1); if (!target || !isTimelineSnapshotInternallyValid(target.snapshot)) return null; if (kind === 'redo') return { kind, projectId, sourceRevisionId, target, history: [...history, target], redo: redo.slice(0, -1) }; const removed = history.at(-1)!; return { kind, projectId, sourceRevisionId, target, history: history.slice(0, -1), redo: [...redo, removed] }; }
function revision(snapshot: TimelineSnapshot): TimelineRevision { return { id: snapshot.revisionId, projectId: snapshot.projectId, parentRevisionId: snapshot.parentRevisionId, createdAt: snapshot.createdAt, operationIds: [], snapshot }; }
function unique(items: TimelineRevision[]): TimelineRevision[] { return items.filter((item, index) => items.findIndex((candidate) => candidate.id === item.id) === index); }
function same(a: SubtitleRequest | null, b: SubtitleRequest): boolean { return Boolean(a && a.requestId === b.requestId && a.projectId === b.projectId && a.revisionId === b.revisionId && a.fingerprint === b.fingerprint); }
function approval(ids: readonly string[]): string { return stableId('subtitle-approval', canonicalSerialize([...new Set(ids)].sort())); }
function validSnapshot(value: unknown): value is TimelineSnapshot { if (!isRecord(value) || typeof value.projectId !== 'string' || typeof value.revisionId !== 'string' || typeof value.manifestFingerprint !== 'string' || value.fingerprintVersion !== MANIFEST_FINGERPRINT_VERSION || !isRecord(value.manifest)) return false; try { return isTimelineSnapshotInternallyValid(value as unknown as TimelineSnapshot); } catch { return false; } }
function validRevision(value: unknown, projectId: string): value is TimelineRevision { return isRecord(value) && value.projectId === projectId && typeof value.id === 'string' && value.id === (isRecord(value.snapshot) ? value.snapshot.revisionId : undefined) && (typeof value.parentRevisionId === 'string' || value.parentRevisionId === null) && typeof value.createdAt === 'string' && Array.isArray(value.operationIds) && value.operationIds.every((id) => typeof id === 'string') && validSnapshot(value.snapshot) && value.snapshot.projectId === projectId; }
function revisionMap(value: unknown): { valid: Record<string, TimelineRevision[]>; invalid: Record<string, TimelineRevision[]> } { const valid: Record<string, TimelineRevision[]> = {}; const invalid: Record<string, TimelineRevision[]> = {}; if (!isRecord(value)) return { valid, invalid }; for (const [projectId, entries] of Object.entries(value)) { if (!Array.isArray(entries)) continue; for (const entry of entries) { if (validRevision(entry, projectId)) (valid[projectId] ??= []).push(entry); else if (revisionShape(entry, projectId)) (invalid[projectId] ??= []).push(entry); } if (valid[projectId]) valid[projectId] = unique(valid[projectId]).slice(-HISTORY_LIMIT); } return { valid, invalid }; }
function revisionShape(value: unknown, projectId: string): value is TimelineRevision { return isRecord(value) && typeof value.id === 'string' && value.projectId === projectId && isRecord(value.snapshot) && typeof value.snapshot.revisionId === 'string'; }
function coherentHistory(items: TimelineRevision[]): TimelineRevision[] { const result: TimelineRevision[] = []; for (const item of items) { if (!result.length || item.parentRevisionId === result.at(-1)!.id || item.parentRevisionId === null) result.push(item); } return result.slice(-HISTORY_LIMIT); }
function coherentRedo(items: TimelineRevision[], current: TimelineSnapshot | null): TimelineRevision[] { if (!current) return []; const acceptedFromTop: TimelineRevision[] = []; let parent = current.revisionId; for (const item of [...items].reverse()) { if (item.parentRevisionId !== parent) break; acceptedFromTop.push(item); parent = item.id; } return acceptedFromTop.reverse(); }
function mergeRevisionMaps(...maps: Record<string, TimelineRevision[]>[]): Record<string, TimelineRevision[]> { const result: Record<string, TimelineRevision[]> = {}; for (const map of maps) for (const [projectId, items] of Object.entries(map)) if (items.length) result[projectId] = unique([...(result[projectId] ?? []), ...items]).slice(-HISTORY_LIMIT); return result; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
