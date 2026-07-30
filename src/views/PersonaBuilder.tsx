import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { generateAudiencePersona } from '@/lib/api';
import type { Channel, AudiencePersona } from '@/lib/types';
import { Users, Loader2, Sparkles, Target, Heart, Clock } from 'lucide-react';

export function PersonaBuilder({ channels }: { channels: Channel[] }) {
  const { t } = useI18n();
  const [personas, setPersonas] = useState<AudiencePersona[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [niche, setNiche] = useState('');
  const [channelId, setChannelId] = useState('');

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('audience_personas').select('*').order('created_at', { ascending: false });
    setPersonas(data ?? []);
    setLoading(false);
  }
  useState(() => { load(); });

  async function handleGenerate() {
    setGenerating(true);
    try {
      const result = await generateAudiencePersona({ channelId: channelId || undefined, niche: niche || undefined });
      await supabase.from('audience_personas').insert(result);
      load();
    } catch { /* ignore */ }
    setGenerating(false);
  }

  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><Users size={24} /> Audience Persona Builder</h1>
        <p className="mt-1 text-sm text-slate-500">AI-driven audience profiles with demographics, psychographics, and content preferences</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-2 gap-3">
          <input value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="Niche (e.g. fitness, finance)" className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
          <select value={channelId} onChange={(e) => setChannelId(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option value="">All channels</option>
            {channels.map((ch) => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
          </select>
        </div>
        <button onClick={handleGenerate} disabled={generating} className="mt-3 flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
          {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Generate Persona
        </button>
      </div>

      {personas.map((p) => (
        <div key={p.id} className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-lg font-bold text-white">{p.name.charAt(0)}</div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">{p.name}</h3>
              <p className="text-xs text-slate-400">{p.age_range} · {p.gender} · {p.peak_activity_hours}</p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="mb-2 flex items-center gap-1 text-sm font-medium text-slate-700"><Heart size={14} /> Interests</p>
              <div className="flex flex-wrap gap-1.5">
                {p.interests?.map((interest, i) => <span key={i} className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs text-blue-700">{interest}</span>)}
              </div>
              <p className="mb-2 mt-3 text-sm font-medium text-slate-700">Pain Points</p>
              <div className="space-y-1">
                {p.pain_points?.map((pp, i) => <div key={i} className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-700">{pp}</div>)}
              </div>
            </div>
            <div>
              <p className="mb-2 flex items-center gap-1 text-sm font-medium text-slate-700"><Target size={14} /> Content Preferences</p>
              <div className="flex flex-wrap gap-1.5">
                {p.content_preferences?.map((pref, i) => <span key={i} className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700">{pref}</span>)}
              </div>
              <p className="mb-2 mt-3 flex items-center gap-1 text-sm font-medium text-slate-700"><Clock size={14} /> Behavior</p>
              <div className="space-y-1 text-xs text-slate-600">
                <p>Peak: {p.peak_activity_hours}</p>
                <p>Preferred length: {p.preferred_video_length}</p>
                <p>Engagement: {p.engagement_style}</p>
              </div>
            </div>
          </div>
        </div>
      ))}

      {personas.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 py-16 text-center">
          <Users size={32} className="mx-auto text-slate-300" />
          <p className="mt-2 text-sm text-slate-400">Generate your first audience persona</p>
        </div>
      )}
    </div>
  );
}
