import { BrainCircuit, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { useDirectorAnalysis } from '@/hooks/useDirectorAnalysis';
import type { ViewKey } from '@/components/Sidebar';
import type { ActiveDirectorProjectRequest } from '@/services/directorAnalysisController';

export function DirectorAnalysisAction({ navigate, captureRequest }: { navigate: (view: ViewKey) => void; captureRequest: () => ActiveDirectorProjectRequest }) {
  const { analyze, status, error } = useDirectorAnalysis();
  const run = async () => { try { const outcome = await analyze(captureRequest()); if (outcome.status === 'accepted') navigate('director'); } catch { /* Store/event exposes the user-facing error. */ } };
  return <div className="space-y-2"><Button variant="secondary" onClick={() => void run()}>
    {status === 'running' ? <Loader2 size={16} className="animate-spin" /> : <BrainCircuit size={16} />} AI Director Analizi
  </Button>{error && <p className="text-xs text-rose-600">{error}</p>}</div>;
}
