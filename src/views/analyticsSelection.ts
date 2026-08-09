import { bindingId, latestSnapshotsByPublication, type AnalyticsSnapshot, type PerformanceInsight } from '@/core/analytics';

export const insightsForSelectedPublication = (insights: readonly PerformanceInsight[], snapshot: AnalyticsSnapshot) => insights.filter((item) => item.bindingId === bindingId(snapshot));
export const snapshotForSelection = (snapshots: readonly AnalyticsSnapshot[], selected: string | null) => {
  const candidates = selected === null ? snapshots : snapshots.filter((snapshot) => bindingId(snapshot) === selected);
  return latestSnapshotsByPublication(candidates).sort((a, b) => Date.parse(b.collectedAt) - Date.parse(a.collectedAt) || b.id.localeCompare(a.id)).at(0) ?? null;
};
