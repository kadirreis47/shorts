import { useEffect, useState } from 'react';
import { DollarSign, TrendingUp, Eye, BarChart3, Wallet, ArrowUpRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Video, MonetizationSnapshot } from '@/lib/types';
import { Card } from '@/components/ui';
import { formatNumber, classNames } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import type { CanonicalChannelIdentity } from '@/services/canonicalChannelCatalog';
import { isVideoAttributedToChannel, resolveVideoCanonicalChannelId } from '@/services/videoChannelAttribution';

interface MonetizationProps {
  channels: CanonicalChannelIdentity[];
}

const DEFAULT_RPM = 1.5; // USD per 1000 views (conservative Shorts estimate)

export function Monetization({ channels }: MonetizationProps) {
  const { t } = useI18n();
  const [videos, setVideos] = useState<Video[]>([]);
  const [snapshots, setSnapshots] = useState<MonetizationSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [channelFilter, setChannelFilter] = useState('all');

  useEffect(() => {
    (async () => {
      const [{ data: vids }, { data: snaps }] = await Promise.all([
        supabase.from('videos').select('*').eq('status', 'published'),
        supabase.from('monetization_snapshots').select('*').order('date', { ascending: true }),
      ]);
      setVideos(vids ?? []);
      setSnapshots(snaps ?? []);
      setLoading(false);
    })();
  }, []);

  const channelMap = new Map(channels.map((c) => [c.id, c]));
  const filteredVideos = channelFilter === 'all' ? videos : videos.filter((v) => isVideoAttributedToChannel(v, channelFilter));

  // Calculate estimated revenue (if no snapshots, estimate from views)
  const revenueByVideo = filteredVideos.map((v) => {
    const snap = snapshots.filter((s) => s.video_id === v.id);
    const revenue = snap.length > 0 ? snap.reduce((sum, s) => sum + Number(s.estimated_revenue), 0) : (v.views / 1000) * DEFAULT_RPM;
    const rpm = v.views > 0 ? (revenue / v.views) * 1000 : 0;
    return { video: v, revenue, rpm, views: v.views };
  }).sort((a, b) => b.revenue - a.revenue);

  const totalRevenue = revenueByVideo.reduce((s, r) => s + r.revenue, 0);
  const totalViews = filteredVideos.reduce((s, v) => s + v.views, 0);
  const avgRPM = totalViews > 0 ? (totalRevenue / totalViews) * 1000 : 0;
  const estMonthly = totalRevenue * 1.5; // rough monthly projection

  // Revenue by channel
  const revenueByChannel = channels.map((ch) => {
    const chVideos = videos.filter((v) => isVideoAttributedToChannel(v, ch.id));
    const chRevenue = chVideos.reduce((s, v) => s + (v.views / 1000) * DEFAULT_RPM, 0);
    return { channel: ch, revenue: chRevenue, views: chVideos.reduce((s, v) => s + v.views, 0) };
  }).sort((a, b) => b.revenue - a.revenue);

  const maxChannelRevenue = Math.max(...revenueByChannel.map((c) => c.revenue), 1);

  // 14-day revenue trend (estimated from video creation dates)
  const last14 = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    return d.toISOString().split('T')[0];
  });
  const trendData = last14.map((dateStr) => {
    const dayVideos = filteredVideos.filter((v) => v.created_at?.startsWith(dateStr));
    const dayRevenue = dayVideos.reduce((s, v) => s + (v.views / 1000) * DEFAULT_RPM, 0);
    return { date: dateStr, revenue: dayRevenue };
  });
  const maxTrend = Math.max(...trendData.map((d) => d.revenue), 0.01);

  if (loading) return <div className="py-16 text-center text-slate-400">{t('common.loading')}</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('monetization.title')}</h1>
          <p className="text-sm text-slate-500">{t('monetization.subtitle')}</p>
        </div>
        <select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400">
          <option value="all">{t('videos.allChannels')}</option>
          {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: t('monetization.totalRevenue'), value: `$${totalRevenue.toFixed(2)}`, icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: t('monetization.avgRPM'), value: `$${avgRPM.toFixed(2)}`, icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: t('monetization.estMonthly'), value: `$${estMonthly.toFixed(2)}`, icon: Wallet, color: 'text-violet-600', bg: 'bg-violet-50' },
          { label: t('monetization.monetizedViews'), value: formatNumber(totalViews), icon: Eye, color: 'text-amber-600', bg: 'bg-amber-50' },
        ].map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.label} className="p-4">
              <div className={classNames('mb-2 flex h-8 w-8 items-center justify-center rounded-lg', kpi.bg)}>
                <Icon size={16} className={kpi.color} />
              </div>
              <p className="text-xl font-bold text-slate-900">{kpi.value}</p>
              <p className="text-xs text-slate-500">{kpi.label}</p>
            </Card>
          );
        })}
      </div>

      {totalRevenue === 0 ? (
        <Card className="p-8 text-center">
          <Wallet size={32} className="mx-auto mb-3 text-slate-300" />
          <p className="font-medium text-slate-700">{t('monetization.noRevenue')}</p>
          <p className="mt-1 text-sm text-slate-500">{t('monetization.noRevenueDesc')}</p>
        </Card>
      ) : (
        <>
          {/* Revenue Trend */}
          <Card className="p-5">
            <h3 className="mb-4 font-semibold text-slate-900">{t('monetization.revenueTrend')}</h3>
            <div className="flex h-56 items-end justify-between gap-1">
              {trendData.map((d, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex w-full flex-1 items-end">
                    <div className="w-full rounded-t bg-gradient-to-t from-emerald-400 to-emerald-500 transition-all"
                      style={{ height: `${Math.max((d.revenue / maxTrend) * 100, 2)}%` }} />
                  </div>
                  <span className="text-[9px] text-slate-400">{new Date(d.date).getDate()}</span>
                </div>
              ))}
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Revenue by Channel */}
            <Card className="p-5">
              <h3 className="mb-4 font-semibold text-slate-900">{t('monetization.revenueByChannel')}</h3>
              <div className="space-y-3">
                {revenueByChannel.map((rc) => (
                  <div key={rc.channel.id} className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold text-white"
                      style={{ backgroundColor: rc.channel.avatar_color }}>
                      {rc.channel.name.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-slate-700">{rc.channel.name}</span>
                        <span className="font-medium text-emerald-600">${rc.revenue.toFixed(2)}</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(rc.revenue / maxChannelRevenue) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Revenue by Video */}
            <Card className="p-5">
              <h3 className="mb-4 font-semibold text-slate-900">{t('monetization.revenueByVideo')}</h3>
              <div className="space-y-2">
                {revenueByVideo.slice(0, 10).map((rv, i) => {
                  const ch = channelMap.get(resolveVideoCanonicalChannelId(rv.video) ?? '');
                  return (
                    <div key={rv.video.id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-slate-50">
                      <span className="w-5 text-center text-sm font-bold text-slate-400">{i + 1}</span>
                      <div className="flex h-7 w-7 items-center justify-center rounded text-[10px] font-bold text-white"
                        style={{ backgroundColor: ch?.avatar_color ?? '#94a3b8' }}>
                        {ch?.name?.charAt(0)}
                      </div>
                      <p className="flex-1 truncate text-sm font-medium text-slate-700">{rv.video.title}</p>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-500">{formatNumber(rv.views)}</span>
                        <span className="font-medium text-emerald-600">${rv.revenue.toFixed(2)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
