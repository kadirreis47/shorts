import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { analyzeCommentSentiment } from '@/lib/api';
import type { Channel, CommentSentiment } from '@/lib/types';
import { Smile, Loader2, Sparkles, Frown, Meh, HelpCircle } from 'lucide-react';

export function CommentSentimentDashboard({ channels }: { channels: Channel[] }) {
  const { t } = useI18n();
  const [analyses, setAnalyses] = useState<CommentSentiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [channelId, setChannelId] = useState('');

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('comment_sentiment').select('*').order('created_at', { ascending: false });
    setAnalyses(data ?? []);
    setLoading(false);
  }
  useState(() => { load(); });

  async function handleAnalyze() {
    setGenerating(true);
    try {
      const result = await analyzeCommentSentiment({ channelId: channelId || undefined });
      await supabase.from('comment_sentiment').insert(result);
      load();
    } catch { /* ignore */ }
    setGenerating(false);
  }

  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><Smile size={24} /> Comment Sentiment Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">Cross-channel comment sentiment analysis with actionable insights</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex gap-3">
          <select value={channelId} onChange={(e) => setChannelId(e.target.value)} className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option value="">All channels</option>
            {channels.map((ch) => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
          </select>
          <button onClick={handleAnalyze} disabled={generating} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
            {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Analyze Sentiment
          </button>
        </div>
      </div>

      {analyses.map((a) => (
        <div key={a.id} className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">{a.total_comments} Comments Analyzed</h3>
            <span className={`rounded-full px-3 py-1 text-sm font-bold ${a.sentiment_score > 50 ? 'bg-emerald-50 text-emerald-700' : a.sentiment_score > 20 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
              Score: {a.sentiment_score}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div className="rounded-lg bg-emerald-50 p-3 text-center">
              <Smile size={20} className="mx-auto text-emerald-500" />
              <p className="mt-1 text-lg font-bold text-emerald-700">{a.positive_count}</p>
              <p className="text-xs text-slate-500">Positive</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 text-center">
              <Meh size={20} className="mx-auto text-slate-400" />
              <p className="mt-1 text-lg font-bold text-slate-600">{a.neutral_count}</p>
              <p className="text-xs text-slate-500">Neutral</p>
            </div>
            <div className="rounded-lg bg-red-50 p-3 text-center">
              <Frown size={20} className="mx-auto text-red-400" />
              <p className="mt-1 text-lg font-bold text-red-600">{a.negative_count}</p>
              <p className="text-xs text-slate-500">Negative</p>
            </div>
            <div className="rounded-lg bg-blue-50 p-3 text-center">
              <HelpCircle size={20} className="mx-auto text-blue-400" />
              <p className="mt-1 text-lg font-bold text-blue-600">{a.question_count}</p>
              <p className="text-xs text-slate-500">Questions</p>
            </div>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">Top Themes</p>
              <div className="space-y-1.5">
                {(a.top_themes as Array<Record<string, unknown>>).map((theme, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                    <span className="text-sm text-slate-600">{String(theme.theme)}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 capitalize">{String(theme.frequency)}</span>
                      <span className={`rounded px-1.5 py-0.5 text-xs ${String(theme.sentiment) === 'positive' ? 'bg-emerald-100 text-emerald-700' : String(theme.sentiment) === 'negative' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>{String(theme.sentiment)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">Actionable Insights</p>
              <div className="space-y-1.5">
                {(a.actionable_insights as Array<Record<string, unknown>>).map((insight, i) => (
                  <div key={i} className="rounded-lg bg-blue-50 px-3 py-2">
                    <p className="text-sm text-blue-700">{String(insight.insight)}</p>
                    <p className="text-xs text-slate-400 capitalize">{String(insight.priority)} priority</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ))}

      {analyses.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 py-16 text-center">
          <Smile size={32} className="mx-auto text-slate-300" />
          <p className="mt-2 text-sm text-slate-400">Run your first sentiment analysis</p>
        </div>
      )}
    </div>
  );
}
