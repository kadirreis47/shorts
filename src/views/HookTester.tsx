import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { testHooks } from '@/lib/api';
import type { HookTest } from '@/lib/types';
import { FlaskConical, Loader2, Sparkles, Trophy, TrendingUp } from 'lucide-react';

export function HookTester() {
  const { t } = useI18n();
  const [tests, setTests] = useState<HookTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [topic, setTopic] = useState('');
  const [niche, setNiche] = useState('');

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('hook_tests').select('*').order('created_at', { ascending: false });
    setTests(data ?? []);
    setLoading(false);
  }
  useState(() => { load(); });

  async function handleTest() {
    if (!topic.trim()) return;
    setGenerating(true);
    try {
      const result = await testHooks({ topic, niche: niche || undefined });
      await supabase.from('hook_tests').insert(result);
      load();
    } catch { /* ignore */ }
    setGenerating(false);
  }

  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><FlaskConical size={24} /> Hook Tester</h1>
        <p className="mt-1 text-sm text-slate-500">Test multiple hook variants with CTR prediction and emotional impact scoring</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-2 gap-3">
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Video topic" className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
          <input value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="Niche (optional)" className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
        </div>
        <button onClick={handleTest} disabled={generating || !topic.trim()} className="mt-3 flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
          {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Test Hooks
        </button>
      </div>

      {tests.map((test) => (
        <div key={test.id} className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">"{test.topic}"</h3>
              <p className="text-xs text-slate-400">Predicted CTR: {test.predicted_ctr}%</p>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">{test.test_status}</span>
          </div>
          <div className="space-y-2">
            {(test.scores as Array<Record<string, unknown>>).map((score, i) => (
              <div key={i} className={`flex items-center justify-between rounded-lg p-3 ${i === test.winner_index ? 'bg-emerald-50 border border-emerald-300' : 'bg-slate-50'}`}>
                <div className="flex items-center gap-3">
                  {i === test.winner_index && <Trophy size={16} className="text-emerald-600" />}
                  <div>
                    <p className="text-sm font-medium text-slate-700">{String(score.hook)}</p>
                    <p className="text-xs text-slate-400 capitalize">{String((test.hook_variants[i] as Record<string, unknown>)?.type || '')}</p>
                  </div>
                </div>
                <div className="flex gap-4 text-xs">
                  <span className="text-emerald-600">CTR: {String(score.ctr)}%</span>
                  <span className="text-blue-600">Impact: {String(score.emotional_impact)}</span>
                  <span className="text-amber-600">Retention: {String(score.retention)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {tests.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 py-16 text-center">
          <FlaskConical size={32} className="mx-auto text-slate-300" />
          <p className="mt-2 text-sm text-slate-400">Enter a topic to test hook variants</p>
        </div>
      )}
    </div>
  );
}
