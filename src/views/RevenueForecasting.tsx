import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { generateRevenueForecast } from '@/lib/api';
import type { Channel, RevenueForecast } from '@/lib/types';
import { DollarSign, Loader2, TrendingUp, BarChart3, Sparkles } from 'lucide-react';

export function RevenueForecasting({ channels }: { channels: Channel[] }) {
  const { t } = useI18n();
  const [forecasts, setForecasts] = useState<RevenueForecast[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [channelId, setChannelId] = useState('');
  const [niche, setNiche] = useState('');

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('revenue_forecasts').select('*').order('created_at', { ascending: false });
    setForecasts(data ?? []);
    setLoading(false);
  }
  useState(() => { load(); });

  async function handleGenerate() {
    setGenerating(true);
    try {
      const result = await generateRevenueForecast({ channelId: channelId || undefined, niche: niche || undefined });
      await supabase.from('revenue_forecasts').insert(result);
      load();
    } catch { /* ignore */ }
    setGenerating(false);
  }

  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><DollarSign size={24} /> Revenue Forecasting</h1>
        <p className="mt-1 text-sm text-slate-500">Predict future earnings based on niche, growth rate, and historical RPM data</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-3 gap-3">
          <select value={channelId} onChange={(e) => setChannelId(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option value="">All channels</option>
            {channels.map((ch) => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
          </select>
          <input value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="Niche (e.g. tech, finance)" className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
          <button onClick={handleGenerate} disabled={generating} className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
            {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Generate Forecast
          </button>
        </div>
      </div>

      {forecasts.map((f) => (
        <div key={f.id} className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">30-Day Revenue Projection</h3>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">{f.confidence_score}% confidence</span>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-xs text-slate-500">Current RPM</p>
              <p className="mt-1 text-xl font-bold text-slate-900">${f.current_rpm.toFixed(2)}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-xs text-slate-500">Projected RPM</p>
              <p className="mt-1 text-xl font-bold text-emerald-600">${f.projected_rpm.toFixed(2)}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-xs text-slate-500">Monthly Views</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{(f.projected_monthly_views / 1000).toFixed(0)}K</p>
            </div>
            <div className="rounded-lg bg-emerald-50 p-4">
              <p className="text-xs text-emerald-600">Projected Revenue</p>
              <p className="mt-1 text-xl font-bold text-emerald-700">${f.projected_revenue.toFixed(2)}</p>
            </div>
          </div>
          <div className="mt-4">
            <p className="mb-2 text-sm font-medium text-slate-700">Revenue Breakdown</p>
            <div className="space-y-1.5">
              {(f.revenue_breakdown as Array<Record<string, unknown>>).map((item, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <span className="text-sm text-slate-600">{String(item.source)}</span>
                  <span className="text-sm font-medium text-slate-900">${Number(item.amount).toFixed(2)} ({String(item.percentage)}%)</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4">
            <p className="mb-2 text-sm font-medium text-slate-700">Growth Factors</p>
            <div className="flex flex-wrap gap-2">
              {(f.growth_factors as Array<Record<string, unknown>>).map((factor, i) => (
                <span key={i} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600">
                  {String(factor.factor)} <span className="font-medium text-emerald-600">{String(factor.impact)}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      ))}

      {forecasts.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 py-16 text-center">
          <DollarSign size={32} className="mx-auto text-slate-300" />
          <p className="mt-2 text-sm text-slate-400">Generate your first revenue forecast</p>
        </div>
      )}
    </div>
  );
}
