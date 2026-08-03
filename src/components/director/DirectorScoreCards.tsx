import { Card } from '@/components/ui';
import type { DirectorReport } from '@/core/director';
export function DirectorScoreCards({ report }: { report: DirectorReport }) {
  const scores = [['Overall', report.overallScore], ['Hook', report.hookScore], ['Retention', report.retentionScore],
    ['Pacing', report.pacingScore], ['Emotion', report.dimensionScores.emotion], ['Clarity', report.dimensionScores.clarity],
    ['Visual', report.visualScore], ['Continuity', report.dimensionScores.continuity]] as const;
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{scores.map(([label, score]) => <Card key={label} className="p-4">
    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-3xl font-bold text-slate-900">{Math.round(score)}</p>
  </Card>)}</div>;
}
