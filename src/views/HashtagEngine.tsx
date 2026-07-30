import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { generateHashtagStrategy } from '@/lib/api';
import type { Channel, HashtagStrategy } from '@/lib/types';
import { Hash, Loader2, Sparkles, TrendingUp, AlertTriangle, Copy } from 'lucide-react';

export function HashtagEngine({ channels }: { channels: Channel[] }) {
  const { t } = useI18n();
  const [strategies, setStrategies] = useState<HashtagStrategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [niche, setNiche] = useState('');
  const [videoTitle, setVideoTitle] = useState('');

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('hashtag_strategies').select('*').order('created_at', { ascending: false });
    setStrategies(data ?? []);
    setLoading(false);
  }
  useState(() => { load(); });

  async function handleGenerate() {
    setGenerating(true);
    try {
      const result = await generateHashtagStrategy({ niche: niche || undefined, videoTitle: videoTitle || undefined });
      await supabase.from('hashtag_strategies').insert(result);
      load();
    } catch { /* ignore */ }
    setGenerating(false);
  }

  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><Hash size={24} /> Smart Hashtag Engine</h1>
        <p className="mt-1 text-sm text-slate-500">Generate optimized hashtags with trending analysis and competition scoring</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-2 gap-3">
          <input value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="Niche (e.g. fitness, tech)" className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
          <input value={videoTitle} onChange={(e) => setVideoTitle(e.target.value)} placeholder="Video title (optional)" className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
        </div>
        <button onClick={handleGenerate} disabled={generating} className="mt-3 flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
          {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Generate Strategy
        </button>
      </div>

      {strategies.map((s) => (
        <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">{s.niche || 'General'} {s.video_title ? `— ${s.video_title}` : ''}</h3>
            <span className="text-xs text-slate-400">Optimal: {s.optimal_count} tags</span>
          </div>
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">Suggested Hashtags</p>
              <div className="flex flex-wrap gap-1.5">
                {s.suggested_hashtags?.map((tag, i) => (
                  <button key={i} onClick={() => navigator.clipboard.writeText(tag)} className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100">{tag}</button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 flex items-center gap-1 text-sm font-medium text-slate-700"><TrendingUp size={14} /> Trending Now</p>
              <div className="flex flex-wrap gap-1.5">
                {s.trending_hashtags?.map((tag, i) => (
                  <span key={i} className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">{tag}</span>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 flex items-center gap-1 text-sm font-medium text-slate-700"><AlertTriangle size={14} /> Avoid (Shadowbanned)</p>
              <div className="flex flex-wrap gap-1.5">
                {s.banned_hashtags?.map((tag, i) => (
                  <span key={i} className="rounded-lg bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 line-through">{tag}</span>
                ))}
              </div>
            </div>
            {(s.hashtag_scores as Array<Record<string, unknown>>).length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">Score Breakdown</p>
                <div className="space-y-1.5">
                  {(s.hashtag_scores as Array<Record<string, unknown>>).slice(0, 8).map((score, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                      <span className="text-sm text-slate-600">{String(score.tag)}</span>
                      <div className="flex gap-3 text-xs">
                        <span className="text-blue-600">R: {String(score.reach_score)}</span>
                        <span className="text-amber-600">C: {String(score.competition_score)}</span>
                        <span className="text-emerald-600">Rel: {String(score.relevance_score)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ))}

      {strategies.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 py-16 text-center">
          <Hash size={32} className="mx-auto text-slate-300" />
          <p className="mt-2 text-sm text-slate-400">Generate your first hashtag strategy</p>
        </div>
      )}
    </div>
  );
}
