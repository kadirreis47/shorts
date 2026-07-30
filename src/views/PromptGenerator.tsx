import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { generatePrompt, savePromptTemplate } from '@/lib/api';
import type { PromptTemplate } from '@/lib/types';
import { Wand2, Loader2, Copy, Star, Plus, Sparkles, FileText, Image as ImageIcon, Mic, Type } from 'lucide-react';

const PROMPT_TYPES = [
  { id: 'script', label: 'Video Script', icon: FileText },
  { id: 'thumbnail', label: 'Thumbnail', icon: ImageIcon },
  { id: 'voiceover', label: 'Voiceover', icon: Mic },
  { id: 'caption', label: 'Caption Text', icon: Type },
  { id: 'title', label: 'Video Title', icon: Type },
  { id: 'description', label: 'Description', icon: FileText },
];

export function PromptGenerator() {
  const { t } = useI18n();
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [promptType, setPromptType] = useState('script');
  const [niche, setNiche] = useState('');
  const [topic, setTopic] = useState('');
  const [tone, setTone] = useState('engaging');
  const [results, setResults] = useState<string[]>([]);
  const [optimized, setOptimized] = useState('');
  const [copied, setCopied] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('prompt_templates').select('*').order('created_at', { ascending: false });
    setTemplates(data ?? []);
    setLoading(false);
  }
  useState(() => { load(); });

  async function handleGenerate() {
    setGenerating(true);
    try {
      const result = await generatePrompt({ promptType, niche: niche || undefined, topic: topic || undefined, tone });
      setResults(result.prompts || []);
      setOptimized(result.optimizedPrompt || '');
    } catch { /* ignore */ }
    setGenerating(false);
  }

  async function handleSave(prompt: string) {
    setSaving(true);
    try {
      await savePromptTemplate({ name: `${promptType} - ${niche || 'general'}`, category: promptType, prompt_type: promptType, template: prompt, niche: niche || undefined });
      load();
    } catch { /* ignore */ }
    setSaving(false);
  }

  function handleCopy(text: string, idx: number) {
    navigator.clipboard.writeText(text);
    setCopied(idx);
    setTimeout(() => setCopied(null), 2000);
  }

  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><Wand2 size={24} /> AI Prompt Generator</h1>
        <p className="mt-1 text-sm text-slate-500">Generate optimized AI prompts for scripts, thumbnails, voiceovers, and more</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <p className="mb-3 text-sm font-medium text-slate-700">Prompt Type</p>
        <div className="mb-4 grid grid-cols-3 gap-2 md:grid-cols-6">
          {PROMPT_TYPES.map((pt) => {
            const Icon = pt.icon;
            return (
              <button key={pt.id} onClick={() => setPromptType(pt.id)} className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs font-medium ${promptType === pt.id ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                <Icon size={18} /> {pt.label}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <input value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="Niche (e.g. fitness)" className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Topic (optional)" className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
          <select value={tone} onChange={(e) => setTone(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option value="engaging">Engaging</option>
            <option value="energetic">Energetic</option>
            <option value="educational">Educational</option>
            <option value="dramatic">Dramatic</option>
            <option value="casual">Casual</option>
            <option value="inspirational">Inspirational</option>
          </select>
        </div>
        <button onClick={handleGenerate} disabled={generating} className="mt-4 flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
          {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Generate Prompts
        </button>
      </div>

      {results.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-700">Generated Prompts</p>
          {results.map((prompt, i) => (
            <div key={i} className={`rounded-xl border p-4 ${i === 0 ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
              <div className="flex items-start justify-between gap-3">
                <p className="flex-1 text-sm text-slate-700">{prompt}</p>
                <div className="flex gap-1">
                  <button onClick={() => handleCopy(prompt, i)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
                    {copied === i ? <span className="text-xs text-emerald-600">Copied!</span> : <Copy size={16} />}
                  </button>
                  <button onClick={() => handleSave(prompt)} disabled={saving} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
                    <Star size={16} />
                  </button>
                </div>
              </div>
              {i === 0 && <span className="mt-2 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">Optimized</span>}
            </div>
          ))}
        </div>
      )}

      {templates.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Saved Templates</p>
          <div className="grid gap-3 md:grid-cols-2">
            {templates.map((tpl) => (
              <div key={tpl.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-900">{tpl.name}</h3>
                    <p className="text-xs text-slate-400 capitalize">{tpl.category} · {tpl.niche || 'General'}</p>
                  </div>
                  <button onClick={() => handleCopy(tpl.template, -1)} className="text-slate-400 hover:text-slate-600"><Copy size={16} /></button>
                </div>
                <p className="mt-2 text-sm text-slate-600 line-clamp-2">{tpl.template}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
