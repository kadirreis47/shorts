import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { Palette, Plus, Loader2, Check, Trash2, Star } from 'lucide-react';
import type { BrandKit } from '@/lib/types';

export function BrandKitView() {
  const { t } = useI18n();
  const [kits, setKits] = useState<BrandKit[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '', primary_color: '#10b981', secondary_color: '#1e293b', accent_color: '#f59e0b',
    font_family: 'Inter', watermark_text: '', watermark_position: 'bottom-right',
    caption_style: 'karaoke', caption_text_color: '#ffffff', caption_highlight_color: '#10b981',
  });

  async function loadKits() {
    setLoading(true);
    const { data } = await supabase.from('brand_kits').select('*').order('created_at', { ascending: false });
    setKits(data ?? []);
    setLoading(false);
  }

  useState(() => { loadKits(); });

  async function handleSave() {
    if (!form.name.trim()) return;
    await supabase.from('brand_kits').insert(form);
    setShowForm(false);
    setForm({ ...form, name: '' });
    loadKits();
  }

  async function handleSetDefault(id: string) {
    await supabase.from('brand_kits').update({ is_default: false }).neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('brand_kits').update({ is_default: true }).eq('id', id);
    loadKits();
  }

  async function handleDelete(id: string) {
    await supabase.from('brand_kits').delete().eq('id', id);
    loadKits();
  }

  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><Palette size={24} /> {t('brandkit.title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('brandkit.desc')}</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
          <Plus size={16} /> {t('brandkit.create')}
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="font-semibold text-slate-900">{t('brandkit.newKit')}</h3>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-500">{t('brandkit.name')}</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">{t('brandkit.font')}</label>
              <select value={form.font_family} onChange={(e) => setForm({ ...form, font_family: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400">
                <option>Inter</option><option>Poppins</option><option>Roboto</option><option>Montserrat</option><option>DM Sans</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">{t('brandkit.primaryColor')}</label>
              <div className="mt-1 flex items-center gap-2">
                <input type="color" value={form.primary_color} onChange={(e) => setForm({ ...form, primary_color: e.target.value })} className="h-8 w-8 cursor-pointer rounded border border-slate-200" />
                <input value={form.primary_color} onChange={(e) => setForm({ ...form, primary_color: e.target.value })} className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">{t('brandkit.accentColor')}</label>
              <div className="mt-1 flex items-center gap-2">
                <input type="color" value={form.accent_color} onChange={(e) => setForm({ ...form, accent_color: e.target.value })} className="h-8 w-8 cursor-pointer rounded border border-slate-200" />
                <input value={form.accent_color} onChange={(e) => setForm({ ...form, accent_color: e.target.value })} className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">{t('brandkit.watermark')}</label>
              <input value={form.watermark_text} onChange={(e) => setForm({ ...form, watermark_text: e.target.value })} placeholder="@yourchannel" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">{t('brandkit.captionStyle')}</label>
              <select value={form.caption_style} onChange={(e) => setForm({ ...form, caption_style: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400">
                <option value="karaoke">Karaoke</option><option value="highlight">Highlight</option><option value="classic">Classic</option><option value="minimal">Minimal</option>
              </select>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={handleSave} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"><Check size={16} /> {t('common.save')}</button>
            <button onClick={() => setShowForm(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">{t('common.cancel')}</button>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {kits.map((kit) => (
          <div key={kit.id} className={`rounded-xl border-2 bg-white p-4 ${kit.is_default ? 'border-emerald-500' : 'border-slate-200'}`}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                {kit.is_default && <Star size={16} className="fill-emerald-500 text-emerald-500" />}
                <h3 className="font-semibold text-slate-900">{kit.name}</h3>
              </div>
              <button onClick={() => handleDelete(kit.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={16} /></button>
            </div>
            <div className="mt-3 flex gap-2">
              <div className="h-10 w-10 rounded-lg" style={{ backgroundColor: kit.primary_color }} />
              <div className="h-10 w-10 rounded-lg" style={{ backgroundColor: kit.secondary_color }} />
              <div className="h-10 w-10 rounded-lg" style={{ backgroundColor: kit.accent_color }} />
            </div>
            <div className="mt-3 space-y-1 text-xs text-slate-500">
              <p>{t('brandkit.font')}: {kit.font_family}</p>
              <p>{t('brandkit.captionStyle')}: {kit.caption_style}</p>
              {kit.watermark_text && <p>{t('brandkit.watermark')}: {kit.watermark_text}</p>}
            </div>
            {!kit.is_default && (
              <button onClick={() => handleSetDefault(kit.id)} className="mt-3 w-full rounded-lg border border-slate-200 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                {t('brandkit.setDefault')}
              </button>
            )}
          </div>
        ))}
      </div>

      {kits.length === 0 && !showForm && (
        <div className="rounded-xl border border-dashed border-slate-300 py-16 text-center">
          <Palette size={32} className="mx-auto text-slate-300" />
          <p className="mt-2 text-sm text-slate-400">{t('brandkit.empty')}</p>
        </div>
      )}
    </div>
  );
}
