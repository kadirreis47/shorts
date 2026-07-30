import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { analyzeRetention } from '@/lib/api';
import { Activity, Loader2, TrendingDown, TrendingUp, AlertTriangle } from 'lucide-react';
import type { Video } from '@/lib/types';

export function RetentionReplay() {
  const { t } = useI18n();
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Record<string, unknown> | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  async function loadVideos() {
    setLoading(true);
    const { data } = await supabase.from('videos').select('*').eq('status', 'published').order('published_at', { ascending: false }).limit(20);
    setVideos(data ?? []);
    setLoading(false);
  }

  useState(() => { loadVideos(); });

  async function handleAnalyze(videoId: string) {
    setSelectedVideo(videoId);
    setAnalyzing(true);
    setAnalysis(null);
    try {
      const video = videos.find((v) => v.id === videoId);
      const result = await analyzeRetention({ videoId, scenes: video?.scenes ?? [] });
      setAnalysis(result.analysis);
    } catch { /* ignore */ }
    setAnalyzing(false);
  }

  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-slate-400" /></div>;

  const dropOffs = (analysis?.drop_off_points as Array<Record<string, string>>) ?? [];
  const bestMoment = analysis?.best_moment as Record<string, string | number> | undefined;
  const worstMoment = analysis?.worst_moment as Record<string, string | number> | undefined;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><Activity size={24} /> {t('retention.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('retention.desc')}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <h3 className="mb-2 text-sm font-medium text-slate-500">{t('retention.selectVideo')}</h3>
          <div className="space-y-2">
            {videos.map((v) => (
              <button key={v.id} onClick={() => handleAnalyze(v.id)}
                className={`w-full rounded-lg border p-3 text-left ${selectedVideo === v.id ? 'border-emerald-500 bg-emerald-50/30' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                <p className="truncate text-sm font-medium text-slate-900">{v.title}</p>
                <p className="mt-0.5 text-xs text-slate-400">{v.views.toLocaleString()} views</p>
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2">
          {analyzing && (
            <div className="flex h-64 items-center justify-center rounded-xl border border-slate-200 bg-white">
              <Loader2 className="animate-spin text-slate-400" />
            </div>
          )}

          {analysis && !analyzing && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-slate-900">{t('retention.overallRetention')}</h3>
                  <span className="text-2xl font-bold text-slate-900">{Number(analysis.overall_retention ?? 0).toFixed(0)}%</span>
                </div>
                <div className="mt-3 h-32">
                  <svg viewBox="0 0 300 100" className="h-full w-full">
                    <polyline
                      points={Array.from({ length: 13 }, (_, i) => `${i * 25},${100 - Math.max(20, 100 - i * 6 - (i > 8 ? 5 : 0))}`).join(' ')}
                      fill="none" stroke="#10b981" strokeWidth="2"
                    />
                    <polyline
                      points={Array.from({ length: 13 }, (_, i) => `${i * 25},${100 - Math.max(20, 100 - i * 6 - (i > 8 ? 5 : 0))}`).join(' ')}
                      fill="url(#grad)" stroke="none" opacity="0.2"
                    />
                    <defs><linearGradient id="grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" /><stop offset="100%" stopColor="#10b981" stopOpacity="0" /></linearGradient></defs>
                  </svg>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {bestMoment && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-4">
                    <h4 className="flex items-center gap-1.5 text-sm font-medium text-emerald-700"><TrendingUp size={16} /> {t('retention.bestMoment')}</h4>
                    <p className="mt-1 text-xs text-slate-600">{bestMoment.start}s - {bestMoment.end}s</p>
                    <p className="mt-1 text-xs text-slate-500">{String(bestMoment.reason ?? '')}</p>
                  </div>
                )}
                {worstMoment && (
                  <div className="rounded-xl border border-red-200 bg-red-50/30 p-4">
                    <h4 className="flex items-center gap-1.5 text-sm font-medium text-red-700"><TrendingDown size={16} /> {t('retention.worstMoment')}</h4>
                    <p className="mt-1 text-xs text-slate-600">{worstMoment.start}s - {worstMoment.end}s</p>
                    <p className="mt-1 text-xs text-slate-500">{String(worstMoment.reason ?? '')}</p>
                  </div>
                )}
              </div>

              {dropOffs.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <h4 className="flex items-center gap-1.5 text-sm font-medium text-slate-700"><AlertTriangle size={16} /> {t('retention.dropOffs')}</h4>
                  <div className="mt-2 space-y-2">
                    {dropOffs.map((d, i) => (
                      <div key={i} className="flex items-start gap-2 rounded-lg border border-slate-100 p-2">
                        <span className={`mt-0.5 rounded px-1.5 py-0.5 text-xs ${d.severity === 'high' ? 'bg-red-100 text-red-700' : d.severity === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{d.severity}</span>
                        <div>
                          <p className="text-xs font-medium text-slate-700">{t('retention.time')}: {d.time}s</p>
                          <p className="text-xs text-slate-500">{d.likely_cause}</p>
                          <p className="text-xs text-emerald-600">{t('retention.fix')}: {d.fix_suggestion}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!analysis && !analyzing && (
            <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-slate-300">
              <p className="text-sm text-slate-400">{t('retention.selectPrompt')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
