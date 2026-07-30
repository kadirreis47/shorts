import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { scheduleCrossPlatform } from '@/lib/api';
import type { Channel, CrossPlatformSchedule } from '@/lib/types';
import { Calendar, Loader2, Send, Check, Clock, Youtube, Instagram, Facebook } from 'lucide-react';

const PLATFORMS = [
  { id: 'youtube', label: 'YouTube Shorts', icon: Youtube },
  { id: 'tiktok', label: 'TikTok', icon: Send },
  { id: 'instagram', label: 'Instagram Reels', icon: Instagram },
  { id: 'facebook', label: 'Facebook Reels', icon: Facebook },
];

export function CrossPlatformScheduler({ channels }: { channels: Channel[] }) {
  const { t } = useI18n();
  const [schedules, setSchedules] = useState<CrossPlatformSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [scheduling, setScheduling] = useState(false);
  const [channelId, setChannelId] = useState('');
  const [videoId, setVideoId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['youtube']);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('cross_platform_schedules').select('*').order('created_at', { ascending: false });
    setSchedules(data ?? []);
    setLoading(false);
  }
  useState(() => { load(); });

  async function handleSchedule() {
    if (!videoId.trim() || selectedPlatforms.length === 0) return;
    setScheduling(true);
    try {
      const dt = scheduledAt ? new Date(scheduledAt).toISOString() : new Date(Date.now() + 3600000).toISOString();
      await scheduleCrossPlatform({ videoId, channelId: channelId || undefined, platforms: selectedPlatforms, scheduledAt: dt });
      setVideoId(''); setScheduledAt('');
      load();
    } catch { /* ignore */ }
    setScheduling(false);
  }

  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><Calendar size={24} /> Cross-Platform Scheduler</h1>
        <p className="mt-1 text-sm text-slate-500">Schedule videos across YouTube, TikTok, Instagram, and Facebook simultaneously</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <input value={videoId} onChange={(e) => setVideoId(e.target.value)} placeholder="Video ID" className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
          <select value={channelId} onChange={(e) => setChannelId(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option value="">Select channel</option>
            {channels.map((ch) => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
          </select>
          <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
          <button onClick={handleSchedule} disabled={scheduling || !videoId.trim()} className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
            {scheduling ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Schedule
          </button>
        </div>
        <div className="mt-3">
          <p className="mb-2 text-sm font-medium text-slate-700">Platforms</p>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((p) => {
              const Icon = p.icon;
              const selected = selectedPlatforms.includes(p.id);
              return (
                <button key={p.id} onClick={() => setSelectedPlatforms(selected ? selectedPlatforms.filter((s) => s !== p.id) : [...selectedPlatforms, p.id])} className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium ${selected ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                  <Icon size={16} /> {p.label} {selected && <Check size={14} />}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {schedules.map((s) => (
          <div key={s.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-full ${s.status === 'published' ? 'bg-emerald-100' : 'bg-amber-100'}`}>
                {s.status === 'published' ? <Check size={18} className="text-emerald-600" /> : <Clock size={18} className="text-amber-600" />}
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900 capitalize">{s.platform}</p>
                <p className="text-xs text-slate-400">{new Date(s.scheduled_at).toLocaleString()}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {s.adapted_title && <span className="text-sm text-slate-600">{s.adapted_title}</span>}
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.status === 'published' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{s.status}</span>
            </div>
          </div>
        ))}
      </div>

      {schedules.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 py-16 text-center">
          <Calendar size={32} className="mx-auto text-slate-300" />
          <p className="mt-2 text-sm text-slate-400">Schedule your first cross-platform post</p>
        </div>
      )}
    </div>
  );
}
