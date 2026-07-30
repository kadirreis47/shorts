import { useEffect, useState } from 'react';
import { Plus, FileText, Tag, TrendingUp, Copy, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Template } from '@/lib/types';
import { Card, Button, Modal, EmptyState } from '@/components/ui';

export function Templates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    setLoading(true);
    const { data } = await supabase.from('templates').select('*').order('usage_count', { ascending: false });
    setTemplates(data ?? []);
    setLoading(false);
  }

  async function deleteTemplate(t: Template) {
    await supabase.from('templates').delete().eq('id', t.id);
    await loadTemplates();
  }

  async function duplicateTemplate(t: Template) {
    await supabase.from('templates').insert({
      name: t.name + ' (copy)',
      type: t.type,
      category: t.category,
      hook_formula: t.hook_formula,
      body_structure: t.body_structure,
      cta: t.cta,
      tags: t.tags,
    });
    await loadTemplates();
  }

  if (loading) return <div className="py-16 text-center text-slate-400">Loading templates…</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Templates</h1>
          <p className="text-sm text-slate-500">{templates.length} reusable content templates</p>
        </div>
        <Button onClick={() => setShowNew(true)}><Plus size={16} /> New Template</Button>
      </div>

      {templates.length === 0 ? (
        <EmptyState icon={<FileText size={24} />} title="No templates yet" description="Create reusable script structures to speed up video generation." action={<Button onClick={() => setShowNew(true)}><Plus size={16} /> New Template</Button>} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <Card key={t.id} className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                    <FileText size={18} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">{t.name}</h3>
                    <p className="text-xs capitalize text-slate-500">{t.type} · {t.category}</p>
                  </div>
                </div>
                <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  <TrendingUp size={12} /> {t.usage_count}
                </span>
              </div>

              {t.hook_formula && (
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Hook Formula</p>
                  <p className="mt-1 rounded-lg bg-slate-50 p-2.5 text-sm text-slate-700">{t.hook_formula}</p>
                </div>
              )}
              {t.body_structure && (
                <div className="mt-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Body Structure</p>
                  <p className="mt-1 text-sm text-slate-600">{t.body_structure}</p>
                </div>
              )}
              {t.cta && (
                <div className="mt-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">CTA</p>
                  <p className="mt-1 text-sm text-slate-600">{t.cta}</p>
                </div>
              )}

              {t.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {t.tags.map((tag) => (
                    <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      <Tag size={10} /> {tag}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-4 flex gap-2 border-t border-slate-100 pt-3">
                <Button size="sm" variant="secondary" onClick={() => duplicateTemplate(t)}>
                  <Copy size={14} /> Duplicate
                </Button>
                <Button size="sm" variant="ghost" onClick={() => deleteTemplate(t)}>
                  <Trash2 size={14} />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <NewTemplateModal open={showNew} onClose={() => setShowNew(false)} onCreated={loadTemplates} />
    </div>
  );
}

function NewTemplateModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('script');
  const [category, setCategory] = useState('');
  const [hookFormula, setHookFormula] = useState('');
  const [bodyStructure, setBodyStructure] = useState('');
  const [cta, setCta] = useState('');
  const [tags, setTags] = useState('');

  async function create() {
    if (!name.trim()) return;
    await supabase.from('templates').insert({
      name, type, category: category || null,
      hook_formula: hookFormula || null, body_structure: bodyStructure || null,
      cta: cta || null, tags: tags ? tags.split(',').map((t) => t.trim()) : [],
    });
    setName(''); setType('script'); setCategory(''); setHookFormula(''); setBodyStructure(''); setCta(''); setTags('');
    onCreated();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="New Template" size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-slate-700">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Listicle Hook"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Type</label>
            <select value={type} onChange={(e) => setType(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400">
              <option value="script">Script</option>
              <option value="thumbnail">Thumbnail</option>
              <option value="hashtags">Hashtags</option>
              <option value="description">Description</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">Category</label>
          <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. education"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">Hook Formula</label>
          <input value={hookFormula} onChange={(e) => setHookFormula(e.target.value)} placeholder="e.g. Did you know that {fact}?"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">Body Structure</label>
          <textarea value={bodyStructure} onChange={(e) => setBodyStructure(e.target.value)} rows={3}
            placeholder="Describe the structure of the main content…"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">CTA</label>
          <input value={cta} onChange={(e) => setCta(e.target.value)} placeholder="e.g. Follow for more tips!"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">Tags (comma-separated)</label>
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="education, facts, viral"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={create} disabled={!name.trim()}>Create Template</Button>
        </div>
      </div>
    </Modal>
  );
}
