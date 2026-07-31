import { useMemo } from 'react';
import { Activity, CheckCircle2, Loader2, RotateCcw, XCircle } from 'lucide-react';
import { applicationContainer, dependencyTokens } from '@/core/di';
import { classNames } from '@/lib/utils';
import { useAIPipelineStore, type AIPipelineRunView } from '@/store/aiPipelineStore';

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1_000));
  if (totalSeconds < 60) return `${totalSeconds} sn`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes} dk ${seconds} sn`;
}

function statusLabel(run: AIPipelineRunView): string {
  if (run.status === 'completed') return 'Tamamlandı';
  if (run.status === 'failed') return 'Başarısız';
  if (run.status === 'cancelled') return 'İptal edildi';
  if (run.retryCount > 0) return `Yeniden deneniyor (${run.attempt}/${run.maxAttempts})`;
  return 'Çalışıyor';
}

function HistoryIcon({ status }: { status: AIPipelineRunView['status'] }) {
  if (status === 'completed') return <CheckCircle2 size={14} className="text-emerald-500" />;
  if (status === 'running') return <Loader2 size={14} className="animate-spin text-blue-500" />;
  return <XCircle size={14} className={status === 'failed' ? 'text-red-500' : 'text-slate-400'} />;
}

export function AIPipelineMonitor() {
  const activeRunMap = useAIPipelineStore((state) => state.activeRuns);
  const fullHistory = useAIPipelineStore((state) => state.history);
  const clearHistory = useAIPipelineStore((state) => state.clearHistory);
  const activeRuns = useMemo(() => Object.values(activeRunMap), [activeRunMap]);
  const history = useMemo(() => fullHistory.slice(0, 3), [fullHistory]);

  if (activeRuns.length === 0 && history.length === 0) return null;

  const cancelRun = (runId: string) => {
    applicationContainer.resolve(dependencyTokens.aiPipelineRunner).cancel(runId);
  };

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-violet-600" />
          <div>
            <p className="text-sm font-semibold text-slate-900">AI işlem merkezi</p>
            <p className="text-xs text-slate-500">Canlı ilerleme, yeniden deneme ve işlem geçmişi</p>
          </div>
        </div>
        {history.length > 0 && activeRuns.length === 0 && (
          <button
            type="button"
            onClick={clearHistory}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
          >
            <RotateCcw size={12} /> Geçmişi temizle
          </button>
        )}
      </div>

      {activeRuns.length > 0 && (
        <div className="space-y-3 p-4">
          {activeRuns.map((run) => (
            <div key={run.runId} className="rounded-lg border border-violet-100 bg-violet-50/50 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Loader2 size={14} className="shrink-0 animate-spin text-violet-600" />
                    <p className="truncate text-sm font-semibold text-slate-900">{run.title}</p>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-600">
                    {run.currentStepTitle ?? 'İşlem hazırlanıyor'} · {statusLabel(run)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs font-medium text-slate-500">{formatDuration(run.elapsedMs)}</span>
                  <button
                    type="button"
                    onClick={() => cancelRun(run.runId)}
                    className="rounded-md border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    İptal
                  </button>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-violet-100">
                  <div
                    className="h-full rounded-full bg-violet-500 transition-all duration-300"
                    style={{ width: `${Math.max(3, run.progress)}%` }}
                  />
                </div>
                <span className="w-10 text-right text-xs font-semibold text-violet-700">%{run.progress}</span>
              </div>

              {run.retryCount > 0 && (
                <p className="mt-2 text-xs text-amber-700">
                  Geçici servis sorunu algılandı. {run.retryCount} yeniden deneme yapıldı.
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {history.length > 0 && (
        <div className={classNames('divide-y divide-slate-100', activeRuns.length > 0 && 'border-t border-slate-100')}>
          {history.map((run) => (
            <div key={run.runId} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <HistoryIcon status={run.status} />
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-slate-700">{run.title}</p>
                  {run.errorMessage && <p className="truncate text-[11px] text-red-500">{run.errorMessage}</p>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-[11px] text-slate-400">
                <span>{statusLabel(run)}</span>
                <span>·</span>
                <span>{formatDuration(run.elapsedMs)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
