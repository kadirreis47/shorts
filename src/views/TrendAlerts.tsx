import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { generateTrendAlerts } from '@/lib/api';
import { Bell, Loader2, Zap, ArrowRight, Check } from 'lucide-react';
import type { TrendAlert } from '@/lib/types';

export function TrendAlerts() {
  const { t } = useI18n();
  const [alerts, setAlerts] = useState<TrendAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [niche, setNiche] = useState('');

  async function loadAlerts() {
    setLoading(true);
    const { data } = await supabase.from('trend_alerts').select('*').order('created_at', { ascending: false });
    setAlerts(data ?? []);
    setLoading(false);
  }

  useState(() => { loadAlerts(); });

  async function handleGenerate() {
    setGenerating(true);
    try {
      await generateTrendAlerts({ niche: niche || undefined });
      loadAlerts();
    } catch { /* ignore */ }
    setGenerating(false);
  }

  async function handleMarkRead(id: string) {
    await supabase.from('trend_alerts').update({ is_read: true }).eq('id', id);
    loadAlerts();
  }

  const phaseColors: Record<string, string> = {
    emerging: 'bg-blue-50 text-blue-700 border-blue-200',
    rising: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    peaking: 'bg-amber-50 text-amber-700 border-amber-200',
    declining: 'bg-slate-50 text-slate-500 border-slate-200',
  };

  const urgencyColors: Record<string, string> = {
    high: 'bg-red-500', medium: 'bg-amber-500', low: 'bg-slate-400',
  };

  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><Bell size={24} /> {t('trendalerts.title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('trendalerts.desc')}</p>
        </div>
        <div className="flex items-center gap-2">
          <input value={niche} onChange={(e) => setNiche(e.target.value)} placeholder={t('trendalerts.nichePlaceholder')}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
          <button onClick={handleGenerate} disabled={generating}
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
            {generating ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />} {t('trendalerts.scan')}
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {alerts.map((alert) => (
          <div key={alert.id} className={`rounded-xl border bg-white p-4 ${alert.is_read ? 'opacity-60' : ''}`}>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  {!alert.is_read && <span className={`h-2 w-2 rounded-full ${urgencyColors[alert.urgency]}`} />}
                  <h3 className="font-semibold text-slate-900">{alert.topic}</h3>
                  <span className={`rounded border px-2 py-0.5 text-xs ${phaseColors[alert.trend_phase]}`}>{alert.trend_phase}</span>
                  <span className={`rounded px-2 py-0.5 text-xs text-white ${urgencyColors[alert.urgency]}`}>{alert.urgency}</span>
                </div>
                {alert.suggested_hook && <p className="mt-2 text-sm text-slate-700">"{alert.suggested_hook}"</p>}
                {alert.suggested_script && <p className="mt-1 text-xs text-slate-500 line-clamp-2">{alert.suggested_script}</p>}
                {alert.suggested_tags?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {alert.suggested_tags.map((tag, i) => (
                      <span key={i} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">#{tag}</span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <button onClick={() => handleMarkRead(alert.id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
                  <Check size={16} />
                </button>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-3 text-xs text-slate-400">
              <span>{t('trendalerts.growth')}: +{alert.growth_rate}%</span>
              {alert.predicted_peak_date && <span>{t('trendalerts.peakDate')}: {alert.predicted_peak_date}</span>}
            </div>
          </div>
        ))}
      </div>

      {alerts.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 py-16 text-center">
          <Bell size={32} className="mx-auto text-slate-300" />
          <p className="mt-2 text-sm text-slate-400">{t('trendalerts.empty')}</p>
        </div>
      )}
    </div>
  );
}
