import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { generateAvatar } from '@/lib/api';
import { UserCircle, Plus, Loader2, Trash2, Sparkles } from 'lucide-react';
import type { AvatarPreset } from '@/lib/types';

export function AvatarPresets() {
  const { t } = useI18n();
  const [avatars, setAvatars] = useState<AvatarPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [style, setStyle] = useState('professional');

  async function loadAvatars() {
    setLoading(true);
    const { data } = await supabase.from('avatar_presets').select('*').order('created_at', { ascending: false });
    setAvatars(data ?? []);
    setLoading(false);
  }

  useState(() => { loadAvatars(); });

  async function handleCreate() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      await generateAvatar({ name, style });
      setName('');
      loadAvatars();
    } catch { /* ignore */ }
    setCreating(false);
  }

  async function handleDelete(id: string) {
    await supabase.from('avatar_presets').delete().eq('id', id);
    loadAvatars();
  }

  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><UserCircle size={24} /> {t('avatars.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('avatars.desc')}</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="font-semibold text-slate-900">{t('avatars.create')}</h3>
        <div className="mt-3 flex items-end gap-3">
          <div className="flex-1">
            <label className="text-xs font-medium text-slate-500">{t('avatars.name')}</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('avatars.namePlaceholder')}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">{t('avatars.style')}</label>
            <select value={style} onChange={(e) => setStyle(e.target.value)}
              className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400">
              <option value="professional">Professional</option>
              <option value="casual">Casual</option>
              <option value="energetic">Energetic</option>
              <option value="friendly">Friendly</option>
              <option value="authoritative">Authoritative</option>
            </select>
          </div>
          <button onClick={handleCreate} disabled={creating || !name.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
            {creating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} {t('avatars.generate')}
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {avatars.map((avatar) => (
          <div key={avatar.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="relative">
              <img src={avatar.face_image_url} alt={avatar.name} className="aspect-square w-full rounded-lg object-cover" />
              <button onClick={() => handleDelete(avatar.id)} className="absolute right-2 top-2 rounded-lg bg-white/80 p-1 text-slate-400 hover:text-red-500">
                <Trash2 size={14} />
              </button>
            </div>
            <h3 className="mt-2 font-medium text-slate-900">{avatar.name}</h3>
            <p className="text-xs text-slate-400">{avatar.style}</p>
            {avatar.is_custom && <span className="mt-1 inline-block rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700">{t('avatars.custom')}</span>}
          </div>
        ))}
      </div>

      {avatars.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 py-16 text-center">
          <UserCircle size={32} className="mx-auto text-slate-300" />
          <p className="mt-2 text-sm text-slate-400">{t('avatars.empty')}</p>
        </div>
      )}
    </div>
  );
}
