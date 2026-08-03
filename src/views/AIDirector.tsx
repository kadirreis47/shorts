import { AlertTriangle, BrainCircuit, Download, Loader2, Play } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { DirectorScoreCards } from '@/components/director/DirectorScoreCards';
import { DirectorReportTables } from '@/components/director/DirectorReportTables';
import { useDirectorAnalysis } from '@/hooks/useDirectorAnalysis';
import { useDirectorReportStore } from '@/store/directorReportStore';

export function AIDirector() {
  const report = useDirectorReportStore((state) => state.currentReport);
  const { analyze, status, progress, error } = useDirectorAnalysis();
  const run = async () => { try { await analyze(); } catch { /* Lifecycle state renders the error. */ } };
  if (status === 'running') return <Card className="mx-auto max-w-xl p-8 text-center"><Loader2 className="mx-auto animate-spin text-emerald-500" /><h1 className="mt-4 font-semibold">AI Director analiz ediyor</h1><div className="mt-4 h-2 overflow-hidden rounded bg-slate-100"><div className="h-full bg-emerald-500" style={{ width: `${progress}%` }} /></div><p className="mt-2 text-sm text-slate-500">%{progress}</p></Card>;
  if (!report) return <Card className="mx-auto max-w-xl p-8 text-center"><BrainCircuit className="mx-auto text-slate-400" size={36} /><h1 className="mt-4 text-xl font-semibold">AI Director</h1><p className="mt-2 text-sm text-slate-500">Aktif Media/Render manifestini deterministic heuristic kurallarla analiz eder. ML/LLM tahmini değildir.</p>{error && <p className="mt-3 text-sm text-rose-600">{error}</p>}<Button className="mt-5" onClick={() => void run()}><Play size={16} /> Analizi Başlat</Button></Card>;
  return <div className="space-y-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">AI Director Report</h1><p className="text-sm text-slate-500">Heuristic, deterministic rapor v{report.reportVersion}; edit plan otomatik uygulanmaz.</p></div><div className="flex gap-2"><Button variant="secondary" onClick={() => void run()}><Play size={16} /> Yeniden Analiz</Button><Button onClick={() => exportReport(report)}><Download size={16} /> JSON</Button></div></div>
    <Card className="p-4 text-sm text-slate-600">{report.executiveSummary}</Card><DirectorScoreCards report={report} />
    <Card className="p-4"><h2 className="font-semibold">Retention Risk Timeline</h2><div className="mt-3 flex h-12 overflow-hidden rounded-lg">{report.retentionRiskMap.map((segment) => <div key={`${segment.startMs}-${segment.endMs}`} title={segment.causes.join(', ')} className={riskColor(segment.riskLevel)} style={{ width: `${Math.max(4, (segment.endMs - segment.startMs) / Math.max(1, report.retentionRiskMap.at(-1)?.endMs ?? 1) * 100)}%` }} />)}</div></Card>
    <div className="grid gap-5 lg:grid-cols-2"><IssueCard title="Critical Issues" items={report.criticalIssues} critical /><IssueCard title="Quick Wins" items={report.quickWins.map((item) => item.title)} /></div>
    <DirectorReportTables report={report} /><Card className="p-4"><h2 className="font-semibold">Analyzer Diagnostics</h2><div className="mt-2 grid gap-2 md:grid-cols-2">{report.analyzerDiagnostics.map((item) => <div key={item.analyzerId} className="rounded border p-2 text-xs"><span className="font-medium">{item.analyzerId}</span> · {item.status}</div>)}</div></Card>
  </div>;
}
function IssueCard({ title, items, critical = false }: { title: string; items: readonly string[]; critical?: boolean }) { return <Card className="p-4"><h2 className="flex items-center gap-2 font-semibold">{critical && <AlertTriangle size={16} className="text-rose-500" />}{title}</h2><ul className="mt-3 space-y-2 text-sm text-slate-600">{items.length ? items.map((item) => <li key={item}>• {item}</li>) : <li className="text-slate-400">Kayıt yok.</li>}</ul></Card>; }
function riskColor(level: string) { return level === 'critical' ? 'bg-rose-500' : level === 'high' ? 'bg-orange-400' : level === 'medium' ? 'bg-amber-300' : 'bg-emerald-400'; }
function exportReport(report: object) { const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'ai-director-report.json'; anchor.click(); URL.revokeObjectURL(url); }
