import { useEffect, useState } from 'react';
import { Upload, Film, Music, Image, Search, Filter, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Asset, Channel } from '@/lib/types';
import { formatBytes, formatDuration, classNames } from '@/lib/utils';
import { Card, Button, EmptyState } from '@/components/ui';

interface AssetsProps {
  channels: Channel[];
}

const TYPE_ICONS: Record<string, typeof Film> = { video: Film, audio: Music, image: Image };
const TYPE_COLORS: Record<string, string> = { video: 'text-blue-600 bg-blue-50', audio: 'text-emerald-600 bg-emerald-50', image: 'text-violet-600 bg-violet-50' };

export function Assets({ channels }: AssetsProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [channelFilter, setChannelFilter] = useState<string>('all');

  const channelMap = new Map(channels.map((c) => [c.id, c]));

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('assets').select('*').order('created_at', { ascending: false });
      setAssets(data ?? []);
      setLoading(false);
    })();
  }, []);

  const filtered = assets
    .filter((a) => typeFilter === 'all' || a.type === typeFilter)
    .filter((a) => channelFilter === 'all' || a.channel_id === channelFilter)
    .filter((a) => !search || a.name.toLowerCase().includes(search.toLowerCase()));

  const counts = { video: assets.filter((a) => a.type === 'video').length, audio: assets.filter((a) => a.type === 'audio').length, image: assets.filter((a) => a.type === 'image').length };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Asset Library</h1>
          <p className="text-sm text-slate-500">{assets.length} assets · {formatBytes(assets.reduce((s, a) => s + a.size_bytes, 0))} total</p>
        </div>
        <Button><Upload size={16} /> Upload</Button>
      </div>

      {/* Type Cards */}
      <div className="grid grid-cols-3 gap-4">
        {(['video', 'audio', 'image'] as const).map((type) => {
          const Icon = TYPE_ICONS[type];
          return (
            <Card key={type} className="flex items-center gap-3 p-4">
              <div className={classNames('flex h-10 w-10 items-center justify-center rounded-xl', TYPE_COLORS[type])}>
                <Icon size={18} />
              </div>
              <div>
                <p className="text-lg font-bold text-slate-900">{counts[type]}</p>
                <p className="text-xs capitalize text-slate-500">{type}s</p>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Filters */}
      <Card className="flex flex-wrap items-center gap-3 p-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search assets…"
            className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-slate-400" />
        </div>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400">
          <option value="all">All types</option>
          <option value="video">Video</option>
          <option value="audio">Audio</option>
          <option value="image">Image</option>
        </select>
        <select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400">
          <option value="all">All channels</option>
          {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Card>

      {loading ? (
        <div className="py-16 text-center text-slate-400">Loading assets…</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Filter size={24} />} title="No assets found" description="Upload media files or adjust your filters." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((asset) => {
            const Icon = TYPE_ICONS[asset.type] ?? Film;
            const ch = asset.channel_id ? channelMap.get(asset.channel_id) : null;
            return (
              <Card key={asset.id} className="overflow-hidden">
                <div className={classNames('flex aspect-video items-center justify-center', TYPE_COLORS[asset.type] ?? 'bg-slate-50 text-slate-400')}>
                  <Icon size={32} />
                </div>
                <div className="p-3">
                  <p className="truncate text-sm font-semibold text-slate-900">{asset.name}</p>
                  <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                    <span className="capitalize">{asset.type}</span>
                    {asset.duration_seconds && <span>· {formatDuration(asset.duration_seconds)}</span>}
                    <span>· {formatBytes(asset.size_bytes)}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    {ch && (
                      <span className="flex items-center gap-1 text-xs text-slate-500">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ch.avatar_color }} />
                        {ch.name}
                      </span>
                    )}
                    {asset.tags.slice(0, 2).map((t) => (
                      <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">#{t}</span>
                    ))}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
