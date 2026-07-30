import { useEffect, useState } from 'react';
import { Layers, Loader2, CheckCircle2, XCircle, Clock, Plus, Trash2, Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Channel, BulkJob } from '@/lib/types';
import { Card, Button, Modal, EmptyState, StatusBadge } from '@/components/ui';
import { formatNumber, timeAgo, classNames } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { createBulkJob, fetchTrendTopics } from '@/lib/api';

interface BulkGenerationProps {
  channels: Channel[];
}

export function BulkGeneration({ channels }: BulkGenerationProps) {
  const { t } = useI18n();
  const [jobs, setJobs] = useState<BulkJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => { loadJobs(); }, []);

  async function loadJobs() {
    setLoading(true);
    const { data } = await supabase.from('bulk_jobs').select('*').order('created_at', { ascending: false });
    setJobs(data ?? []);
    setLoading(false);
  }

  const channelMap = new Map(channels.map((c) => [c.id, c]));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('bulk.title')}</h1>
          <p className="text-sm text-slate-500">{t('bulk.subtitle')}</p>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <Plus size={16} /> {t('bulk.newJob')}
        </Button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-slate-400">{t('common.loading')}</div>
      ) : jobs.length === 0 ? (
        <EmptyState icon={<Layers size={24} />} title={t('bulk.noJobs')} description={t('bulk.noJobsDesc')} action={<Button onClick={() => setShowNew(true)}><Plus size={16} /> {t('bulk.newJob')}</Button>} />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {jobs.map((job) => {
            const ch = channelMap.get(job.channel_id);
            const progress = job.total > 0 ? (job.completed / job.total) * 100 : 0;
            return (
              <Card key={job.id} className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
                      <Layers size={18} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900">{job.name}</h3>
                      <p className="text-xs text-slate-500">{ch?.name} · {t('bulk.topicsCount', { count: job.topics.length })}</p>
                    </div>
                  </div>
                  <StatusBadge status={job.status === 'pending' ? 'idea' : job.status === 'running' ? 'rendering' : job.status === 'completed' ? 'published' : 'failed'} />
                </div>

                <div className="mt-4">
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-slate-500">{t('bulk.progress', { completed: job.completed, total: job.total })}</span>
                    {job.failed > 0 && <span className="text-red-500">{t('bulk.failed', { count: job.failed })}</span>}
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className={classNames('h-full rounded-full transition-all', job.status === 'completed' ? 'bg-emerald-500' : 'bg-blue-500')} style={{ width: `${progress}%` }} />
                  </div>
                </div>

                <div className="mt-3 space-y-1">
                  {job.topics.slice(0, 4).map((topic, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-slate-600">
                      {i < job.completed ? <CheckCircle2 size={12} className="text-emerald-500" /> : <Clock size={12} className="text-slate-300" />}
                      <span className="truncate">{topic}</span>
                    </div>
                  ))}
                  {job.topics.length > 4 && <p className="text-xs text-slate-400">+{job.topics.length - 4} more</p>}
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                  <span className="text-xs text-slate-400">{t('bulk.started')} {timeAgo(job.created_at)}</span>
                  <Button size="sm" variant="ghost" onClick={async () => { await supabase.from('bulk_jobs').delete().eq('id', job.id); loadJobs(); }}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <NewBulkJobModal open={showNew} channels={channels} onClose={() => setShowNew(false)} onCreated={loadJobs} />
    </div>
  );
}

function NewBulkJobModal({ open, channels, onClose, onCreated }: {
  open: boolean;
  channels: Channel[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [channelId, setChannelId] = useState(channels[0]?.id ?? '');
  const [topicsText, setTopicsText] = useState('');
  const [tone, setTone] = useState('engaging');
  const [duration, setDuration] = useState(30);
  const [autoPublish, setAutoPublish] = useState(false);
  const [autoThumbnail, setAutoThumbnail] = useState(true);
  const [autoHashtags, setAutoHashtags] = useState(true);
  const [creating, setCreating] = useState(false);
  const [loadingTrends, setLoadingTrends] = useState(false);

  async function handleLoadTrends() {
    setLoadingTrends(true);
    try {
      const trends = await fetchTrendTopics('youtube', 'global');
      const trendText = trends.slice(0, 10).map((tr) => tr.topic).join('\n');
      setTopicsText((prev) => prev ? prev + '\n' + trendText : trendText);
    } catch { /* ignore */ }
    setLoadingTrends(false);
  }

  async function handleCreate() {
    const topics = topicsText.split('\n').map((s) => s.trim()).filter(Boolean);
    if (!name.trim() || !channelId || topics.length === 0) return;
    setCreating(true);
    try {
      await createBulkJob({
        channelId,
        name: name.trim(),
        topics,
        settings: { tone, duration, autoPublish, autoThumbnail, autoHashtags },
      });
      onCreated();
      onClose();
      setName(''); setTopicsText('');
    } catch { /* ignore */ }
    setCreating(false);
  }

  return (
    <Modal open={open} onClose={onClose} title={t('bulk.newJob')} size="lg">
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-slate-700">{t('bulk.jobName')}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('bulk.jobNamePlaceholder')}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-slate-700">{t('bulk.channel')}</label>
            <select value={channelId} onChange={(e) => setChannelId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400">
              {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">{t('bulk.tone')}</label>
            <select value={tone} onChange={(e) => setTone(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400">
              <option value="engaging">{t('studio.toneEngaging')}</option>
              <option value="energetic">{t('studio.toneEnergetic')}</option>
              <option value="educational">{t('studio.toneEducational')}</option>
              <option value="dramatic">{t('studio.toneDramatic')}</option>
              <option value="casual">{t('studio.toneCasual')}</option>
              <option value="inspirational">{t('studio.toneInspirational')}</option>
            </select>
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-slate-700">{t('bulk.topics')}</label>
            <button onClick={handleLoadTrends} disabled={loadingTrends}
              className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline disabled:opacity-50">
              {loadingTrends ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              {t('bulk.useTrends')}
            </button>
          </div>
          <textarea value={topicsText} onChange={(e) => setTopicsText(e.target.value)} rows={8}
            placeholder={t('bulk.topicsPlaceholder')}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
          <p className="mt-1 text-xs text-slate-400">{t('bulk.topicsCount', { count: topicsText.split('\n').filter((s) => s.trim()).length })}</p>
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">{t('bulk.duration')}: {duration}s</label>
          <input type="range" min="15" max="60" value={duration} onChange={(e) => setDuration(Number(e.target.value))}
            className="mt-1 w-full accent-slate-900" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>{t('videos.cancel')}</Button>
          <Button onClick={handleCreate} disabled={creating || !name.trim() || !topicsText.trim()}>
            {creating ? <><Loader2 size={16} className="animate-spin" /> {t('bulk.creating')}</> : <><Layers size={16} /> {t('bulk.create')}</>}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
