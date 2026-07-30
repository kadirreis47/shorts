import { useEffect, useState } from 'react';
import { Plus, Users, Eye, Video as VideoIcon, MoreVertical, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Channel } from '@/lib/types';
import { formatNumber, classNames } from '@/lib/utils';
import { Card, Button, Modal, StatusBadge, EmptyState } from '@/components/ui';

export function Channels() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    loadChannels();
  }, []);

  async function loadChannels() {
    setLoading(true);
    const { data } = await supabase.from('channels').select('*').order('created_at', { ascending: false });
    setChannels(data ?? []);
    setLoading(false);
  }

  async function toggleStatus(ch: Channel) {
    const newStatus = ch.status === 'active' ? 'paused' : 'active';
    await supabase.from('channels').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', ch.id);
    await loadChannels();
  }

  async function deleteChannel(ch: Channel) {
    await supabase.from('channels').delete().eq('id', ch.id);
    await loadChannels();
  }

  const totalSubs = channels.reduce((s, c) => s + c.subscriber_count, 0);
  const totalViews = channels.reduce((s, c) => s + c.total_views, 0);
  const totalVideos = channels.reduce((s, c) => s + c.video_count, 0);

  if (loading) return <div className="py-16 text-center text-slate-400">Loading channels…</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Channels</h1>
          <p className="text-sm text-slate-500">{channels.length} channels · {formatNumber(totalSubs)} subscribers</p>
        </div>
        <Button onClick={() => setShowNew(true)}><Plus size={16} /> Add Channel</Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-slate-500"><Users size={14} /> Total Subscribers</div>
          <p className="mt-1 text-2xl font-bold text-slate-900">{formatNumber(totalSubs)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-slate-500"><Eye size={14} /> Total Views</div>
          <p className="mt-1 text-2xl font-bold text-slate-900">{formatNumber(totalViews)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-slate-500"><VideoIcon size={14} /> Total Videos</div>
          <p className="mt-1 text-2xl font-bold text-slate-900">{formatNumber(totalVideos)}</p>
        </Card>
      </div>

      {channels.length === 0 ? (
        <EmptyState icon={<Users size={24} />} title="No channels yet" description="Add a YouTube channel to start automating." action={<Button onClick={() => setShowNew(true)}><Plus size={16} /> Add Channel</Button>} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {channels.map((ch) => (
            <Card key={ch.id} className="overflow-hidden">
              <div className="h-20" style={{ background: `linear-gradient(135deg, ${ch.avatar_color}, ${ch.avatar_color}88)` }} />
              <div className="px-5 pb-5">
                <div className="-mt-8 mb-3 flex items-end justify-between">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-4 border-white text-xl font-bold text-white shadow-md"
                    style={{ backgroundColor: ch.avatar_color }}>
                    {ch.name.charAt(0)}
                  </div>
                  <div className="mb-1"><StatusBadge status={ch.status} /></div>
                </div>
                <h3 className="font-bold text-slate-900">{ch.name}</h3>
                <p className="text-sm text-slate-500">{ch.handle}</p>
                {ch.description && <p className="mt-2 text-sm text-slate-600">{ch.description}</p>}
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-slate-50 p-2">
                    <p className="text-sm font-bold text-slate-900">{formatNumber(ch.subscriber_count)}</p>
                    <p className="text-[11px] text-slate-500">Subs</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2">
                    <p className="text-sm font-bold text-slate-900">{formatNumber(ch.total_views)}</p>
                    <p className="text-[11px] text-slate-500">Views</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2">
                    <p className="text-sm font-bold text-slate-900">{ch.video_count}</p>
                    <p className="text-[11px] text-slate-500">Videos</p>
                  </div>
                </div>
                {ch.niche && (
                  <div className="mt-3">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{ch.niche}</span>
                  </div>
                )}
                <div className="mt-4 flex gap-2">
                  <Button size="sm" variant={ch.status === 'active' ? 'secondary' : 'primary'} onClick={() => toggleStatus(ch)} className="flex-1">
                    {ch.status === 'active' ? 'Pause' : 'Activate'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteChannel(ch)}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <NewChannelModal open={showNew} onClose={() => setShowNew(false)} onCreated={loadChannels} />
    </div>
  );
}

const COLORS = ['#10b981', '#3b82f6', '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

function NewChannelModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [niche, setNiche] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(COLORS[0]);

  async function create() {
    if (!name.trim()) return;
    await supabase.from('channels').insert({
      name, handle: handle || null, niche: niche || null, description: description || null,
      avatar_color: color, status: 'active',
    });
    setName(''); setHandle(''); setNiche(''); setDescription('');
    onCreated();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Add New Channel">
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-slate-700">Channel Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. MindFuel"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">Handle</label>
          <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@mindfuel"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">Niche</label>
          <input value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="e.g. Self Improvement"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Channel description…"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">Brand Color</label>
          <div className="mt-2 flex gap-2">
            {COLORS.map((c) => (
              <button key={c} onClick={() => setColor(c)}
                className={classNames('h-8 w-8 rounded-lg transition-transform', color === c ? 'ring-2 ring-offset-2 ring-slate-900 scale-110' : '')}
                style={{ backgroundColor: c }} />
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={create} disabled={!name.trim()}>Create Channel</Button>
        </div>
      </div>
    </Modal>
  );
}
