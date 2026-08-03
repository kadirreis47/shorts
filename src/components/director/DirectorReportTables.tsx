import { Card } from '@/components/ui';
import type { DirectorReport } from '@/core/director';
export function DirectorReportTables({ report }: { report: DirectorReport }) {
  return <div className="grid gap-5 xl:grid-cols-2">
    <Card className="overflow-hidden"><h2 className="p-4 font-semibold">Scene Ranking</h2><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-slate-500"><tr><th className="p-3">#</th><th>Scene</th><th>Tier</th><th>Score</th></tr></thead><tbody>{report.sceneRanking.scenes.map((rank) => <tr key={rank.sceneId} className="border-t"><td className="p-3">{rank.absoluteRank}</td><td>{rank.sceneId}</td><td>{rank.rankTier}</td><td>{report.sceneScores.find((item) => item.sceneId === rank.sceneId)?.overall}</td></tr>)}</tbody></table></div></Card>
    <Card className="p-4"><h2 className="mb-3 font-semibold">Edit Decision Plan</h2><div className="space-y-2">{report.editDecisionPlan.decisions.length ? report.editDecisionPlan.decisions.map((item) => <div key={item.id} className="rounded-lg border p-3"><div className="flex justify-between gap-3"><span className="font-medium">{item.action}</span><span className="text-xs uppercase text-slate-400">{item.priority}</span></div><p className="mt-1 text-xs text-slate-500">{item.sceneId ?? 'Global'} · {item.reason}</p></div>) : <p className="text-sm text-slate-400">Kurgu kararı gerekmiyor.</p>}</div></Card>
  </div>;
}
