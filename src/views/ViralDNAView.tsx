import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { extractViralDNA } from '@/lib/api';
import { Dna, Loader2, Zap } from 'lucide-react';
import type { ViralFormula } from '@/lib/types';

export function ViralDNAView() {
  const { t } = useI18n();
  const [formulas, setFormulas] = useState<ViralFormula[]>([]);
  const [loading, setLoading] = useState(false);
  const [niche, setNiche] = useState('');

  async function handleExtract() {
    setLoading(true);
    try {
      const result = await extractViralDNA({ niche: niche || undefined });
      setFormulas(result.formulas ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><Dna size={24} /> {t('viraldna.title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('viraldna.desc')}</p>
        </div>
        <div className="flex items-center gap-2">
          <input value={niche} onChange={(e) => setNiche(e.target.value)} placeholder={t('viraldna.nichePlaceholder')}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
          <button onClick={handleExtract} disabled={loading}
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />} {t('viraldna.extract')}
          </button>
        </div>
      </div>

      {formulas.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {formulas.map((f, i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="font-semibold text-slate-900">{f.formula_name}</h3>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                {f.hook_length_seconds && <div><span className="text-slate-400">Hook:</span> <span className="font-medium text-slate-700">{f.hook_length_seconds}s</span></div>}
                {f.scene_count && <div><span className="text-slate-400">Scenes:</span> <span className="font-medium text-slate-700">{f.scene_count}</span></div>}
                {f.avg_retention != null && <div><span className="text-slate-400">Retention:</span> <span className="font-medium text-emerald-600">{f.avg_retention}%</span></div>}
                {f.avg_views != null && <div><span className="text-slate-400">Avg Views:</span> <span className="font-medium text-slate-700">{f.avg_views.toLocaleString()}</span></div>}
              </div>
              {f.pacing_pattern && <p className="mt-2 text-xs text-slate-500">{t('viraldna.pacing')}: {f.pacing_pattern}</p>}
              {f.emotional_arc && <p className="text-xs text-slate-500">{t('viraldna.emotion')}: {f.emotional_arc}</p>}
              {f.cta_placement && <p className="text-xs text-slate-500">{t('viraldna.cta')}: {f.cta_placement}</p>}
              {f.extracted_dna && Object.keys(f.extracted_dna).length > 0 && (
                <div className="mt-3 rounded-lg bg-slate-50 p-2">
                  <p className="text-xs font-medium text-slate-500">{t('viraldna.dna')}</p>
                  <pre className="mt-1 text-xs text-slate-600 whitespace-pre-wrap">{JSON.stringify(f.extracted_dna, null, 2).slice(0, 300)}</pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {formulas.length === 0 && !loading && (
        <div className="rounded-xl border border-dashed border-slate-300 py-16 text-center">
          <Dna size={32} className="mx-auto text-slate-300" />
          <p className="mt-2 text-sm text-slate-400">{t('viraldna.empty')}</p>
        </div>
      )}
    </div>
  );
}
