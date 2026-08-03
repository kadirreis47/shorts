import { BrainCircuit, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { useDirectorAnalysis } from '@/hooks/useDirectorAnalysis';
import type { ViewKey } from '@/components/Sidebar';
import type { ActiveDirectorProjectRequest } from '@/services/directorAnalysisController';

export function DirectorAnalysisAction({ navigate, request }: { navigate: (view: ViewKey) => void; request: ActiveDirectorProjectRequest }) {
  const { analyze, status, error } = useDirectorAnalysis();
  const run = async () => { try { await analyze(request); navigate('director'); } catch { /* Store/event exposes the user-facing error. */ } };
  return <div className="space-y-2"><Button variant="secondary" onClick={() => void run()} disabled={status === 'running'}>
    {status === 'running' ? <Loader2 size={16} className="animate-spin" /> : <BrainCircuit size={16} />} AI Director Analizi
  </Button>{error && <p className="text-xs text-rose-600">{error}</p>}</div>;
}
