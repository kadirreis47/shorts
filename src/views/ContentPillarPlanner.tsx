import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { createContentPillar } from '@/lib/api';
import type { Channel, ContentPillar } from '@/lib/types';
import { LayoutGrid, Plus, Loader2, Trash2, PieChart } from 'lucide-react';

export function ContentPillarPlanner({ channels }: { channels: Channel[] }) {
  const { t } = useI18n();
  const [pillars, setPillars] = useState<ContentPillar[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [pillarType, setPillarType] = useState('educational');
  const [targetPct, setTargetPct] = useState('25');
  const [color, setColor] = useState('#10b981');
  const [channelId, setChannelId] = useState('');

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('content_pillars').select('*').order('created_at', { ascending: false });
    setPillars(data ?? []);
    setLoading(false);
  }
  useState(() => { load(); });

  async function handleAdd() {
    if (!name.trim()) return;
    setAdding(false);
    await createContentPillar({
      channelId: channelId || undefined,
      name, description: description || undefined,
      pillarType, targetPercentage: parseFloat(targetPct) || 25, color,
    });
    setName(''); setDescription(''); setTargetPct('25');
    load();
  }

  const pillarTypes = ['educational', 'entertainment', 'inspirational', 'promotional', 'behind-the-scenes', 'community'];

  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-slate-400" /></div>;

  const totalPct = pillars.reduce((sum, p) => sum + p.target_percentage, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><LayoutGrid size={24} /> Content Pillar Planner</h1>
          <p className="mt-1 text-sm text-slate-500">Strategic content planning with topic clusters and target distribution</p>
        </div>
        <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
          <Plus size={16} /> Add Pillar
        </button>
      </div>

      {pillars.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-3 flex items-center justify-between">
            <p className="flex items-center gap-1 text-sm font-medium text-slate-700"><PieChart size={16} /> Content Distribution</p>
            <span className="text-xs text-slate-400">Total: {totalPct}%</span>
          </div>
          <div className="flex h-8 overflow-hidden rounded-lg">
            {pillars.map((p) => (
              <div key={p.id} style={{ width: `${p.target_percentage}%`, backgroundColor: p.color }} className="flex items-center justify-center text-xs font-medium text-white" title={`${p.name}: ${p.target_percentage}%`}>
                {p.target_percentage > 10 && p.name}
              </div>
            ))}
          </div>
        </div>
      )}

      {adding && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pillar name" className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
            <select value={pillarType} onChange={(e) => setPillarType(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
              {pillarTypes.map((pt) => <option key={pt} value={pt} className="capitalize">{pt}</option>)}
            </select>
            <input value={targetPct} onChange={(e) => setTargetPct(e.target.value)} type="number" placeholder="Target %" className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className="col-span-2 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
            <div className="flex items-center gap-2">
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-8 w-12 rounded border border-slate-200" />
              <select value={channelId} onChange={(e) => setChannelId(e.target.value)} className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <option value="">All channels</option>
                {channels.map((ch) => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
              </select>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={handleAdd} className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">Save</button>
            <button onClick={() => setAdding(false)} className="rounded-lg border border-slate-200 px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {pillars.map((p) => (
          <div key={p.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded" style={{ backgroundColor: p.color }} />
                <div>
                  <h3 className="font-semibold text-slate-900">{p.name}</h3>
                  <p className="text-xs text-slate-400 capitalize">{p.pillar_type}</p>
                </div>
              </div>
              <button onClick={async () => { await supabase.from('content_pillars').delete().eq('id', p.id); load(); }} className="text-slate-300 hover:text-red-500"><Trash2 size={16} /></button>
            </div>
            {p.description && <p className="mt-2 text-sm text-slate-600">{p.description}</p>}
            <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
              <span>Target: {p.target_percentage}%</span>
              <span>{p.video_count} videos</span>
              <span>{(p.total_views / 1000).toFixed(1)}K views</span>
            </div>
          </div>
        ))}
      </div>

      {pillars.length === 0 && !adding && (
        <div className="rounded-xl border border-dashed border-slate-300 py-16 text-center">
          <LayoutGrid size={32} className="mx-auto text-slate-300" />
          <p className="mt-2 text-sm text-slate-400">Create your first content pillar</p>
        </div>
      )}
    </div>
  );
}
