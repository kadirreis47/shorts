import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { createIntroOutro } from '@/lib/api';
import type { Channel, IntroOutroDesign } from '@/lib/types';
import { Clapperboard, Plus, Loader2, Trash2, Play, Film } from 'lucide-react';

export function IntroOutroDesigner({ channels }: { channels: Channel[] }) {
  const { t } = useI18n();
  const [designs, setDesigns] = useState<IntroOutroDesign[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState('intro');
  const [animationStyle, setAnimationStyle] = useState('slide-in');
  const [textContent, setTextContent] = useState('');
  const [bgColor, setBgColor] = useState('#0f172a');
  const [accentColor, setAccentColor] = useState('#10b981');
  const [channelId, setChannelId] = useState('');

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('intro_outro_designs').select('*').order('created_at', { ascending: false });
    setDesigns(data ?? []);
    setLoading(false);
  }
  useState(() => { load(); });

  async function handleAdd() {
    if (!name.trim()) return;
    setAdding(false);
    await createIntroOutro({ channelId: channelId || undefined, name, type, animationStyle, textContent: textContent || undefined, backgroundColor: bgColor, accentColor });
    setName(''); setTextContent('');
    load();
  }

  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><Clapperboard size={24} /> Intro/Outro Designer</h1>
          <p className="mt-1 text-sm text-slate-500">Create animated video intros and outros with custom colors and styles</p>
        </div>
        <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
          <Plus size={16} /> New Design
        </button>
      </div>

      {adding && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Design name" className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
            <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <option value="intro">Intro</option>
              <option value="outro">Outro</option>
            </select>
            <select value={animationStyle} onChange={(e) => setAnimationStyle(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <option value="slide-in">Slide In</option>
              <option value="fade">Fade</option>
              <option value="zoom">Zoom</option>
              <option value="bounce">Bounce</option>
              <option value="glitch">Glitch</option>
            </select>
            <input value={textContent} onChange={(e) => setTextContent(e.target.value)} placeholder="Text content (e.g. @YourChannel)" className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500">BG</label>
              <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="h-8 w-12 rounded border border-slate-200" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500">Accent</label>
              <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="h-8 w-12 rounded border border-slate-200" />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={handleAdd} className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">Save</button>
            <button onClick={() => setAdding(false)} className="rounded-lg border border-slate-200 px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {designs.map((d) => (
          <div key={d.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <Film size={18} className="text-slate-400" />
                <div>
                  <h3 className="font-semibold text-slate-900">{d.name}</h3>
                  <p className="text-xs text-slate-400 capitalize">{d.type} · {d.animation_style}</p>
                </div>
              </div>
              <button onClick={async () => { await supabase.from('intro_outro_designs').delete().eq('id', d.id); load(); }} className="text-slate-300 hover:text-red-500"><Trash2 size={16} /></button>
            </div>
            <div className="mt-3 aspect-video rounded-lg flex items-center justify-center" style={{ backgroundColor: d.background_color }}>
              <div className="text-center">
                <p className="text-lg font-bold" style={{ color: d.text_color }}>{d.text_content || d.name}</p>
                <div className="mt-1 h-1 w-16 mx-auto rounded-full" style={{ backgroundColor: d.accent_color }} />
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-400">{d.duration_seconds}s duration</p>
          </div>
        ))}
      </div>

      {designs.length === 0 && !adding && (
        <div className="rounded-xl border border-dashed border-slate-300 py-16 text-center">
          <Clapperboard size={32} className="mx-auto text-slate-300" />
          <p className="mt-2 text-sm text-slate-400">Create your first intro or outro design</p>
        </div>
      )}
    </div>
  );
}
