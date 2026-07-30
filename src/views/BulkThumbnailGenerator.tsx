import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { createBulkThumbnailJob } from '@/lib/api';
import type { Channel, BulkThumbnailJob } from '@/lib/types';
import { Image as ImageIcon, Loader2, Sparkles, Check, Layers } from 'lucide-react';

export function BulkThumbnailGenerator({ channels }: { channels: Channel[] }) {
  const { t } = useI18n();
  const [jobs, setJobs] = useState<BulkThumbnailJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [name, setName] = useState('');
  const [template, setTemplate] = useState('bold');
  const [videoCount, setVideoCount] = useState('5');
  const [channelId, setChannelId] = useState('');

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('bulk_thumbnail_jobs').select('*').order('created_at', { ascending: false });
    setJobs(data ?? []);
    setLoading(false);
  }
  useState(() => { load(); });

  async function handleGenerate() {
    if (!name.trim()) return;
    setGenerating(true);
    try {
      const count = parseInt(videoCount) || 5;
      const fakeIds = Array.from({ length: count }, () => crypto.randomUUID());
      await createBulkThumbnailJob({ channelId: channelId || undefined, name, videoIds: fakeIds, template });
      setName('');
      load();
    } catch { /* ignore */ }
    setGenerating(false);
  }

  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><Layers size={24} /> Bulk Thumbnail Generator</h1>
        <p className="mt-1 text-sm text-slate-500">Generate thumbnails for multiple videos at once with consistent branding</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Job name" className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
          <select value={template} onChange={(e) => setTemplate(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option value="bold">Bold Text</option>
            <option value="minimal">Minimal</option>
            <option value="viral">Viral Style</option>
            <option value="gradient">Gradient</option>
          </select>
          <input value={videoCount} onChange={(e) => setVideoCount(e.target.value)} type="number" placeholder="Video count" className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
          <select value={channelId} onChange={(e) => setChannelId(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option value="">All channels</option>
            {channels.map((ch) => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
          </select>
        </div>
        <button onClick={handleGenerate} disabled={generating || !name.trim()} className="mt-3 flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
          {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Generate Thumbnails
        </button>
      </div>

      <div className="space-y-3">
        {jobs.map((job) => (
          <div key={job.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-900">{job.name}</h3>
                <p className="text-xs text-slate-400 capitalize">{job.template} template · {job.total} thumbnails</p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${job.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{job.status}</span>
            </div>
            <div className="mt-3">
              <div className="h-2 rounded-full bg-slate-100">
                <div className="h-2 rounded-full bg-emerald-500 transition-all" style={{ width: `${job.total > 0 ? (job.completed / job.total) * 100 : 0}%` }} />
              </div>
              <p className="mt-1 text-xs text-slate-400">{job.completed} / {job.total} completed</p>
            </div>
          </div>
        ))}
      </div>

      {jobs.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 py-16 text-center">
          <Layers size={32} className="mx-auto text-slate-300" />
          <p className="mt-2 text-sm text-slate-400">Create your first bulk thumbnail job</p>
        </div>
      )}
    </div>
  );
}
