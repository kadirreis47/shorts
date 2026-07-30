import { useEffect, useState } from 'react';
import { Film, Plus, Trash2, Layers, Eye, Play } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Channel, Series, Video } from '@/lib/types';
import { Card, Button, Modal, EmptyState, StatusBadge } from '@/components/ui';
import { formatNumber, timeAgo, classNames } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

interface SeriesViewProps {
  channels: Channel[];
}

export function SeriesView({ channels }: SeriesViewProps) {
  const { t } = useI18n();
  const [series, setSeries] = useState<Series[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [selectedSeries, setSelectedSeries] = useState<Series | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [{ data: s }, { data: v }] = await Promise.all([
      supabase.from('series').select('*').order('created_at', { ascending: false }),
      supabase.from('videos').select('*'),
    ]);
    setSeries(s ?? []);
    setVideos(v ?? []);
    setLoading(false);
  }

  const channelMap = new Map(channels.map((c) => [c.id, c]));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('series.title')}</h1>
          <p className="text-sm text-slate-500">{t('series.subtitle')}</p>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <Plus size={16} /> {t('series.newSeries')}
        </Button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-slate-400">{t('common.loading')}</div>
      ) : series.length === 0 ? (
        <EmptyState icon={<Layers size={24} />} title={t('series.noSeries')} description={t('series.noSeriesDesc')} action={<Button onClick={() => setShowNew(true)}><Plus size={16} /> {t('series.newSeries')}</Button>} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {series.map((s) => {
            const ch = channelMap.get(s.channel_id);
            const seriesVideos = videos.filter((v) => v.series_id === s.id).sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
            return (
              <Card key={s.id} className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl text-white" style={{ backgroundColor: ch?.avatar_color ?? '#6366f1' }}>
                      <Layers size={18} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900">{s.name}</h3>
                      <p className="text-xs text-slate-500">{ch?.name} · {s.theme ?? ''}</p>
                    </div>
                  </div>
                  <StatusBadge status={s.status === 'active' ? 'active' : s.status === 'completed' ? 'published' : 'paused'} />
                </div>

                {s.description && <p className="mt-3 text-sm text-slate-600">{s.description}</p>}

                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-slate-50 p-2">
                    <p className="text-lg font-bold text-slate-900">{seriesVideos.length}</p>
                    <p className="text-[10px] text-slate-500">{t('series.episodes')}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2">
                    <p className="text-lg font-bold text-slate-900">{s.target_episodes}</p>
                    <p className="text-[10px] text-slate-500">{t('series.targetEpisodes')}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2">
                    <p className="text-lg font-bold text-slate-900">{formatNumber(s.total_views)}</p>
                    <p className="text-[10px] text-slate-500">{t('series.totalViews')}</p>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
                  <Button size="sm" variant="secondary" onClick={() => setSelectedSeries(s)}>
                    <Play size={14} /> {t('series.episodes')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={async () => { await supabase.from('series').delete().eq('id', s.id); load(); }}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <NewSeriesModal open={showNew} channels={channels} onClose={() => setShowNew(false)} onCreated={load} />
      {selectedSeries && <SeriesDetailModal series={selectedSeries} videos={videos.filter((v) => v.series_id === selectedSeries.id)} onClose={() => setSelectedSeries(null)} />}
    </div>
  );
}

function NewSeriesModal({ open, channels, onClose, onCreated }: {
  open: boolean;
  channels: Channel[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [channelId, setChannelId] = useState(channels[0]?.id ?? '');
  const [description, setDescription] = useState('');
  const [theme, setTheme] = useState('');
  const [targetEpisodes, setTargetEpisodes] = useState(10);

  async function create() {
    if (!name.trim() || !channelId) return;
    await supabase.from('series').insert({
      name: name.trim(), channel_id: channelId, description, theme,
      target_episodes: targetEpisodes, status: 'active',
    });
    onCreated();
    onClose();
    setName(''); setDescription(''); setTheme(''); setTargetEpisodes(10);
  }

  return (
    <Modal open={open} onClose={onClose} title={t('series.newSeries')}>
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-slate-700">{t('series.name')}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('series.namePlaceholder')}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">{t('bulk.channel')}</label>
          <select value={channelId} onChange={(e) => setChannelId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400">
            {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">{t('series.description')}</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-slate-700">{t('series.theme')}</label>
            <input value={theme} onChange={(e) => setTheme(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">{t('series.targetEpisodes')}: {targetEpisodes}</label>
            <input type="range" min="3" max="50" value={targetEpisodes} onChange={(e) => setTargetEpisodes(Number(e.target.value))}
              className="mt-2 w-full accent-slate-900" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>{t('videos.cancel')}</Button>
          <Button onClick={create} disabled={!name.trim()}>{t('series.create')}</Button>
        </div>
      </div>
    </Modal>
  );
}

function SeriesDetailModal({ series, videos, onClose }: { series: Series; videos: Video[]; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Modal open={true} onClose={onClose} title={series.name} size="lg">
      <div className="space-y-3">
        {videos.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">{t('series.noSeriesDesc')}</p>
        ) : (
          videos.map((v, i) => (
            <div key={v.id} className="flex items-center gap-3 rounded-lg border border-slate-100 p-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-xs font-bold text-white">{i + 1}</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-800">{v.title}</p>
                <p className="text-xs text-slate-400">{timeAgo(v.created_at)}</p>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span className="flex items-center gap-1"><Eye size={12} /> {formatNumber(v.views)}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}
