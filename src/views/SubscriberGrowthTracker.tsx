import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { trackSubscriberGrowth } from '@/lib/api';
import type { Channel, SubscriberGrowth } from '@/lib/types';
import { TrendingUp, Loader2, Sparkles, Users, Target, Calendar } from 'lucide-react';

export function SubscriberGrowthTracker({ channels }: { channels: Channel[] }) {
  const { t } = useI18n();
  const [growth, setGrowth] = useState<SubscriberGrowth[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [channelId, setChannelId] = useState('');
  const [niche, setNiche] = useState('');

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('subscriber_growth').select('*').order('created_at', { ascending: false });
    setGrowth(data ?? []);
    setLoading(false);
  }
  useState(() => { load(); });

  async function handleTrack() {
    setGenerating(true);
    try {
      const result = await trackSubscriberGrowth({ channelId: channelId || undefined, niche: niche || undefined });
      await supabase.from('subscriber_growth').insert(result);
      load();
    } catch { /* ignore */ }
    setGenerating(false);
  }

  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><TrendingUp size={24} /> Subscriber Growth Tracker</h1>
        <p className="mt-1 text-sm text-slate-500">Track subscriber growth with predictive analytics and milestone projections</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-3 gap-3">
          <select value={channelId} onChange={(e) => setChannelId(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option value="">All channels</option>
            {channels.map((ch) => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
          </select>
          <input value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="Niche (optional)" className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
          <button onClick={handleTrack} disabled={generating} className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
            {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Track Growth
          </button>
        </div>
      </div>

      {growth.map((g) => (
        <div key={g.id} className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">Growth Snapshot — {g.snapshot_date}</h3>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${g.net_growth > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
              {g.net_growth > 0 ? '+' : ''}{g.net_growth} subscribers/day
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-xs text-slate-500">Current Subscribers</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{g.subscriber_count.toLocaleString()}</p>
            </div>
            <div className="rounded-lg bg-emerald-50 p-4">
              <p className="text-xs text-emerald-600">New (Today)</p>
              <p className="mt-1 text-xl font-bold text-emerald-700">+{g.new_subscribers}</p>
            </div>
            <div className="rounded-lg bg-blue-50 p-4">
              <p className="text-xs text-blue-600">30-Day Projection</p>
              <p className="mt-1 text-xl font-bold text-blue-700">{g.projected_30d.toLocaleString()}</p>
            </div>
            <div className="rounded-lg bg-amber-50 p-4">
              <p className="text-xs text-amber-600">90-Day Projection</p>
              <p className="mt-1 text-xl font-bold text-amber-700">{g.projected_90d.toLocaleString()}</p>
            </div>
          </div>
          {g.milestone_target && (
            <div className="mt-4 flex items-center gap-3 rounded-lg bg-slate-50 p-3">
              <Target size={18} className="text-slate-400" />
              <div>
                <p className="text-sm text-slate-600">Next milestone: <span className="font-medium text-slate-900">{g.milestone_target.toLocaleString()} subscribers</span></p>
                {g.milestone_eta && <p className="text-xs text-slate-400">Estimated: {g.milestone_eta}</p>}
              </div>
            </div>
          )}
          <div className="mt-4">
            <p className="mb-2 text-sm font-medium text-slate-700">Growth Factors</p>
            <div className="flex flex-wrap gap-2">
              {(g.growth_factors as Array<Record<string, unknown>>).map((factor, i) => (
                <span key={i} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600">
                  {String(factor.factor)} <span className="font-medium text-emerald-600">{String(factor.impact)}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      ))}

      {growth.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 py-16 text-center">
          <TrendingUp size={32} className="mx-auto text-slate-300" />
          <p className="mt-2 text-sm text-slate-400">Track your first growth snapshot</p>
        </div>
      )}
    </div>
  );
}
