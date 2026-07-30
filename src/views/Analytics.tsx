import { useEffect, useState } from 'react';
import { TrendingUp, Eye, Heart, MessageCircle, Share2, Clock, Users, Globe } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Video, Channel, AnalyticsSnapshot } from '@/lib/types';
import { formatNumber, classNames } from '@/lib/utils';
import { Card } from '@/components/ui';

interface AnalyticsProps {
  channels: Channel[];
}

export function Analytics({ channels }: AnalyticsProps) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [snapshots, setSnapshots] = useState<AnalyticsSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [channelFilter, setChannelFilter] = useState<string>('all');

  useEffect(() => {
    (async () => {
      const [{ data: vids }, { data: snaps }] = await Promise.all([
        supabase.from('videos').select('*').eq('status', 'published'),
        supabase.from('analytics_snapshots').select('*').order('snapshot_date', { ascending: true }),
      ]);
      setVideos(vids ?? []);
      setSnapshots(snaps ?? []);
      setLoading(false);
    })();
  }, []);

  const channelMap = new Map(channels.map((c) => [c.id, c]));
  const filteredVideos = channelFilter === 'all' ? videos : videos.filter((v) => v.channel_id === channelFilter);

  const totalViews = filteredVideos.reduce((s, v) => s + v.views, 0);
  const totalLikes = filteredVideos.reduce((s, v) => s + v.likes, 0);
  const totalComments = filteredVideos.reduce((s, v) => s + v.comments, 0);
  const totalShares = filteredVideos.reduce((s, v) => s + v.shares, 0);
  const avgRetention = filteredVideos.length > 0 ? filteredVideos.reduce((s, v) => s + v.retention_rate, 0) / filteredVideos.length : 0;
  const totalWatchTime = filteredVideos.reduce((s, v) => s + v.watch_time_seconds, 0);

  // 14-day trend from snapshots
  const last14 = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    return d.toISOString().split('T')[0];
  });
  const trendData = last14.map((dateStr) => {
    const daySnaps = snapshots.filter((s) => s.snapshot_date === dateStr);
    const dayVideos = new Set(daySnaps.map((s) => s.video_id));
    const vids = filteredVideos.filter((v) => dayVideos.has(v.id));
    const relevant = channelFilter === 'all' ? daySnaps : daySnaps.filter((s) => vids.some((v) => v.id === s.video_id));
    return { date: dateStr, views: relevant.reduce((s, sn) => s + sn.views, 0) };
  });
  const maxTrend = Math.max(...trendData.map((t) => t.views), 1);

  // Top videos
  const topVideos = [...filteredVideos].sort((a, b) => b.views - a.views).slice(0, 8);

  // Per-channel breakdown
  const channelStats = channels.map((ch) => {
    const chVideos = videos.filter((v) => v.channel_id === ch.id);
    return {
      channel: ch,
      views: chVideos.reduce((s, v) => s + v.views, 0),
      likes: chVideos.reduce((s, v) => s + v.likes, 0),
      videos: chVideos.length,
    };
  }).sort((a, b) => b.views - a.views);

  const maxChannelViews = Math.max(...channelStats.map((c) => c.views), 1);

  // Traffic sources (simulated)
  const trafficSources = [
    { source: 'Shorts Feed', percentage: 62, color: 'bg-red-500' },
    { source: 'Browse Features', percentage: 18, color: 'bg-blue-500' },
    { source: 'Suggested', percentage: 11, color: 'bg-emerald-500' },
    { source: 'Search', percentage: 6, color: 'bg-amber-500' },
    { source: 'External', percentage: 3, color: 'bg-violet-500' },
  ];

  if (loading) return <div className="py-16 text-center text-slate-400">Loading analytics…</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
          <p className="text-sm text-slate-500">Performance insights across all channels</p>
        </div>
        <select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400">
          <option value="all">All channels</option>
          {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {[
          { label: 'Views', value: formatNumber(totalViews), icon: Eye, color: 'text-blue-600' },
          { label: 'Likes', value: formatNumber(totalLikes), icon: Heart, color: 'text-rose-600' },
          { label: 'Comments', value: formatNumber(totalComments), icon: MessageCircle, color: 'text-amber-600' },
          { label: 'Shares', value: formatNumber(totalShares), icon: Share2, color: 'text-violet-600' },
          { label: 'Avg Retention', value: avgRetention.toFixed(1) + '%', icon: TrendingUp, color: 'text-emerald-600' },
          { label: 'Watch Time', value: Math.floor(totalWatchTime / 3600) + 'h', icon: Clock, color: 'text-slate-600' },
        ].map((kpi) => (
          <Card key={kpi.label} className="p-4">
            <kpi.icon className={classNames('mb-2', kpi.color)} size={18} />
            <p className="text-xl font-bold text-slate-900">{kpi.value}</p>
            <p className="text-xs text-slate-500">{kpi.label}</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Views Trend */}
        <Card className="p-5 lg:col-span-2">
          <h3 className="mb-4 font-semibold text-slate-900">Views Trend (14 days)</h3>
          <div className="flex h-56 items-end justify-between gap-1">
            {trendData.map((t, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex w-full flex-1 items-end">
                  <div className="w-full rounded-t bg-gradient-to-t from-blue-400 to-blue-500 transition-all"
                    style={{ height: `${Math.max((t.views / maxTrend) * 100, 2)}%` }} />
                </div>
                <span className="text-[9px] text-slate-400">{new Date(t.date).getDate()}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Traffic Sources */}
        <Card className="p-5">
          <h3 className="mb-4 font-semibold text-slate-900">Traffic Sources</h3>
          <div className="space-y-3">
            {trafficSources.map((src) => (
              <div key={src.source}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-slate-600">{src.source}</span>
                  <span className="font-medium text-slate-800">{src.percentage}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className={classNames('h-full rounded-full', src.color)} style={{ width: `${src.percentage}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Channel Comparison */}
        <Card className="p-5">
          <h3 className="mb-4 font-semibold text-slate-900">Channel Performance</h3>
          <div className="space-y-3">
            {channelStats.map((cs) => (
              <div key={cs.channel.id} className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold text-white"
                  style={{ backgroundColor: cs.channel.avatar_color }}>
                  {cs.channel.name.charAt(0)}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-700">{cs.channel.name}</span>
                    <span className="text-slate-500">{formatNumber(cs.views)} views</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full" style={{ width: `${(cs.views / maxChannelViews) * 100}%`, backgroundColor: cs.channel.avatar_color }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Top Videos */}
        <Card className="p-5">
          <h3 className="mb-4 font-semibold text-slate-900">Top Videos</h3>
          <div className="space-y-2">
            {topVideos.map((v, i) => {
              const ch = channelMap.get(v.channel_id);
              return (
                <div key={v.id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-slate-50">
                  <span className="w-5 text-center text-sm font-bold text-slate-400">{i + 1}</span>
                  <div className="flex h-7 w-7 items-center justify-center rounded text-[10px] font-bold text-white"
                    style={{ backgroundColor: ch?.avatar_color ?? '#94a3b8' }}>
                    {ch?.name?.charAt(0)}
                  </div>
                  <p className="flex-1 truncate text-sm font-medium text-slate-700">{v.title}</p>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><Eye size={12} />{formatNumber(v.views)}</span>
                    <span className="flex items-center gap-1"><Heart size={12} />{formatNumber(v.likes)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Audience Demographics */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <Users size={18} className="text-slate-500" />
            <h3 className="font-semibold text-slate-900">Age Distribution</h3>
          </div>
          <div className="space-y-3">
            {[
              { range: '13-17', pct: 8 },
              { range: '18-24', pct: 34 },
              { range: '25-34', pct: 29 },
              { range: '35-44', pct: 18 },
              { range: '45-54', pct: 8 },
              { range: '55+', pct: 3 },
            ].map((d) => (
              <div key={d.range}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-slate-600">{d.range}</span>
                  <span className="font-medium text-slate-800">{d.pct}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${d.pct * 3}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <Globe size={18} className="text-slate-500" />
            <h3 className="font-semibold text-slate-900">Top Regions</h3>
          </div>
          <div className="space-y-3">
            {[
              { country: 'United States', pct: 38, flag: 'US' },
              { country: 'United Kingdom', pct: 14, flag: 'UK' },
              { country: 'India', pct: 12, flag: 'IN' },
              { country: 'Canada', pct: 9, flag: 'CA' },
              { country: 'Australia', pct: 7, flag: 'AU' },
              { country: 'Germany', pct: 5, flag: 'DE' },
            ].map((r) => (
              <div key={r.country} className="flex items-center gap-3">
                <span className="w-8 text-center text-xs font-bold text-slate-400">{r.flag}</span>
                <span className="flex-1 text-sm text-slate-600">{r.country}</span>
                <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-blue-500" style={{ width: `${r.pct * 2.5}%` }} />
                </div>
                <span className="w-8 text-right text-sm font-medium text-slate-700">{r.pct}%</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
