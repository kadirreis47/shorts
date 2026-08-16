import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Search, Plus, Filter, LayoutGrid, List, Eye, Heart, MessageCircle,
  Share2, Clock, X, Calendar, Tag, FileText, Play, Trash2, Download, Clapperboard, Youtube, AlertCircle, RefreshCw,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Video } from '@/lib/types';
import { formatNumber, formatDuration, timeAgo, timeUntil, classNames } from '@/lib/utils';
import { StatusBadge, Card, Button, Modal, EmptyState } from '@/components/ui';
import { VIDEO_STATUSES, statusConfig } from '@/lib/status';
import { useI18n } from '@/lib/i18n';
import { withTimeout } from '@/lib/async';
import { resolveVideoPublishingHandoff, usePublishingStore } from '@/store/publishingStore';
import { useExportIntelligenceStore } from '@/store/exportIntelligenceStore';
import { useUIStore } from '@/store/uiStore';
import type { CanonicalChannelIdentity } from '@/services/canonicalChannelCatalog';
import { createVideoChannelAttribution, resolveVideoCanonicalChannelId } from '@/services/videoChannelAttribution';
import { createPrivateMediaSignedUrl } from '@/lib/mediaStorage';

interface VideosProps {
  channels: CanonicalChannelIdentity[];
  onNavigateStudio?: () => void;
}

export function Videos({ channels, onNavigateStudio }: VideosProps) {
  const { t } = useI18n();
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [selected, setSelected] = useState<Video | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [sortBy, setSortBy] = useState<'recent' | 'views' | 'likes'>('recent');
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const navigate = useUIStore((state) => state.navigate);

  const channelMap = useMemo(() => new Map(channels.map((c) => [c.id, c])), [channels]);

  function openModernPublishing(video: Video) {
    const publishing = usePublishingStore.getState();
    const exportJobId = publishing.videoExportLinks[video.id];
    const linkedJob = exportJobId ? useExportIntelligenceStore.getState().queue.jobs.find((job) => job.id === exportJobId) : null;
    const handoff = resolveVideoPublishingHandoff(video, linkedJob);
    publishing.setHandoff(handoff);
    navigate(handoff.kind === 'video-needs-verification' && linkedJob ? 'export-studio' : 'publishing-studio');
  }

  const loadVideos = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await withTimeout(
        supabase.from('videos').select('*').order('created_at', { ascending: false }),
        12_000,
        'Video kütüphanesi zamanında yüklenemedi.',
      );
      if (result.error) throw new Error(result.error.message);
      setVideos(result.data ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Videolar yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadVideos();
  }, [loadVideos]);

  const filtered = useMemo(() => videos
    .filter((v) => statusFilter === 'all' || v.status === statusFilter)
    .filter((v) => channelFilter === 'all' || resolveVideoCanonicalChannelId(v) === channelFilter)
    .filter((v) => !search || v.title.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'views') return b.views - a.views;
      if (sortBy === 'likes') return b.likes - a.likes;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }), [videos, statusFilter, channelFilter, search, sortBy]);

  async function updateStatus(video: Video, status: string) {
    setActionId(video.id);
    try {
      const { error: updateError } = await supabase
        .from('videos')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', video.id);
      if (updateError) throw new Error(updateError.message);
      setVideos((current) => current.map((item) => item.id === video.id ? { ...item, status } : item));
      setSelected(null);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Video durumu güncellenemedi.');
    } finally {
      setActionId(null);
    }
  }

  async function deleteVideo(video: Video) {
    setActionId(video.id);
    try {
      const { error: deleteError } = await supabase.from('videos').delete().eq('id', video.id);
      if (deleteError) throw new Error(deleteError.message);
      setVideos((current) => current.filter((item) => item.id !== video.id));
      setSelected(null);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Video silinemedi.');
    } finally {
      setActionId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('videos.title')}</h1>
          <p className="text-sm text-slate-500">{t('videos.count', { count: filtered.length, channels: channels.length })}</p>
        </div>
        <div className="flex gap-2">
          {onNavigateStudio && (
            <Button variant="secondary" onClick={onNavigateStudio}>
              <Clapperboard size={16} /> {t('nav.studio')}
            </Button>
          )}
          <Button onClick={() => setShowNew(true)}>
            <Plus size={16} /> {t('videos.newVideo')}
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-start justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 shrink-0" size={17} />
            <span>{error}</span>
          </div>
          <button className="inline-flex items-center gap-1 font-semibold hover:text-red-900" onClick={() => void loadVideos()}>
            <RefreshCw size={15} /> Tekrar dene
          </button>
        </div>
      )}

      {/* Filters Bar */}
      <Card className="flex flex-wrap items-center gap-3 p-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('videos.searchPlaceholder')}
            className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-slate-400"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
        >
          <option value="all">{t('videos.allStatuses')}</option>
          {VIDEO_STATUSES.map((s) => (
            <option key={s} value={s}>{t(statusConfig(s).labelKey)}</option>
          ))}
        </select>

        <select
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
        >
          <option value="all">{t('videos.allChannels')}</option>
          {channels.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
        >
          <option value="recent">{t('videos.mostRecent')}</option>
          <option value="views">{t('videos.mostViewed')}</option>
          <option value="likes">{t('videos.mostLiked')}</option>
        </select>

        <div className="flex rounded-lg border border-slate-200">
          <button
            onClick={() => setView('grid')}
            className={classNames('rounded-l-lg p-2', view === 'grid' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50')}
          >
            <LayoutGrid size={16} />
          </button>
          <button
            onClick={() => setView('list')}
            className={classNames('rounded-r-lg border-l border-slate-200 p-2', view === 'list' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50')}
          >
            <List size={16} />
          </button>
        </div>
      </Card>

      {loading ? (
        <div className="py-16 text-center text-slate-400">{t('videos.loading')}</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Filter size={24} />} title={t('videos.noVideos')} description={t('videos.noVideosDesc')} />
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((v) => {
            const ch = channelMap.get(resolveVideoCanonicalChannelId(v) ?? '');
            return (
              <Card key={v.id} className="group cursor-pointer overflow-hidden transition-shadow hover:shadow-md" >
                <div onClick={() => setSelected(v)}>
                  {/* Thumbnail placeholder */}
                  <div
                    className="relative flex aspect-[9/16] items-center justify-center text-white"
                    style={{ background: `linear-gradient(135deg, ${ch?.avatar_color ?? '#6366f1'}, ${ch?.avatar_color ?? '#6366f1'}99)` }}
                  >
                    <div className="absolute inset-0 bg-black/10" />
                    <Play size={32} className="relative opacity-70 transition-opacity group-hover:opacity-100" />
                    <span className="absolute bottom-2 right-2 rounded bg-black/50 px-1.5 py-0.5 text-xs font-medium">
                      {formatDuration(v.duration_seconds)}
                    </span>
                    <span className="absolute left-2 top-2">
                      <StatusBadge status={v.status} />
                    </span>
                  </div>
                  <div className="p-3">
                    <p className="line-clamp-2 text-sm font-semibold text-slate-900">{v.title}</p>
                    <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                      <span className="flex items-center gap-1"><Eye size={12} />{formatNumber(v.views)}</span>
                      <span className="flex items-center gap-1"><Heart size={12} />{formatNumber(v.likes)}</span>
                      <span className="flex items-center gap-1"><MessageCircle size={12} />{formatNumber(v.comments)}</span>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">{t('videos.video')}</th>
                <th className="px-4 py-3">{t('videos.channel')}</th>
                <th className="px-4 py-3">{t('videos.status')}</th>
                <th className="px-4 py-3">{t('videos.views')}</th>
                <th className="px-4 py-3">{t('videos.likes')}</th>
                <th className="px-4 py-3">{t('videos.duration')}</th>
                <th className="px-4 py-3">{t('videos.created')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((v) => {
                const ch = channelMap.get(resolveVideoCanonicalChannelId(v) ?? '');
                return (
                  <tr key={v.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setSelected(v)}>
                    <td className="max-w-xs px-4 py-3">
                      <p className="truncate font-medium text-slate-900">{v.title}</p>
                      {v.tags.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {v.tags.slice(0, 3).map((t) => (
                            <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">#{t}</span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded text-[10px] font-bold text-white" style={{ backgroundColor: ch?.avatar_color ?? '#94a3b8' }}>
                          {ch?.name?.charAt(0)}
                        </div>
                        <span className="text-slate-600">{ch?.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={v.status} /></td>
                    <td className="px-4 py-3 text-slate-600">{formatNumber(v.views)}</td>
                    <td className="px-4 py-3 text-slate-600">{formatNumber(v.likes)}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDuration(v.duration_seconds)}</td>
                    <td className="px-4 py-3 text-slate-500">{timeAgo(v.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {/* Video Detail Drawer */}
      {selected && (
        <VideoDrawer
          video={selected}
          channel={channelMap.get(resolveVideoCanonicalChannelId(selected) ?? '')}
          onClose={() => setSelected(null)}
          onUpdateStatus={updateStatus}
          onDelete={deleteVideo}
          onOpenPublishing={() => openModernPublishing(selected)}
        />
      )}

      {/* New Video Modal */}
      <NewVideoModal open={showNew} onClose={() => setShowNew(false)} channels={channels} onCreated={loadVideos} />
    </div>
  );
}

function VideoDrawer({
  video, channel, onClose, onUpdateStatus, onDelete, onOpenPublishing,
}: {
  video: Video;
  channel?: CanonicalChannelIdentity;
  onClose: () => void;
  onUpdateStatus: (v: Video, s: string) => void;
  onDelete: (v: Video) => void;
  onOpenPublishing: () => void;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<'overview' | 'script' | 'analytics'>('overview');
  const [script, setScript] = useState(video.script ?? '');
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(video.video_url);
  const [previewUnavailable, setPreviewUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPreviewUnavailable(false);
    if (!video.video_storage_bucket || !video.video_storage_path) {
      setPlaybackUrl(video.video_url);
      return () => { cancelled = true; };
    }
    setPlaybackUrl(null);
    void createPrivateMediaSignedUrl({
      bucket: video.video_storage_bucket,
      objectPath: video.video_storage_path,
    }).then((signedUrl) => {
      if (!cancelled) setPlaybackUrl(signedUrl);
    }).catch(() => {
      if (!cancelled) setPreviewUnavailable(true);
    });
    return () => { cancelled = true; };
  }, [video.id, video.video_storage_bucket, video.video_storage_path, video.video_url]);

  async function saveScript() {
    await supabase.from('videos').update({ script, updated_at: new Date().toISOString() }).eq('id', video.id);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative h-full w-full max-w-lg overflow-y-auto bg-white shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4">
          <div className="flex items-center gap-2">
            <StatusBadge status={video.status} />
            <span className="text-xs text-slate-400">{timeAgo(video.created_at)}</span>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X size={20} />
          </button>
        </div>

        {/* Thumbnail */}
        {playbackUrl ? (
          <video src={playbackUrl} controls className="aspect-[9/16] max-h-64 w-full bg-black object-contain" />
        ) : (
          <div
            className="flex aspect-[9/16] max-h-64 items-center justify-center text-white"
            style={{ background: `linear-gradient(135deg, ${channel?.avatar_color ?? '#6366f1'}, ${channel?.avatar_color ?? '#6366f1'}99)` }}
          >
            <Play size={40} className="opacity-70" />
          </div>
        )}
        {previewUnavailable && <p className="bg-amber-50 px-5 py-2 text-xs text-amber-800">This private video preview could not be opened. Try reopening the video.</p>}

        <div className="p-5">
          <h2 className="text-lg font-bold text-slate-900">{video.title}</h2>
          <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
            <div className="flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold text-white" style={{ backgroundColor: channel?.avatar_color ?? '#94a3b8' }}>
              {channel?.name?.charAt(0)}
            </div>
            {channel?.name}
          </div>

          {/* Tabs */}
          <div className="mt-4 flex gap-1 border-b border-slate-100">
                  {(['overview', 'script', 'analytics'] as const).map((tabName) => (
              <button
                key={tabName}
                onClick={() => setTab(tabName)}
                className={classNames(
                  'border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                  tab === tabName ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'
                )}
              >
                {t(`videos.${tabName}`)}
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <div className="mt-4 space-y-4">
              {video.description && <p className="text-sm text-slate-600">{video.description}</p>}

              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Views', value: formatNumber(video.views), icon: Eye },
                  { label: 'Likes', value: formatNumber(video.likes), icon: Heart },
                  { label: 'Comments', value: formatNumber(video.comments), icon: MessageCircle },
                  { label: 'Shares', value: formatNumber(video.shares), icon: Share2 },
                ].map((s) => (
                  <div key={s.label} className="rounded-lg border border-slate-100 p-3">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <s.icon size={14} /> {s.label}
                    </div>
                    <p className="mt-1 text-lg font-bold text-slate-900">{s.value}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">{t('videos.duration')}</span>
                  <span className="font-medium text-slate-700">{formatDuration(video.duration_seconds)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">{t('videos.retentionRate')}</span>
                  <span className="font-medium text-slate-700">{video.retention_rate.toFixed(1)}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">{t('videos.source')}</span>
                  <span className="font-medium text-slate-700 capitalize">{video.source ?? 'manual'}</span>
                </div>
                {video.scheduled_at && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">{t('videos.scheduled')}</span>
                    <span className="font-medium text-slate-700">{timeUntil(video.scheduled_at)}</span>
                  </div>
                )}
                {video.published_at && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">{t('videos.published')}</span>
                    <span className="font-medium text-slate-700">{timeAgo(video.published_at)}</span>
                  </div>
                )}
              </div>

              {video.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {video.tags.map((t) => (
                    <span key={t} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                      <Tag size={10} /> {t}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-2">
                {video.status === 'rendered' && (
                  <Button size="sm" onClick={onOpenPublishing}>
                    <Youtube size={14} /> Open AI Publishing Studio
                  </Button>
                )}
                {video.status !== 'scheduled' && (
                  <Button size="sm" variant="secondary" onClick={() => onUpdateStatus(video, 'scheduled')}>
                    <Calendar size={14} /> {t('videos.schedule')}
                  </Button>
                )}
                <Button size="sm" variant="secondary">
                  <Download size={14} /> {t('videos.export')}
                </Button>
                <Button size="sm" variant="danger" onClick={() => onDelete(video)}>
                  <Trash2 size={14} /> {t('videos.delete')}
                </Button>
              </div>
            </div>
          )}

          {tab === 'script' && (
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t('studio.hook')}</label>
                <p className="mt-1 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{video.hook ?? t('videos.noHook')}</p>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t('studio.scriptLabel')}</label>
                <textarea
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                  rows={8}
                  className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-slate-400"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t('studio.cta')}</label>
                <p className="mt-1 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{video.cta ?? t('videos.noCta')}</p>
              </div>
              <Button size="sm" onClick={saveScript}>
                <FileText size={14} /> {t('videos.saveScript')}
              </Button>
            </div>
          )}

          {tab === 'analytics' && (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-blue-50 p-3 text-center">
                  <Eye size={16} className="mx-auto text-blue-600" />
                  <p className="mt-1 text-lg font-bold text-slate-900">{formatNumber(video.views)}</p>
                  <p className="text-xs text-slate-500">{t('videos.views')}</p>
                </div>
                <div className="rounded-lg bg-rose-50 p-3 text-center">
                  <Heart size={16} className="mx-auto text-rose-600" />
                  <p className="mt-1 text-lg font-bold text-slate-900">{formatNumber(video.likes)}</p>
                  <p className="text-xs text-slate-500">{t('videos.likes')}</p>
                </div>
                <div className="rounded-lg bg-violet-50 p-3 text-center">
                  <Share2 size={16} className="mx-auto text-violet-600" />
                  <p className="mt-1 text-lg font-bold text-slate-900">{formatNumber(video.shares)}</p>
                  <p className="text-xs text-slate-500">{t('videos.shares')}</p>
                </div>
              </div>
              <div className="rounded-lg border border-slate-100 p-4">
                <p className="text-sm font-medium text-slate-700">{t('videos.retentionRateLabel')}</p>
                <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${video.retention_rate}%` }} />
                </div>
                <p className="mt-1 text-right text-xs text-slate-500">{video.retention_rate.toFixed(1)}% {t('videos.retentionRateLabel').toLowerCase()}</p>
              </div>
              <div className="rounded-lg border border-slate-100 p-4">
                <p className="text-sm font-medium text-slate-700">{t('videos.watchTime')}</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {Math.floor(video.watch_time_seconds / 3600)}h {Math.floor((video.watch_time_seconds % 3600) / 60)}m
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NewVideoModal({ open, onClose, channels, onCreated }: {
  open: boolean;
  onClose: () => void;
  channels: CanonicalChannelIdentity[];
  onCreated: () => void;
}) {
  const { t } = useI18n();
  const [title, setTitle] = useState('');
  const [channelId, setChannelId] = useState(channels.length === 1 ? channels[0].id : '');
  const [hook, setHook] = useState('');
  const [cta, setCta] = useState('');

  async function create() {
    if (!title.trim() || !channelId) return;
    const selectedChannel = channels.find((channel) => channel.id === channelId);
    if (!selectedChannel) return;
    await supabase.from('videos').insert({
      title,
      ...createVideoChannelAttribution(selectedChannel),
      hook: hook || null,
      cta: cta || null,
      status: 'idea',
      tags: [],
    });
    setTitle(''); setHook(''); setCta('');
    onCreated();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={t('videos.createTitle')}>
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-slate-700">{t('videos.titleField')}</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('videos.titlePlaceholder')}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">{t('videos.channel')}</label>
          <select
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
          >
            <option value="">{t('videos.allChannels')}</option>
            {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">{t('studio.hook')}</label>
          <input
            value={hook}
            onChange={(e) => setHook(e.target.value)}
            placeholder={t('videos.hookPlaceholder')}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">{t('studio.cta')}</label>
          <input
            value={cta}
            onChange={(e) => setCta(e.target.value)}
            placeholder={t('videos.ctaPlaceholder')}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>{t('videos.cancel')}</Button>
          <Button onClick={create} disabled={!title.trim() || !channelId}>{t('videos.create')}</Button>
        </div>
      </div>
    </Modal>
  );
}
