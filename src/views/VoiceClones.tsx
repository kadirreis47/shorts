import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { cloneVoice } from '@/lib/api';
import { Mic, Plus, Loader2, Trash2, Check, Clock } from 'lucide-react';
import type { VoiceClone } from '@/lib/types';

export function VoiceClones() {
  const { t } = useI18n();
  const [clones, setClones] = useState<VoiceClone[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [language, setLanguage] = useState('en');
  const [cloning, setCloning] = useState(false);

  async function loadClones() {
    setLoading(true);
    const { data } = await supabase.from('voice_clones').select('*').order('created_at', { ascending: false });
    setClones(data ?? []);
    setLoading(false);
  }

  useState(() => { loadClones(); });

  async function handleClone() {
    if (!name.trim() || !audioUrl.trim()) return;
    setCloning(true);
    try {
      await cloneVoice({ name, sampleAudioUrl: audioUrl, language });
      setName(''); setAudioUrl(''); setShowForm(false);
      setTimeout(() => loadClones(), 2000);
    } catch { /* ignore */ }
    setCloning(false);
  }

  async function handleDelete(id: string) {
    await supabase.from('voice_clones').delete().eq('id', id);
    loadClones();
  }

  const statusColors: Record<string, string> = {
    pending: 'bg-slate-100 text-slate-500', training: 'bg-amber-100 text-amber-700',
    ready: 'bg-emerald-100 text-emerald-700', failed: 'bg-red-100 text-red-700',
  };

  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><Mic size={24} /> {t('voiceclone.title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('voiceclone.desc')}</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
          <Plus size={16} /> {t('voiceclone.clone')}
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500">{t('voiceclone.name')}</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Voice"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">{t('voiceclone.audioUrl')}</label>
              <input value={audioUrl} onChange={(e) => setAudioUrl(e.target.value)} placeholder="https://..."
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">{t('voiceclone.language')}</label>
              <select value={language} onChange={(e) => setLanguage(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400">
                <option value="en">English</option><option value="es">Spanish</option><option value="fr">French</option>
                <option value="de">German</option><option value="tr">Turkish</option><option value="ja">Japanese</option>
              </select>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={handleClone} disabled={cloning || !name.trim() || !audioUrl.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
              {cloning ? <Loader2 size={16} className="animate-spin" /> : <Mic size={16} />} {t('voiceclone.startClone')}
            </button>
            <button onClick={() => setShowForm(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">{t('common.cancel')}</button>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {clones.map((clone) => (
          <div key={clone.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50">
                  <Mic size={18} className="text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-medium text-slate-900">{clone.name}</h3>
                  <p className="text-xs text-slate-400">{clone.language}</p>
                </div>
              </div>
              <button onClick={() => handleDelete(clone.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={16} /></button>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className={`rounded px-2 py-0.5 text-xs ${statusColors[clone.status]}`}>{clone.status}</span>
              {clone.status === 'ready' && <Check size={14} className="text-emerald-500" />}
              {clone.status === 'training' && <Clock size={14} className="text-amber-500" />}
            </div>
          </div>
        ))}
      </div>

      {clones.length === 0 && !showForm && (
        <div className="rounded-xl border border-dashed border-slate-300 py-16 text-center">
          <Mic size={32} className="mx-auto text-slate-300" />
          <p className="mt-2 text-sm text-slate-400">{t('voiceclone.empty')}</p>
        </div>
      )}
    </div>
  );
}
