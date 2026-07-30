import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { createFacelessProject } from '@/lib/api';
import type { Channel, FacelessProject } from '@/lib/types';
import { Film, Plus, Loader2, Trash2, Wand2, Music, Mic, Image as ImageIcon, Play, Check } from 'lucide-react';

export function FacelessStudio({ channels }: { channels: Channel[] }) {
  const { t } = useI18n();
  const [projects, setProjects] = useState<FacelessProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [creating, setCreating] = useState(false);
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState('');
  const [niche, setNiche] = useState('');
  const [topic, setTopic] = useState('');
  const [channelId, setChannelId] = useState('');
  const [captionStyle, setCaptionStyle] = useState('karaoke');
  const [musicMood, setMusicMood] = useState('upbeat');

  async function loadProjects() {
    setLoading(true);
    const { data } = await supabase.from('faceless_projects').select('*').order('created_at', { ascending: false });
    setProjects(data ?? []);
    setLoading(false);
  }
  useState(() => { loadProjects(); });

  async function handleCreate() {
    setCreating(true);
    try {
      await createFacelessProject({ channelId: channelId || undefined, title, niche: niche || undefined, topic });
      setShowWizard(false);
      setTitle(''); setNiche(''); setTopic(''); setStep(0);
      loadProjects();
    } catch { /* ignore */ }
    setCreating(false);
  }

  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><Film size={24} /> Faceless Video Studio</h1>
          <p className="mt-1 text-sm text-slate-500">Create complete Shorts with zero filming — stock footage + AI voiceover + captions + music</p>
        </div>
        <button onClick={() => setShowWizard(true)} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
          <Plus size={16} /> New Project
        </button>
      </div>

      {showWizard && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-4 flex items-center gap-2">
            {['Topic', 'Style', 'Voice', 'Music', 'Review'].map((label, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${i <= step ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                  {i < step ? <Check size={14} /> : i + 1}
                </div>
                {i < 4 && <div className={`h-0.5 w-8 ${i < step ? 'bg-emerald-600' : 'bg-slate-200'}`} />}
              </div>
            ))}
          </div>

          {step === 0 && (
            <div className="space-y-3">
              <select value={channelId} onChange={(e) => setChannelId(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <option value="">Select channel (optional)</option>
                {channels.map((ch) => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
              </select>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Project title" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
              <input value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="Niche (e.g. productivity, finance)" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
              <textarea value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="What should the video be about?" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" rows={3} />
            </div>
          )}
          {step === 1 && (
            <div className="space-y-3">
              <label className="text-sm font-medium text-slate-700">Caption Style</label>
              <div className="grid grid-cols-4 gap-2">
                {['karaoke', 'highlight', 'classic', 'minimal'].map((s) => (
                  <button key={s} onClick={() => setCaptionStyle(s)} className={`rounded-lg border p-3 text-sm font-medium capitalize ${captionStyle === s ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{s}</button>
                ))}
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
                <Mic size={20} className="text-slate-400" />
                <div><p className="text-sm font-medium text-slate-700">AI Voiceover</p><p className="text-xs text-slate-500">Auto-generated from script</p></div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
                <ImageIcon size={20} className="text-slate-400" />
                <div><p className="text-sm font-medium text-slate-700">Stock Footage</p><p className="text-xs text-slate-500">Auto-fetched from Pexels</p></div>
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="space-y-3">
              <label className="text-sm font-medium text-slate-700">Music Mood</label>
              <div className="grid grid-cols-3 gap-2">
                {['upbeat', 'calm', 'dramatic', 'inspiring', 'funny', 'dark'].map((m) => (
                  <button key={m} onClick={() => setMusicMood(m)} className={`rounded-lg border p-3 text-sm font-medium capitalize ${musicMood === m ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{m}</button>
                ))}
              </div>
            </div>
          )}
          {step === 4 && (
            <div className="space-y-2 rounded-lg bg-slate-50 p-4 text-sm">
              <p><span className="font-medium text-slate-700">Title:</span> {title}</p>
              <p><span className="font-medium text-slate-700">Niche:</span> {niche || 'General'}</p>
              <p><span className="font-medium text-slate-700">Topic:</span> {topic}</p>
              <p><span className="font-medium text-slate-700">Caption:</span> <span className="capitalize">{captionStyle}</span></p>
              <p><span className="font-medium text-slate-700">Music:</span> <span className="capitalize">{musicMood}</span></p>
            </div>
          )}

          <div className="mt-4 flex justify-between">
            <button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} className="rounded-lg border border-slate-200 px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50">Back</button>
            {step < 4 ? (
              <button onClick={() => setStep(step + 1)} disabled={step === 0 && !title.trim()} className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">Continue</button>
            ) : (
              <button onClick={handleCreate} disabled={creating} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} Create Project
              </button>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => (
          <div key={p.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-slate-900">{p.title}</h3>
                <p className="text-xs text-slate-400">{p.niche || 'General'}</p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${p.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{p.status}</span>
            </div>
            <p className="mt-2 text-sm text-slate-600">{p.topic}</p>
            <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1"><Music size={12} /> {p.music_mood || 'upbeat'}</span>
              <span className="flex items-center gap-1"><Mic size={12} /> AI voice</span>
            </div>
          </div>
        ))}
      </div>

      {projects.length === 0 && !showWizard && (
        <div className="rounded-xl border border-dashed border-slate-300 py-16 text-center">
          <Film size={32} className="mx-auto text-slate-300" />
          <p className="mt-2 text-sm text-slate-400">Create your first faceless video project</p>
        </div>
      )}
    </div>
  );
}
