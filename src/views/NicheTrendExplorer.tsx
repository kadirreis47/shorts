import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { exploreNicheTrend } from '@/lib/api';
import type { NicheTrend } from '@/lib/types';
import { Compass, Loader2, Sparkles, TrendingUp, Target, Users } from 'lucide-react';

export function NicheTrendExplorer() {
  const { t } = useI18n();
  const [trends, setTrends] = useState<NicheTrend[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [niche, setNiche] = useState('');

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('niche_trends').select('*').order('created_at', { ascending: false });
    setTrends(data ?? []);
    setLoading(false);
  }
  useState(() => { load(); });

  async function handleExplore() {
    if (!niche.trim()) return;
    setGenerating(true);
    try {
      const result = await exploreNicheTrend({ niche });
      await supabase.from('niche_trends').insert(result);
      load();
    } catch { /* ignore */ }
    setGenerating(false);
  }

  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><Compass size={24} /> Niche Trend Explorer</h1>
        <p className="mt-1 text-sm text-slate-500">Deep niche trend analysis with opportunity scoring and recommended actions</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex gap-3">
          <input value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="Enter a niche (e.g. fitness, tech, cooking)" className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
          <button onClick={handleExplore} disabled={generating || !niche.trim()} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
            {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Explore
          </button>
        </div>
      </div>

      {trends.map((tr) => (
        <div key={tr.id} className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 capitalize">{tr.niche}</h3>
              <p className="text-xs text-slate-400 capitalize">Phase: {tr.trend_phase}</p>
            </div>
            <div className="flex gap-4">
              <div className="text-center">
                <p className="text-xs text-slate-500">Growth</p>
                <p className="text-lg font-bold text-emerald-600">+{tr.growth_rate}%</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-slate-500">Opportunity</p>
                <p className="text-lg font-bold text-blue-600">{tr.opportunity_score}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-slate-500">Competition</p>
                <p className="text-lg font-bold text-amber-600">{tr.competition_score}</p>
              </div>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="mb-2 flex items-center gap-1 text-sm font-medium text-slate-700"><TrendingUp size={14} /> Related Topics</p>
              <div className="space-y-1.5">
                {(tr.related_topics as Array<Record<string, unknown>>).map((topic, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                    <span className="text-sm text-slate-600">{String(topic.topic)}</span>
                    <span className="text-xs text-emerald-600">{String(topic.growth)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 flex items-center gap-1 text-sm font-medium text-slate-700"><Target size={14} /> Recommended Actions</p>
              <div className="space-y-1.5">
                {(tr.recommended_actions as Array<Record<string, unknown>>).map((action, i) => (
                  <div key={i} className="rounded-lg bg-emerald-50 px-3 py-2">
                    <p className="text-sm text-emerald-700">{String(action.action)}</p>
                    <p className="text-xs text-slate-500 capitalize">{String(action.priority)} · {String(action.expected_impact)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ))}

      {trends.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 py-16 text-center">
          <Compass size={32} className="mx-auto text-slate-300" />
          <p className="mt-2 text-sm text-slate-400">Explore a niche to see trend data</p>
        </div>
      )}
    </div>
  );
}
