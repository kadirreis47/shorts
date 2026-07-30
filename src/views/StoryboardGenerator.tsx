import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { generateStoryboard } from '@/lib/api';
import type { Channel, Storyboard } from '@/lib/types';
import { Clapperboard, Loader2, Sparkles, Film, Camera, ArrowRight } from 'lucide-react';

export function StoryboardGenerator({ channels }: { channels: Channel[] }) {
  const { t } = useI18n();
  const [storyboards, setStoryboards] = useState<Storyboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [script, setScript] = useState('');
  const [visualStyle, setVisualStyle] = useState('modern');
  const [channelId, setChannelId] = useState('');

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('storyboards').select('*').order('created_at', { ascending: false });
    setStoryboards(data ?? []);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function handleGenerate() {
    if (!script.trim()) return;
    setGenerating(true);
    try {
      const result = await generateStoryboard({ script, visualStyle, channelId: channelId || undefined });
      await supabase.from('storyboards').insert(result);
      setScript('');
      load();
    } catch { /* ignore */ }
    setGenerating(false);
  }

  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><Clapperboard size={24} /> AI Storyboard Generator</h1>
        <p className="mt-1 text-sm text-slate-500">Generate visual storyboards from scripts with shot types, camera angles, and transitions</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <textarea value={script} onChange={(e) => setScript(e.target.value)} placeholder="Paste your script here..." className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" rows={4} />
        <div className="mt-3 grid grid-cols-3 gap-3">
          <select value={visualStyle} onChange={(e) => setVisualStyle(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option value="modern">Modern</option>
            <option value="cinematic">Cinematic</option>
            <option value="anime">Anime</option>
            <option value="documentary">Documentary</option>
            <option value="vlog">Vlog Style</option>
          </select>
          <select value={channelId} onChange={(e) => setChannelId(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option value="">All channels</option>
            {channels.map((ch) => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
          </select>
          <button onClick={handleGenerate} disabled={generating || !script.trim()} className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
            {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Generate Storyboard
          </button>
        </div>
      </div>

      {storyboards.map((sb) => (
        <div key={sb.id} className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900 capitalize">{sb.visual_style} Storyboard</h3>
            <span className="text-xs text-slate-400">{sb.estimated_duration}s total</span>
          </div>
          <div className="space-y-3">
            {(sb.scenes as Array<Record<string, unknown>>).map((scene, i) => (
              <div key={i} className="flex gap-4 rounded-lg border border-slate-200 p-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-lg font-bold text-white">{i + 1}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700">{String(scene.shot_type)}</span>
                    <span className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-700">{String(scene.camera_angle)}</span>
                    <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">{String(scene.transition)}</span>
                    <span className="text-xs text-slate-400">{String(scene.duration)}s</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{String(scene.description)}</p>
                  <p className="mt-1 text-xs text-slate-400">Visual: {String(scene.visual_description)}</p>
                  {scene.text_overlay != null && String(scene.text_overlay).trim() !== '' && <p className="mt-1 text-xs font-medium text-slate-500">Text: "{String(scene.text_overlay)}"</p>}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-600"><Camera size={12} /> Shot Types</p>
              <div className="flex flex-wrap gap-1">
                {(sb.shot_types as Array<Record<string, unknown>>).filter((s) => Number(s.count) > 0).map((s, i) => (
                  <span key={i} className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700">{String(s.type)} ({String(s.count)})</span>
                ))}
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="mb-1 text-xs font-medium text-slate-600">Camera Angles</p>
              <div className="flex flex-wrap gap-1">
                {(sb.camera_angles as Array<Record<string, unknown>>).filter((a) => Number(a.count) > 0).map((a, i) => (
                  <span key={i} className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">{String(a.angle)} ({String(a.count)})</span>
                ))}
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="mb-1 text-xs font-medium text-slate-600">Transitions</p>
              <div className="flex flex-wrap gap-1">
                {(sb.transitions as Array<Record<string, unknown>>).filter((tr) => Number(tr.count) > 0).map((tr, i) => (
                  <span key={i} className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-700">{String(tr.type)} ({String(tr.count)})</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      ))}

      {storyboards.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 py-16 text-center">
          <Clapperboard size={32} className="mx-auto text-slate-300" />
          <p className="mt-2 text-sm text-slate-400">Paste a script to generate a storyboard</p>
        </div>
      )}
    </div>
  );
}
