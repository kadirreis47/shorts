import type { EditPlan, EditPreview } from '@/core/editing';
import { Card } from '@/components/ui';
export function EditPlanSummary({ plan, preview }: { plan: EditPlan; preview: EditPreview }) { const items = [
  ['Operations', plan.summary.operationCount], ['Affected scenes', preview.affectedSceneCount], ['Before', `${preview.originalDurationMs} ms`], ['After', `${preview.proposedDurationMs} ms`], ['Score impact', `+${preview.scoreImpactEstimate}`], ['Reusable segments', preview.reusableSegmentCountEstimate],
]; return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">{items.map(([label, value]) => <Card className="p-4" key={label}><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></Card>)}</div>; }
