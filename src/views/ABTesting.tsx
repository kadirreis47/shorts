import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { runABTest } from '@/lib/api';
import { FlaskConical, Loader2, Trophy, Check, X } from 'lucide-react';

export function ABTesting() {
  const { t } = useI18n();
  const [testType, setTestType] = useState<'thumbnail' | 'title' | 'hook'>('thumbnail');
  const [variants, setVariants] = useState(['', '', '']);
  const [result, setResult] = useState<{ winner_index: number; metrics?: Record<string, unknown> } | null>(null);
  const [running, setRunning] = useState(false);

  async function handleRun() {
    const validVariants = variants.filter((v) => v.trim()).map((v) => ({ content: v }));
    if (validVariants.length < 2) return;
    setRunning(true);
    setResult(null);
    try {
      const res = await runABTest({ testType, variants: validVariants });
      setResult({ winner_index: res.winner_index ?? 0, metrics: res.metrics });
    } catch { /* ignore */ }
    setRunning(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><FlaskConical size={24} /> {t('abtest.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('abtest.desc')}</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex gap-2">
          {(['thumbnail', 'title', 'hook'] as const).map((type) => (
            <button key={type} onClick={() => setTestType(type)}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${testType === type ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              {t(`abtest.${type}`)}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          {variants.map((v, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">{String.fromCharCode(65 + i)}</span>
              <input value={v} onChange={(e) => setVariants(variants.map((vr, j) => j === i ? e.target.value : vr))}
                placeholder={`${t('abtest.variant')} ${String.fromCharCode(65 + i)}`}
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
              {variants.length > 2 && (
                <button onClick={() => setVariants(variants.filter((_, j) => j !== i))} className="text-slate-300 hover:text-red-500"><X size={16} /></button>
              )}
            </div>
          ))}
          {variants.length < 5 && (
            <button onClick={() => setVariants([...variants, ''])} className="text-sm text-emerald-600 hover:text-emerald-700">+ {t('abtest.addVariant')}</button>
          )}
        </div>

        <button onClick={handleRun} disabled={running || variants.filter((v) => v.trim()).length < 2}
          className="mt-4 flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
          {running ? <><Loader2 size={16} className="animate-spin" /> {t('abtest.running')}</> : <><FlaskConical size={16} /> {t('abtest.run')}</>}
        </button>
      </div>

      {result && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-5">
          <h3 className="flex items-center gap-2 font-semibold text-slate-900"><Trophy size={18} className="text-amber-500" /> {t('abtest.winner')}: {String.fromCharCode(65 + (result.winner_index ?? 0))}</h3>
          <p className="mt-1 text-sm text-slate-600">{variants[result.winner_index ?? 0]}</p>
          {result.metrics?.reasoning != null && <p className="mt-2 text-xs text-slate-500">{String(result.metrics.reasoning)}</p>}
          {result.metrics?.confidence != null && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-slate-500"><span>{t('abtest.confidence')}</span><span>{Math.round(Number(result.metrics.confidence))}%</span></div>
              <div className="mt-1 h-2 rounded-full bg-slate-200"><div className="h-2 rounded-full bg-emerald-500" style={{ width: `${Number(result.metrics.confidence)}%` }} /></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
