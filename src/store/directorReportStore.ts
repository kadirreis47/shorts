import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isSupportedDirectorReport, type DirectorReport } from '@/core/director';
import { createPersistentStorage } from '@/persistence/storeStorage';

export type DirectorAnalysisStatus = 'idle' | 'running' | 'completed' | 'failed';
interface PersistedDirectorState { reportsByProject: Record<string, DirectorReport>; activeProjectId: string | null; lastAnalyzedAt?: string | null; }
interface DirectorReportState extends PersistedDirectorState {
  currentReport: DirectorReport | null; analysisStatus: DirectorAnalysisStatus; analysisProgress: number;
  currentAnalyzer: string | null; lastError: string | null; lastAnalyzedAt: string | null;
  analysisStarted(projectId: string): void; analyzerCompleted(analyzerId: string): void; analysisCompleted(report: DirectorReport, completedAt?: string): boolean;
  analysisFailed(message: string): void; selectProjectReport(projectId: string): void; clearProjectReport(projectId: string): void; reset(): void;
}
export const MAX_DIRECTOR_REPORT_BYTES = 1_000_000;
const initial = { activeProjectId: null, currentReport: null, reportsByProject: {}, analysisStatus: 'idle' as const,
  analysisProgress: 0, currentAnalyzer: null, lastError: null, lastAnalyzedAt: null };

export function mergeDirectorPersistedState(persisted: unknown, current: DirectorReportState): DirectorReportState {
  if (!isRecord(persisted)) return current;
  const reportsByProject = normalizeReports(persisted.reportsByProject);
  const requestedId = typeof persisted.activeProjectId === 'string' ? persisted.activeProjectId : null;
  const fallbackId = requestedId === null ? newestReportId(reportsByProject) : null;
  const activeProjectId = requestedId && reportsByProject[requestedId] ? requestedId : fallbackId;
  const currentReport = activeProjectId ? reportsByProject[activeProjectId] ?? null : null;
  const lastAnalyzedAt = typeof persisted.lastAnalyzedAt === 'string'
    ? persisted.lastAnalyzedAt
    : currentReport?.generatedAt ?? null;
  return { ...current, reportsByProject, activeProjectId, currentReport, lastAnalyzedAt };
}

function normalizeReports(value: unknown): Record<string, DirectorReport> {
  if (!isRecord(value)) return {};
  const reports: Record<string, DirectorReport> = {};
  for (const [projectId, report] of Object.entries(value)) {
    if (isSupportedDirectorReport(report) && report.projectId === projectId) reports[projectId] = report;
  }
  return reports;
}

function newestReportId(reports: Record<string, DirectorReport>): string | null {
  return Object.values(reports).sort((left, right) => right.generatedAt.localeCompare(left.generatedAt) || left.projectId.localeCompare(right.projectId))[0]?.projectId ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const useDirectorReportStore = create<DirectorReportState>()(persist((set) => ({
  ...initial,
  analysisStarted: (projectId) => set({ activeProjectId: projectId, currentReport: null, analysisStatus: 'running', analysisProgress: 5, currentAnalyzer: null, lastError: null }),
  analyzerCompleted: (currentAnalyzer) => set((state) => ({ currentAnalyzer, analysisProgress: Math.min(90, state.analysisProgress + 11) })),
  analysisCompleted: (report, completedAt = new Date().toISOString()) => {
    const persistable = new TextEncoder().encode(JSON.stringify(report)).byteLength <= MAX_DIRECTOR_REPORT_BYTES;
    set((state) => ({ activeProjectId: report.projectId, currentReport: report,
      reportsByProject: persistable ? { ...state.reportsByProject, [report.projectId]: report } : state.reportsByProject,
      analysisStatus: 'completed', analysisProgress: 100, currentAnalyzer: null,
      lastError: persistable ? null : 'Director report persistence size limit exceeded.', lastAnalyzedAt: completedAt }));
    return persistable;
  },
  analysisFailed: (lastError) => set({ analysisStatus: 'failed', analysisProgress: 0, currentAnalyzer: null, lastError }),
  selectProjectReport: (activeProjectId) => set((state) => ({ activeProjectId, currentReport: state.reportsByProject[activeProjectId] ?? null })),
  clearProjectReport: (projectId) => set((state) => { const reportsByProject = { ...state.reportsByProject }; delete reportsByProject[projectId];
    return { reportsByProject, currentReport: state.activeProjectId === projectId ? null : state.currentReport, activeProjectId: state.activeProjectId === projectId ? null : state.activeProjectId }; }),
  reset: () => set(initial),
}), { name: 'shortsflow-director-reports', version: 1, storage: createPersistentStorage<PersistedDirectorState>(), skipHydration: true,
  partialize: (state) => ({ reportsByProject: state.reportsByProject, activeProjectId: state.activeProjectId, lastAnalyzedAt: state.lastAnalyzedAt }),
  merge: mergeDirectorPersistedState }));
