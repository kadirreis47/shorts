import { useCallback } from 'react';
import { analyzeActiveDirectorProject, cancelActiveDirectorAnalysis } from '@/services/directorAnalysisController';
import type { ActiveDirectorProjectRequest } from '@/services/directorAnalysisController';
import { useDirectorReportStore } from '@/store/directorReportStore';

export function useDirectorAnalysis() {
  const status = useDirectorReportStore((state) => state.analysisStatus);
  const progress = useDirectorReportStore((state) => state.analysisProgress);
  const error = useDirectorReportStore((state) => state.lastError);
  const analyze = useCallback((request: ActiveDirectorProjectRequest) => analyzeActiveDirectorProject(request), []);
  return { analyze, cancel: cancelActiveDirectorAnalysis, status, progress, error };
}
