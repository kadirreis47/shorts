import { useCallback, useEffect, useState } from 'react';
import {
  TrendingUp, Eye, Heart, Users, Video as VideoIcon, Clock, Zap, ArrowUpRight,
  CheckCircle2, Sparkles, Calendar, AlertCircle, RefreshCw,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Video, ActivityLog, ScheduleItem } from '@/lib/types';
import { formatNumber, timeAgo, timeUntil, classNames } from '@/lib/utils';
import { StatusBadge, Card, Button, EmptyState } from '@/components/ui';
import { statusConfig } from '@/lib/status';
import { useI18n } from '@/lib/i18n';
import { withTimeout } from '@/lib/async';
import type { CanonicalChannelIdentity } from '@/services/canonicalChannelCatalog';
import { resolveVideoCanonicalChannelId } from '@/services/videoChannelAttribution';

interface DashboardProps {
  channels: CanonicalChannelIdentity[];
}

export function Dashboard({ channels }: DashboardProps) {
  const { t } = useI18n();
  const [videos, setVideos] = useState<Video[]>([]);
  const [activity, setActivity] = useState<ActivityLog[]>([]);
  const [queue, setQueue] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const results = await withTimeout(
        Promise.all([
          supabase.from('videos').select('*').order('created_at', { ascending: false }),
          supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(8),
          supabase.from('schedule_queue').select('*, video:videos(*)').order('scheduled_at', { ascending: true }).limit(5),
        ]),
        12_000,
        'Dashboard verileri zamanında alınamadı.',
      );

      const [videoResult, activityResult, queueResult] = results;
      const firstError = videoResult.error ?? activityResult.error ?? queueResult.error;
      if (firstError) throw new Error(firstError.message);

      setVideos(videoResult.data ?? []);
      setActivity(activityResult.data ?? []);
      setQueue(queueResult.data ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Dashboard verileri yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const published = videos.filter((v) => v.status === 'published');
  const totalViews = published.reduce((s, v) => s + v.views, 0);
  const totalLikes = published.reduce((s, v) => s + v.likes, 0);
  const totalSubs = channels.reduce((s, c) => s + c.subscriber_count, 0);
  const scheduledCount = videos.filter((v) => v.status === 'scheduled').length;
  const renderingCount = videos.filter((v) => v.status === 'rendering').length;

  const channelMap = new Map(channels.map((c) => [c.id, c]));

  // 7-day views trend
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d;
  });
  const trendData = last7.map((d) => {
    const dayVideos = published.filter((v) => v.published_at && new Date(v.published_at).toDateString() === d.toDateString());
    return { date: d, views: dayVideos.reduce((s, v) => s + v.views, 0) };
  });
  const maxTrend = Math.max(...trendData.map((t) => t.views), 1);

  const kpis = [
    { label: t('dashboard.totalViews'), value: formatNumber(totalViews), icon: Eye, color: 'text-blue-600', bg: 'bg-blue-50', change: '+12.4%' },
    { label: t('dashboard.totalLikes'), value: formatNumber(totalLikes), icon: Heart, color: 'text-rose-600', bg: 'bg-rose-50', change: '+8.1%' },
    { label: t('dashboard.subscribers'), value: formatNumber(totalSubs), icon: Users, color: 'text-emerald-600', bg: 'bg-emerald-50', change: '+5.2%' },
    { label: t('dashboard.videosPublished'), value: String(published.length), icon: VideoIcon, color: 'text-violet-600', bg: 'bg-violet-50', change: '+3' },
  ];

  if (loading) {
    return <div className="flex h-full items-center justify-center text-slate-400">{t('common.loading')}</div>;
  }

  if (error) {
    return (
      <Card>
        <EmptyState
          icon={<AlertCircle size={24} />}
          title="Dashboard yüklenemedi"
          description={error}
          action={(
            <Button variant="secondary" onClick={() => void loadDashboard()}>
              <RefreshCw size={16} /> Tekrar dene
            </Button>
          )}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('dashboard.title')}</h1>
        <p className="text-sm text-slate-500">{t('dashboard.subtitle')}</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-500">{kpi.label}</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{kpi.value}</p>
              </div>
              <div className={classNames('flex h-10 w-10 items-center justify-center rounded-xl', kpi.bg)}>
                <kpi.icon className={classNames('h-5 w-5', kpi.color)} />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-1 text-xs font-medium text-emerald-600">
              <ArrowUpRight size={14} />
              {kpi.change} {t('dashboard.vsLastWeek')}
            </div>
          </Card>
        ))}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
            <Sparkles size={18} />
          </div>
          <div>
            <p className="text-lg font-bold text-slate-900">{renderingCount}</p>
            <p className="text-xs text-slate-500">{t('dashboard.renderingNow')}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
            <Calendar size={18} />
          </div>
          <div>
            <p className="text-lg font-bold text-slate-900">{scheduledCount}</p>
            <p className="text-xs text-slate-500">{t('dashboard.scheduled')}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <CheckCircle2 size={18} />
          </div>
          <div>
            <p className="text-lg font-bold text-slate-900">{channels.filter((c) => c.status === 'active').length}</p>
            <p className="text-xs text-slate-500">{t('dashboard.activeChannels')}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <Zap size={18} />
          </div>
          <div>
            <p className="text-lg font-bold text-slate-900">{channels.reduce((s, c) => s + c.video_count, 0)}</p>
            <p className="text-xs text-slate-500">{t('dashboard.totalVideos')}</p>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Views Trend Chart */}
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-900">{t('dashboard.viewsTrend')}</h3>
              <p className="text-xs text-slate-500">{t('dashboard.last7days')}</p>
            </div>
            <div className="flex items-center gap-1 text-sm font-medium text-emerald-600">
              <TrendingUp size={16} />
              +12.4%
            </div>
          </div>
          <div className="flex h-48 items-end justify-between gap-2">
            {trendData.map((d, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="w-full rounded-t-md bg-gradient-to-t from-emerald-400 to-emerald-500 transition-all"
                    style={{ height: `${Math.max((d.views / maxTrend) * 100, 4)}%` }}
                  />
                </div>
                <span className="text-[11px] text-slate-400">
                  {d.date.toLocaleDateString(undefined, { weekday: 'short' })}
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* Upcoming Queue */}
        <Card className="p-5">
          <h3 className="mb-4 font-semibold text-slate-900">{t('dashboard.upcomingQueue')}</h3>
          <div className="space-y-3">
            {queue.length === 0 && <p className="text-sm text-slate-400">{t('dashboard.noScheduled')}</p>}
            {queue.map((q) => {
              const video = (q as { video?: Video }).video;
              const ch = video ? channelMap.get(resolveVideoCanonicalChannelId(video) ?? '') : undefined;
              return (
                <div key={q.id} className="flex items-start gap-3 rounded-lg border border-slate-100 p-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                    <Clock size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{video?.title ?? t('dashboard.unknown')}</p>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                      <span>{ch?.name}</span>
                      <span>·</span>
                      <span>{timeUntil(q.scheduled_at)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Recent Activity + Top Videos */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-4 font-semibold text-slate-900">{t('dashboard.recentActivity')}</h3>
          <div className="space-y-3">
            {activity.map((a) => {
              const ch = a.channel_id ? channelMap.get(a.channel_id) : undefined;
              return (
                <div key={a.id} className="flex items-start gap-3">
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                    style={{ backgroundColor: ch?.avatar_color ?? '#94a3b8' }}
                  >
                    {ch?.name?.charAt(0) ?? '?'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-700">{a.message}</p>
                    <p className="text-xs text-slate-400">{timeAgo(a.created_at)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="mb-4 font-semibold text-slate-900">{t('dashboard.topVideos')}</h3>
          <div className="space-y-3">
            {published
              .sort((a, b) => b.views - a.views)
              .slice(0, 5)
              .map((v) => {
                const ch = channelMap.get(resolveVideoCanonicalChannelId(v) ?? '');
                return (
                  <div key={v.id} className="flex items-center gap-3">
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                      style={{ backgroundColor: ch?.avatar_color ?? '#94a3b8' }}
                    >
                      {ch?.name?.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">{v.title}</p>
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span className="flex items-center gap-1"><Eye size={12} />{formatNumber(v.views)}</span>
                        <span className="flex items-center gap-1"><Heart size={12} />{formatNumber(v.likes)}</span>
                      </div>
                    </div>
                    <StatusBadge status={v.status} />
                  </div>
                );
              })}
          </div>
        </Card>
      </div>
    </div>
  );
}
