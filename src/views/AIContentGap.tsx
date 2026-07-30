import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { findContentGaps } from '@/lib/api';
import { Compass, Loader2, TrendingUp, ArrowRight } from 'lucide-react';
import type { ContentGap } from '@/lib/types';

export function AIContentGap() {
  const { t } = useI18n();
  const [gaps, setGaps] = useState<ContentGap[]>([]);
  const [loading, setLoading] = useState(false);
  const [niche, setNiche] = useState('');

  async function handleScan() {
    setLoading(true);
    try {
      const result = await findContentGaps({ niche: niche || undefined });
      setGaps(result.gaps ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><Compass size={24} /> {t('contentgap.title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('contentgap.desc')}</p>
        </div>
        <div className="flex items-center gap-2">
          <input value={niche} onChange={(e) => setNiche(e.target.value)} placeholder={t('contentgap.nichePlaceholder')}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
          <button onClick={handleScan} disabled={loading}
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Compass size={16} />} {t('contentgap.scan')}
          </button>
        </div>
      </div>

      {gaps.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {gaps.map((gap, i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between">
                <h3 className="font-semibold text-slate-900">{gap.topic}</h3>
                <div className="flex flex-col items-end">
                  <span className="text-lg font-bold text-emerald-600">{gap.opportunity_score}</span>
                  <span className="text-xs text-slate-400">{t('contentgap.opportunity')}</span>
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-500">{gap.reason}</p>
              <div className="mt-3 flex gap-4 text-xs">
                <div><span className="text-slate-400">{t('contentgap.searchVolume')}: </span><span className="font-medium text-slate-700">{gap.search_volume}</span></div>
                <div><span className="text-slate-400">{t('contentgap.competition')}: </span><span className="font-medium text-slate-700">{gap.competition_score}</span></div>
              </div>
              {gap.suggested_hook && (
                <div className="mt-3 rounded-lg bg-blue-50/50 p-2">
                  <p className="text-xs font-medium text-blue-700">{t('contentgap.suggestedHook')}</p>
                  <p className="mt-0.5 text-xs text-slate-600">"{gap.suggested_hook}"</p>
                </div>
              )}
              {gap.suggested_tags?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {gap.suggested_tags.map((tag, j) => (
                    <span key={j} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">#{tag}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {gaps.length === 0 && !loading && (
        <div className="rounded-xl border border-dashed border-slate-300 py-16 text-center">
          <Compass size={32} className="mx-auto text-slate-300" />
          <p className="mt-2 text-sm text-slate-400">{t('contentgap.empty')}</p>
        </div>
      )}
    </div>
  );
}
