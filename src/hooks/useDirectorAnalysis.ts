import { useCallback, useRef } from 'react';
import { analyzeActiveDirectorProject } from '@/services/directorAnalysisController';
import type { ActiveDirectorProjectRequest } from '@/services/directorAnalysisController';
import { useDirectorReportStore } from '@/store/directorReportStore';

export function useDirectorAnalysis() {
  const controller = useRef<AbortController | null>(null);
  const status = useDirectorReportStore((state) => state.analysisStatus);
  const progress = useDirectorReportStore((state) => state.analysisProgress);
  const error = useDirectorReportStore((state) => state.lastError);
  const analyze = useCallback(async (request?: ActiveDirectorProjectRequest) => {
    controller.current?.abort(); controller.current = new AbortController();
    try {
      return await analyzeActiveDirectorProject(controller.current.signal, request);
    } catch (cause) {
      useDirectorReportStore.getState().analysisFailed(cause instanceof Error ? cause.message : 'AI Director analizi başlatılamadı.');
      throw cause;
    }
  }, []);
  return { analyze, cancel: () => controller.current?.abort(), status, progress, error };
}
