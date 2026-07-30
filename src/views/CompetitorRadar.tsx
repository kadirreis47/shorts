import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { analyzeCompetitor } from '@/lib/api';
import { Radar, Plus, Loader2, Trash2, TrendingUp, Eye, Target, Search } from 'lucide-react';

interface Competitor {
  id: string;
  name: string;
  handle: string | null;
  subscriber_count: number;
  avg_views: number;
  posting_frequency: string | null;
  niche: string | null;
  notes: string | null;
  top_hook_formulas: string[];
  thumbnail_styles: Array<Record<string, unknown>>;
  topic_clusters: Array<Record<string, unknown>>;
  content_gaps: Array<Record<string, unknown>>;
  last_analyzed: string | null;
  created_at: string;
}

export function CompetitorRadar() {
  const { t } = useI18n();
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newHandle, setNewHandle] = useState('');
  const [newNiche, setNewNiche] = useState('');
  const [selectedComp, setSelectedComp] = useState<Competitor | null>(null);

  async function loadCompetitors() {
    setLoading(true);
    const { data } = await supabase.from('competitor_channels').select('*').order('created_at', { ascending: false });
    setCompetitors(data ?? []);
    setLoading(false);
  }

  useState(() => { loadCompetitors(); });

  async function handleAdd() {
    if (!newName.trim()) return;
    setAdding(false);
    await supabase.from('competitor_channels').insert({
      name: newName, handle: newHandle || null, niche: newNiche || null,
      subscriber_count: 0, avg_views: 0,
    });
    setNewName(''); setNewHandle(''); setNewNiche('');
    loadCompetitors();
  }

  async function handleAnalyze(comp: Competitor) {
    setAnalyzing(comp.id);
    try {
      const result = await analyzeCompetitor({ competitorName: comp.name, niche: comp.niche ?? undefined });
      setSelectedComp({ ...comp, ...result } as Competitor);
      loadCompetitors();
    } catch { /* ignore */ }
    setAnalyzing(null);
  }

  async function handleDelete(id: string) {
    await supabase.from('competitor_channels').delete().eq('id', id);
    loadCompetitors();
  }

  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><Radar size={24} /> {t('competitor.title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('competitor.desc')}</p>
        </div>
        <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
          <Plus size={16} /> {t('competitor.add')}
        </button>
      </div>

      {adding && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="grid grid-cols-3 gap-3">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t('competitor.namePlaceholder')} className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
            <input value={newHandle} onChange={(e) => setNewHandle(e.target.value)} placeholder="@handle" className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
            <input value={newNiche} onChange={(e) => setNewNiche(e.target.value)} placeholder={t('competitor.nichePlaceholder')} className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={handleAdd} className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">{t('common.save')}</button>
            <button onClick={() => setAdding(false)} className="rounded-lg border border-slate-200 px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-50">{t('common.cancel')}</button>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {competitors.map((comp) => (
          <div key={comp.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-slate-900">{comp.name}</h3>
                <p className="text-xs text-slate-400">{comp.handle ?? comp.niche}</p>
              </div>
              <button onClick={() => handleDelete(comp.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={16} /></button>
            </div>
            <div className="mt-3 flex gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1"><TrendingUp size={12} /> {comp.subscriber_count.toLocaleString()} subs</span>
              <span className="flex items-center gap-1"><Eye size={12} /> {comp.avg_views.toLocaleString()} avg views</span>
            </div>
            {comp.top_hook_formulas?.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-medium text-slate-500">{t('competitor.hookFormulas')}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {comp.top_hook_formulas.map((h, i) => (
                    <span key={i} className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700">{h}</span>
                  ))}
                </div>
              </div>
            )}
            {comp.content_gaps?.length > 0 && (
              <div className="mt-3">
                <p className="flex items-center gap-1 text-xs font-medium text-slate-500"><Search size={12} /> {t('competitor.gaps')}</p>
                <div className="mt-1 space-y-1">
                  {comp.content_gaps.slice(0, 3).map((g, i) => (
                    <div key={i} className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">
                      {(g as Record<string, string>).gap ?? JSON.stringify(g).slice(0, 80)}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <button onClick={() => handleAnalyze(comp)} disabled={analyzing === comp.id}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              {analyzing === comp.id ? <><Loader2 size={14} className="animate-spin" /> {t('competitor.analyzing')}</> : <><Target size={14} /> {t('competitor.analyze')}</>}
            </button>
          </div>
        ))}
      </div>

      {competitors.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 py-16 text-center">
          <Radar size={32} className="mx-auto text-slate-300" />
          <p className="mt-2 text-sm text-slate-400">{t('competitor.empty')}</p>
        </div>
      )}
    </div>
  );
}
