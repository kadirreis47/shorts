import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import type { ScriptTemplateLib } from '@/lib/types';
import { FileText, Loader2, Search, TrendingUp, Clock, Eye } from 'lucide-react';

export function ScriptLibrary() {
  const { t } = useI18n();
  const [templates, setTemplates] = useState<ScriptTemplateLib[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [nicheFilter, setNicheFilter] = useState('');

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('script_template_library').select('*').order('proven_views', { ascending: false });
    setTemplates(data ?? []);
    setLoading(false);
  }
  useState(() => { load(); });

  const niches = [...new Set(templates.map((t) => t.niche))];
  const filtered = templates.filter((t) =>
    (!search || t.name.toLowerCase().includes(search.toLowerCase())) &&
    (!nicheFilter || t.niche === nicheFilter)
  );

  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><FileText size={24} /> Script Template Library</h1>
        <p className="mt-1 text-sm text-slate-500">Niche-specific proven script templates with retention data</p>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search templates..." className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-slate-400" />
        </div>
        <select value={nicheFilter} onChange={(e) => setNicheFilter(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
          <option value="">All niches</option>
          {niches.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((tpl) => (
          <div key={tpl.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-slate-900">{tpl.name}</h3>
                <p className="text-xs text-slate-400">{tpl.niche}</p>
              </div>
              {tpl.is_premium && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">PRO</span>}
            </div>
            <div className="mt-3 flex gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1"><Eye size={12} /> {(tpl.proven_views / 1000).toFixed(0)}K views</span>
              <span className="flex items-center gap-1"><TrendingUp size={12} /> {tpl.retention_rate}% retention</span>
              <span className="flex items-center gap-1"><Clock size={12} /> {tpl.duration_seconds}s</span>
            </div>
            {tpl.hook_formula && <p className="mt-2 rounded-lg bg-blue-50 px-2 py-1 text-xs text-blue-700">Hook: {tpl.hook_formula}</p>}
            {tpl.template_text && <p className="mt-2 text-sm text-slate-600 line-clamp-3">{tpl.template_text}</p>}
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-slate-400">{tpl.scene_count} scenes</span>
              {tpl.tone && <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600 capitalize">{tpl.tone}</span>}
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 py-16 text-center">
          <FileText size={32} className="mx-auto text-slate-300" />
          <p className="mt-2 text-sm text-slate-400">No templates found</p>
        </div>
      )}
    </div>
  );
}
