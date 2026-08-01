import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Database,
  Download,
  FileJson,
  Gauge,
  RefreshCw,
  RotateCcw,
  ServerCog,
  ShieldAlert,
  Sparkles,
  TimerReset,
  TrendingUp,
  XCircle,
  Zap,
} from 'lucide-react';
import { Card } from '@/components/ui';
import { applicationContainer, dependencyTokens } from '@/core/di';
import { classNames } from '@/lib/utils';
import {
  useRenderAnalyticsStore,
  type RenderHealthStatus,
  type RenderAnalyticsExport,
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
  const baseline = useRenderAnalyticsStore((state) => state.baseline);
  const thresholds = useRenderAnalyticsStore((state) => state.thresholds);
  const updateThresholds = useRenderAnalyticsStore(
    (state) => state.updateThresholds,
  );
  const resetThresholds = useRenderAnalyticsStore(
    (state) => state.resetThresholds,
  );
  const tuningReport = useRenderAnalyticsStore(
    (state) => state.tuningReport,
  );
  const applyTuningRecommendation = useRenderAnalyticsStore(
    (state) => state.applyTuningRecommendation,
  );
  const refreshTuningReport = useRenderAnalyticsStore(
    (state) => state.refreshTuningReport,
  );
  const capacityPlan = useRenderAnalyticsStore(
    (state) => state.capacityPlan,
  );
  const capacityInputs = useRenderAnalyticsStore(
    (state) => state.capacityInputs,
  );
  const updateCapacityInputs = useRenderAnalyticsStore(
    (state) => state.updateCapacityInputs,
  );
  const refreshCapacityPlan = useRenderAnalyticsStore(
    (state) => state.refreshCapacityPlan,
  );
  const runtimeConcurrency = useRenderAnalyticsStore(
    (state) => state.runtimeConcurrency,
  );
  const updateRuntimeConcurrency = useRenderAnalyticsStore(
    (state) => state.updateRuntimeConcurrency,
  );
  const exportSnapshot = useRenderAnalyticsStore(
    (state) => state.exportSnapshot,
  );

  const latestHistory = history.slice(-24);
  const maxRenderMs = Math.max(
    1,
    ...latestHistory.map((point) => point.averageRenderMs),
  );
  const maxQueueMs = Math.max(
    1,
    ...latestHistory.map((point) => point.averageQueueWaitMs),
  );

  const applyRecommendedConcurrency = () => {
    const renderEngine = applicationContainer.resolve(
      dependencyTokens.renderEngine,
    );
    const applied = renderEngine.setConcurrency(
      capacityPlan.recommendedConcurrency,
    );
    updateRuntimeConcurrency(applied);
    updateCapacityInputs({ concurrency: applied });
  };

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
            onClick={() => exportAnalyticsJson(exportSnapshot())}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            <FileJson size={15} />
            JSON
          </button>
          <button
            type="button"
            onClick={() => exportAnalyticsCsv(exportSnapshot())}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            <Download size={15} />
            CSV
          </button>
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

      <Card className="p-5">
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600">
              <TrendingUp size={18} />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900">
                Render Capacity Planner
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Günlük üretim hedefi ve cihaz kapasitesi simülasyonu · Güven %{capacityPlan.confidence}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={refreshCapacityPlan}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw size={14} />
            Hesapla
          </button>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <div className="grid grid-cols-2 gap-3">
            <ThresholdField
              label="Concurrency"
              value={capacityInputs.concurrency}
              onChange={(value) =>
                updateCapacityInputs({
                  concurrency: Math.max(1, Math.min(8, value)),
                })
              }
            />
            <ThresholdField
              label="Günlük iş"
              value={capacityInputs.jobsPerDay}
              onChange={(value) =>
                updateCapacityInputs({
                  jobsPerDay: Math.max(1, value),
                })
              }
            />
            <ThresholdField
              label="Video süresi (sn)"
              value={capacityInputs.averageVideoDurationSeconds}
              onChange={(value) =>
                updateCapacityInputs({
                  averageVideoDurationSeconds: Math.max(5, value),
                })
              }
            />
            <ThresholdField
              label="Hedef süre (saat)"
              value={capacityInputs.targetCompletionHours}
              onChange={(value) =>
                updateCapacityInputs({
                  targetCompletionHours: Math.max(1, value),
                })
              }
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <SummaryTile
              label="İş / saat"
              value={Math.round(
                capacityPlan.current.estimatedJobsPerHour,
              )}
              icon={Zap}
            />
            <SummaryTile
              label="Günlük kapasite"
              value={capacityPlan.current.estimatedDailyCapacity}
              icon={Database}
            />
            <SummaryTile
              label="Tamamlama saati"
              value={Math.round(
                capacityPlan.current.estimatedCompletionHours,
              )}
              icon={Clock3}
            />
            <SummaryTile
              label="Kullanım %"
              value={capacityPlan.current.utilizationPercent}
              icon={Gauge}
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Önerilen kapasite
            </p>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {capacityPlan.recommendedConcurrency} worker
            </p>
            <p className="mt-1 text-xs font-medium text-slate-500">
              Aktif çalışma: {runtimeConcurrency} worker
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              {capacityPlan.recommendation}
            </p>
            <button
              type="button"
              onClick={applyRecommendedConcurrency}
              disabled={
                runtimeConcurrency ===
                capacityPlan.recommendedConcurrency
              }
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <Zap size={13} />
              {runtimeConcurrency ===
              capacityPlan.recommendedConcurrency
                ? 'Öneri aktif'
                : 'Concurrency önerisini uygula'}
            </button>
            <div className="mt-3 flex items-center gap-2">
              <span
                className={classNames(
                  'rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase',
                  capacityPlan.current.queueRisk === 'low'
                    ? 'bg-emerald-100 text-emerald-700'
                    : capacityPlan.current.queueRisk === 'medium'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-rose-100 text-rose-700',
                )}
              >
                {capacityPlan.current.queueRisk} queue risk
              </span>
              <span className="text-[10px] text-slate-400">
                Taban {formatDuration(capacityPlan.baselineRenderMs)}
              </span>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-violet-50 p-2.5 text-violet-600">
              <Sparkles size={18} />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900">
                Render Auto-Tuner
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Metriklere göre ayar ve kapasite önerileri · Güven %{tuningReport.confidence}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={refreshTuningReport}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw size={14} />
            Yeniden analiz et
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {tuningReport.recommendations.map((recommendation) => (
            <div
              key={recommendation.id}
              className="rounded-xl border border-slate-200 bg-slate-50 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {recommendation.title}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    {recommendation.description}
                  </p>
                </div>
                <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  {recommendation.impact}
                </span>
              </div>

              {(recommendation.suggestedThresholds ||
                recommendation.suggestedConcurrency !== undefined) && (
                <button
                  type="button"
                  onClick={() =>
                    applyTuningRecommendation(recommendation.id)
                  }
                  className="mt-3 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  <Zap size={13} />
                  Öneriyi uygula
                </button>
              )}
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-2">
          <div className="mb-4">
            <h2 className="font-semibold text-slate-900">
              Adaptif performans tabanı
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Sistem son render geçmişinden normal çalışma seviyesini öğrenir.
            </p>
          </div>

          {baseline ? (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <SummaryTile
                label="Örnek sayısı"
                value={baseline.sampleCount}
                icon={Database}
              />
              <SummaryTile
                label="Taban render"
                value={Math.round(baseline.averageRenderMs / 1000)}
                icon={Clock3}
              />
              <SummaryTile
                label="Taban kuyruk"
                value={Math.round(baseline.averageQueueWaitMs / 1000)}
                icon={TimerReset}
              />
              <SummaryTile
                label="Taban başarı %"
                value={Math.round(baseline.averageSuccessRate)}
                icon={Gauge}
              />
            </div>
          ) : (
            <EmptyState
              title="Adaptif taban henüz oluşmadı"
              description="En az üç anlamlı metrik örneği sonrasında sistem normal performans aralığını hesaplayacak."
            />
          )}
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">
                Alarm eşikleri
              </h2>
              <p className="text-xs text-slate-500">
                Operasyon sağlık sınırları
              </p>
            </div>
            <button
              type="button"
              onClick={resetThresholds}
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Varsayılan
            </button>
          </div>

          <div className="space-y-3">
            <ThresholdField
              label="Düşük başarı %"
              value={thresholds.degradedSuccessRate}
              onChange={(value) =>
                updateThresholds({ degradedSuccessRate: value })
              }
            />
            <ThresholdField
              label="Kritik başarı %"
              value={thresholds.criticalSuccessRate}
              onChange={(value) =>
                updateThresholds({ criticalSuccessRate: value })
              }
            />
            <ThresholdField
              label="Kuyruk uyarı (sn)"
              value={Math.round(
                thresholds.degradedQueueWaitMs / 1000,
              )}
              onChange={(value) =>
                updateThresholds({
                  degradedQueueWaitMs: value * 1000,
                })
              }
            />
            <ThresholdField
              label="Kritik kuyruk (sn)"
              value={Math.round(
                thresholds.criticalQueueWaitMs / 1000,
              )}
              onChange={(value) =>
                updateThresholds({
                  criticalQueueWaitMs: value * 1000,
                })
              }
            />
          </div>
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

function ThresholdField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-xs font-medium text-slate-600">
        {label}
      </span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(event) =>
          onChange(Math.max(0, Number(event.target.value) || 0))
        }
        className="w-24 rounded-lg border border-slate-200 px-2.5 py-1.5 text-right text-sm text-slate-700 outline-none focus:border-slate-400"
      />
    </label>
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


function exportAnalyticsJson(data: RenderAnalyticsExport): void {
  downloadTextFile(
    `shortsflow-render-analytics-${fileTimestamp()}.json`,
    JSON.stringify(data, null, 2),
    'application/json',
  );
}

function exportAnalyticsCsv(data: RenderAnalyticsExport): void {
  const rows = [
    [
      'capturedAt',
      'totalJobs',
      'successRate',
      'averageRenderMs',
      'averageQueueWaitMs',
      'cacheHits',
      'retryCount',
    ],
    ...data.history.map((point) => [
      point.capturedAt,
      point.totalJobs,
      point.successRate,
      point.averageRenderMs,
      point.averageQueueWaitMs,
      point.cacheHits,
      point.retryCount,
    ]),
  ];

  const csv = rows
    .map((row) =>
      row
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(','),
    )
    .join('\r\n');

  downloadTextFile(
    `shortsflow-render-analytics-${fileTimestamp()}.csv`,
    `\uFEFF${csv}`,
    'text/csv;charset=utf-8',
  );
}

function downloadTextFile(
  fileName: string,
  content: string,
  mimeType: string,
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function fileTimestamp(): string {
  return new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .slice(0, 19);
}
