import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { optimizeTitle } from '@/lib/api';
import type { TitleOptimization } from '@/lib/types';
import { Type, Loader2, Sparkles, TrendingUp, Copy, Check } from 'lucide-react';

export function TitleOptimizer() {
  const { t } = useI18n();
  const [optimizations, setOptimizations] = useState<TitleOptimization[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [originalTitle, setOriginalTitle] = useState('');
  const [niche, setNiche] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('title_optimizations').select('*').order('created_at', { ascending: false });
    setOptimizations(data ?? []);
    setLoading(false);
  }
  useState(() => { load(); });

  async function handleOptimize() {
    if (!originalTitle.trim()) return;
    setGenerating(true);
    try {
      const result = await optimizeTitle({ originalTitle, niche: niche || undefined });
      await supabase.from('title_optimizations').insert(result);
      load();
    } catch { /* ignore */ }
    setGenerating(false);
  }

  function handleCopy(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><Type size={24} /> AI Title Optimizer</h1>
        <p className="mt-1 text-sm text-slate-500">Optimize video titles with CTR prediction and emotional trigger analysis</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-2 gap-3">
          <input value={originalTitle} onChange={(e) => setOriginalTitle(e.target.value)} placeholder="Enter your video title" className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
          <input value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="Niche (optional)" className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
        </div>
        <button onClick={handleOptimize} disabled={generating || !originalTitle.trim()} className="mt-3 flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
          {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Optimize Title
        </button>
      </div>

      {optimizations.map((opt) => (
        <div key={opt.id} className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-4">
            <p className="text-xs text-slate-500">Original</p>
            <p className="text-sm text-slate-600 line-through">{opt.original_title}</p>
          </div>
          <div className="mb-4 rounded-lg bg-emerald-50 p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-emerald-600">Optimized</p>
                <p className="text-lg font-semibold text-emerald-700">{opt.optimized_title}</p>
              </div>
              <button onClick={() => handleCopy(opt.optimized_title || '', opt.id)} className="text-emerald-600 hover:text-emerald-700">
                {copied === opt.id ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
            <div className="mt-3 flex gap-4 text-xs">
              <span className="text-slate-600">CTR: <span className="font-bold text-emerald-700">{opt.ctr_prediction}%</span></span>
              <span className="text-slate-600">SEO: <span className="font-bold text-blue-700">{opt.seo_score}</span></span>
              <span className="text-slate-600">Trigger: <span className="font-medium capitalize text-slate-700">{opt.emotional_trigger}</span></span>
              <span className="text-slate-600">Chars: <span className="font-medium text-slate-700">{opt.character_count}</span></span>
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Alternative Titles</p>
            <div className="space-y-2">
              {(opt.alternative_titles as Array<Record<string, unknown>>).map((alt, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                  <div>
                    <p className="text-sm font-medium text-slate-700">{String(alt.title)}</p>
                    <p className="text-xs text-slate-400 capitalize">Trigger: {String(alt.trigger)} · CTR: {String(alt.ctr_estimate)}% · SEO: {String(alt.seo_score)}</p>
                  </div>
                  <button onClick={() => handleCopy(String(alt.title), `${opt.id}-${i}`)} className="text-slate-400 hover:text-slate-600">
                    {copied === `${opt.id}-${i}` ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}

      {optimizations.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 py-16 text-center">
          <Type size={32} className="mx-auto text-slate-300" />
          <p className="mt-2 text-sm text-slate-400">Enter a title to optimize</p>
        </div>
      )}
    </div>
  );
}
