import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Database,
  Gauge,
  RefreshCw,
  RotateCcw,
  ServerCog,
  ShieldAlert,
  TimerReset,
  XCircle,
  Zap,
} from 'lucide-react';
import { Card } from '@/components/ui';
import { classNames } from '@/lib/utils';
import {
  useRenderAnalyticsStore,
  type RenderHealthStatus,
  type RenderMetricsPoint,
  type RenderOperationsAlert,
} from '@/store/renderAnalyticsStore';

export function RenderOperationsDashboard() {
  const snapshot = useRenderAnalyticsStore((state) => state.snapshot);
  const history = useRenderAnalyticsStore((state) => state.history);
  const alerts = useRenderAnalyticsStore((state) => state.alerts);
  const health = useRenderAnalyticsStore((state) => state.health);
  const bottleneck = useRenderAnalyticsStore(
    (state) => state.bottleneckStage,
  );
  const clearAlerts = useRenderAnalyticsStore(
    (state) => state.clearAlerts,
  );
  const reset = useRenderAnalyticsStore((state) => state.reset);

  const latestHistory = history.slice(-24);
  const maxRenderMs = Math.max(
    1,
    ...latestHistory.map((point) => point.averageRenderMs),
  );
  const maxQueueMs = Math.max(
    1,
    ...latestHistory.map((point) => point.averageQueueWaitMs),
  );

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ServerCog className="text-slate-700" size={22} />
            <h1 className="text-2xl font-bold text-slate-900">
              Render Operations
            </h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Render kuyruğu, performans, cache ve sistem sağlığı.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <HealthBadge health={health} />
          <button
            type="button"
            onClick={clearAlerts}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            <CheckCircle2 size={15} />
            Uyarıları temizle
          </button>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            <RotateCcw size={15} />
            Metrikleri sıfırla
          </button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard
          icon={Activity}
          label="Toplam işler"
          value={formatNumber(snapshot?.totalJobs ?? 0)}
          detail={`${snapshot?.completedJobs ?? 0} tamamlandı`}
        />
        <MetricCard
          icon={Gauge}
          label="Başarı oranı"
          value={`%${(snapshot?.successRate ?? 0).toFixed(1)}`}
          detail={`${snapshot?.failedJobs ?? 0} hata`}
        />
        <MetricCard
          icon={Clock3}
          label="Ortalama render"
          value={formatDuration(snapshot?.averageRenderMs ?? 0)}
          detail={`Maks. ${formatDuration(snapshot?.maximumRenderMs ?? 0)}`}
        />
        <MetricCard
          icon={TimerReset}
          label="Kuyruk bekleme"
          value={formatDuration(snapshot?.averageQueueWaitMs ?? 0)}
          detail="Ortalama"
        />
        <MetricCard
          icon={Database}
          label="Cache hit"
          value={formatNumber(snapshot?.cacheHits ?? 0)}
          detail={`${snapshot?.retryCount ?? 0} retry`}
        />
        <MetricCard
          icon={Zap}
          label="Ortalama çıktı"
          value={formatBytes(snapshot?.averageOutputBytes ?? 0)}
          detail={formatBytes(snapshot?.totalOutputBytes ?? 0)}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-2">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">
                Performans eğilimi
              </h2>
              <p className="text-xs text-slate-500">
                Son {latestHistory.length} metrik güncellemesi
              </p>
            </div>
            <RefreshCw size={16} className="text-slate-400" />
          </div>

          {latestHistory.length === 0 ? (
            <EmptyState
              title="Henüz render metriği yok"
              description="İlk render işi tamamlandığında performans verileri burada görünecek."
            />
          ) : (
            <div className="space-y-5">
              <TrendBars
                points={latestHistory}
                label="Ortalama render süresi"
                value={(point) => point.averageRenderMs}
                maximum={maxRenderMs}
                formatter={formatDuration}
              />
              <TrendBars
                points={latestHistory}
                label="Ortalama kuyruk bekleme"
                value={(point) => point.averageQueueWaitMs}
                maximum={maxQueueMs}
                formatter={formatDuration}
              />
            </div>
          )}
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle size={18} className="text-amber-500" />
            <h2 className="font-semibold text-slate-900">
              Operasyon uyarıları
            </h2>
          </div>

          {alerts.length === 0 ? (
            <EmptyState
              title="Aktif uyarı yok"
              description="Render sistemi normal sınırlar içinde çalışıyor."
            />
          ) : (
            <div className="space-y-3">
              {alerts.slice(0, 8).map((alert) => (
                <AlertRow key={alert.id} alert={alert} />
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-4 font-semibold text-slate-900">
            Aşama darboğazları
          </h2>

          {!snapshot || snapshot.stageMetrics.length === 0 ? (
            <EmptyState
              title="Aşama verisi bekleniyor"
              description="Render aşamaları çalıştıkça süre dağılımı oluşacak."
            />
          ) : (
            <div className="space-y-3">
              {[...snapshot.stageMetrics]
                .sort(
                  (left, right) =>
                    right.averageDurationMs - left.averageDurationMs,
                )
                .map((stage) => {
                  const maxStage = Math.max(
                    1,
                    ...snapshot.stageMetrics.map(
                      (metric) => metric.averageDurationMs,
                    ),
                  );
                  const percentage = Math.max(
                    2,
                    (stage.averageDurationMs / maxStage) * 100,
                  );

                  return (
                    <div key={stage.stage}>
                      <div className="mb-1.5 flex items-center justify-between text-sm">
                        <span className="font-medium capitalize text-slate-700">
                          {stage.stage}
                        </span>
                        <span className="text-slate-500">
                          {formatDuration(stage.averageDurationMs)}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={classNames(
                            'h-full rounded-full',
                            bottleneck?.stage === stage.stage
                              ? 'bg-amber-500'
                              : 'bg-slate-700',
                          )}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 font-semibold text-slate-900">
            Sistem özeti
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <SummaryTile
              label="Tamamlanan"
              value={snapshot?.completedJobs ?? 0}
              icon={CheckCircle2}
            />
            <SummaryTile
              label="Başarısız"
              value={snapshot?.failedJobs ?? 0}
              icon={XCircle}
            />
            <SummaryTile
              label="İptal edilen"
              value={snapshot?.cancelledJobs ?? 0}
              icon={ShieldAlert}
            />
            <SummaryTile
              label="Retry"
              value={snapshot?.retryCount ?? 0}
              icon={RefreshCw}
            />
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              En yavaş aşama
            </p>
            <div className="mt-2 flex items-center justify-between">
              <span className="font-semibold capitalize text-slate-800">
                {bottleneck?.stage ?? 'Veri yok'}
              </span>
              <span className="text-sm text-slate-500">
                {formatDuration(bottleneck?.averageDurationMs ?? 0)}
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card className="p-4">
      <Icon size={18} className="mb-3 text-slate-500" />
      <p className="text-xl font-bold text-slate-900">{value}</p>
      <p className="text-xs font-medium text-slate-600">{label}</p>
      <p className="mt-1 text-[11px] text-slate-400">{detail}</p>
    </Card>
  );
}

function HealthBadge({ health }: { health: RenderHealthStatus }) {
  const styles: Record<RenderHealthStatus, string> = {
    healthy: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    degraded: 'border-amber-200 bg-amber-50 text-amber-700',
    critical: 'border-rose-200 bg-rose-50 text-rose-700',
    idle: 'border-slate-200 bg-slate-50 text-slate-600',
  };

  const labels: Record<RenderHealthStatus, string> = {
    healthy: 'Sağlıklı',
    degraded: 'Düşük performans',
    critical: 'Kritik',
    idle: 'Boşta',
  };

  return (
    <span
      className={classNames(
        'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold',
        styles[health],
      )}
    >
      <span className="h-2 w-2 rounded-full bg-current" />
      {labels[health]}
    </span>
  );
}

function AlertRow({ alert }: { alert: RenderOperationsAlert }) {
  const styles = {
    info: 'border-blue-100 bg-blue-50 text-blue-700',
    warning: 'border-amber-100 bg-amber-50 text-amber-700',
    critical: 'border-rose-100 bg-rose-50 text-rose-700',
  };

  return (
    <div
      className={classNames(
        'rounded-xl border p-3',
        styles[alert.severity],
      )}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle size={15} className="mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium">{alert.message}</p>
          <p className="mt-1 text-[10px] opacity-70">
            {new Date(alert.createdAt).toLocaleString('tr-TR')}
          </p>
        </div>
      </div>
    </div>
  );
}

function TrendBars({
  points,
  label,
  value,
  maximum,
  formatter,
}: {
  points: RenderMetricsPoint[];
  label: string;
  value: (point: RenderMetricsPoint) => number;
  maximum: number;
  formatter: (value: number) => string;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium text-slate-700">{label}</p>
        <p className="text-xs text-slate-400">
          {formatter(value(points[points.length - 1]))}
        </p>
      </div>
      <div className="flex h-24 items-end gap-1">
        {points.map((point) => {
          const current = value(point);
          const height = Math.max(4, (current / maximum) * 100);
          return (
            <div
              key={`${point.capturedAt}-${point.totalJobs}`}
              title={`${formatter(current)} · ${new Date(
                point.capturedAt,
              ).toLocaleTimeString('tr-TR')}`}
              className="flex-1 rounded-t bg-slate-700 transition hover:bg-slate-900"
              style={{ height: `${height}%` }}
            />
          );
        })}
      </div>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof Activity;
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <Icon size={16} className="mb-2 text-slate-400" />
      <p className="text-lg font-bold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-36 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 px-5 text-center">
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      <p className="mt-1 max-w-sm text-xs leading-5 text-slate-400">
        {description}
      </p>
    </div>
  );
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1_000) return `${Math.round(durationMs)} ms`;
  if (durationMs < 60_000) return `${(durationMs / 1_000).toFixed(1)} sn`;
  return `${(durationMs / 60_000).toFixed(1)} dk`;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`;
  if (bytes < 1_073_741_824) {
    return `${(bytes / 1_048_576).toFixed(1)} MB`;
  }
  return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('tr-TR').format(value);
}
