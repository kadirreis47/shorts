import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { startRepurposingJob } from '@/lib/api';
import type { Channel, RepurposingJob } from '@/lib/types';
import { Repeat, Loader2, Sparkles, Play, Scissors, Check } from 'lucide-react';

export function RepurposingEngine({ channels }: { channels: Channel[] }) {
  const { t } = useI18n();
  const [jobs, setJobs] = useState<RepurposingJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [sourceUrl, setSourceUrl] = useState('');
  const [channelId, setChannelId] = useState('');

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('repurposing_jobs').select('*').order('created_at', { ascending: false });
    setJobs(data ?? []);
    setLoading(false);
  }
  useState(() => { load(); });

  async function handleStart() {
    if (!sourceUrl.trim()) return;
    setGenerating(true);
    try {
      const result = await startRepurposingJob({ sourceUrl, channelId: channelId || undefined });
      await supabase.from('repurposing_jobs').insert(result);
      setSourceUrl('');
      load();
    } catch { /* ignore */ }
    setGenerating(false);
  }

  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><Repeat size={24} /> Video Repurposing Engine</h1>
        <p className="mt-1 text-sm text-slate-500">Turn long-form videos into multiple Shorts with AI-detected viral moments</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-3 gap-3">
          <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="YouTube video URL" className="col-span-2 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
          <select value={channelId} onChange={(e) => setChannelId(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option value="">Auto-assign channel</option>
            {channels.map((ch) => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
          </select>
        </div>
        <button onClick={handleStart} disabled={generating || !sourceUrl.trim()} className="mt-3 flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
          {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Find Viral Clips
        </button>
      </div>

      {jobs.map((job) => (
        <div key={job.id} className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-900">{job.source_title || job.source_url}</h3>
              <p className="text-xs text-slate-400">{job.total_clips} clips detected · {job.completed_clips} ready</p>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${job.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{job.status}</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {(job.detected_clips as Array<Record<string, unknown>>).map((clip, i) => (
              <div key={i} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">Clip {String(clip.clip_id)}</span>
                  <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-700">Score: {String(clip.viral_score)}</span>
                </div>
                <p className="mt-1 text-sm font-medium text-slate-700">{String(clip.suggested_title)}</p>
                <p className="mt-1 text-xs text-slate-500">{String(clip.summary)}</p>
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                  <span>{String(clip.start_time)}s - {String(clip.end_time)}s</span>
                  <span>·</span>
                  <span>{String(clip.duration)}s</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {jobs.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 py-16 text-center">
          <Repeat size={32} className="mx-auto text-slate-300" />
          <p className="mt-2 text-sm text-slate-400">Paste a video URL to find viral clips</p>
        </div>
      )}
    </div>
  );
}
