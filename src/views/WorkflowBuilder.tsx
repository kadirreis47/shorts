import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { saveWorkflowAutomation } from '@/lib/api';
import type { Channel, WorkflowAutomation } from '@/lib/types';
import { Zap, Plus, Loader2, Trash2, Play, Pause, GitBranch, ArrowRight, Check } from 'lucide-react';

const TRIGGERS = [
  { id: 'trend_detected', label: 'Trend Detected', icon: 'TrendingUp' },
  { id: 'new_video', label: 'New Video Created', icon: 'Video' },
  { id: 'scheduled', label: 'Scheduled Post', icon: 'Calendar' },
  { id: 'comment_spike', label: 'Comment Spike', icon: 'MessageSquare' },
];

const ACTIONS = [
  { id: 'generate_script', label: 'Generate Script' },
  { id: 'generate_voiceover', label: 'Generate Voiceover' },
  { id: 'generate_thumbnail', label: 'Generate Thumbnail' },
  { id: 'generate_seo', label: 'Generate SEO' },
  { id: 'schedule_post', label: 'Schedule Post' },
  { id: 'fetch_broll', label: 'Fetch B-Roll' },
];

export function WorkflowBuilder({ channels }: { channels: Channel[] }) {
  const { t } = useI18n();
  const [workflows, setWorkflows] = useState<WorkflowAutomation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState('trend_detected');
  const [selectedSteps, setSelectedSteps] = useState<string[]>([]);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('workflow_automations').select('*').order('created_at', { ascending: false });
    setWorkflows(data ?? []);
    setLoading(false);
  }
  useState(() => { load(); });

  async function handleCreate() {
    if (!name.trim()) return;
    await saveWorkflowAutomation({
      name,
      trigger: { type: trigger },
      steps: selectedSteps.map((s, i) => ({ action: s, order: i + 1 })),
    });
    setShowBuilder(false); setName(''); setSelectedSteps([]);
    load();
  }

  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><Zap size={24} /> Workflow Builder</h1>
          <p className="mt-1 text-sm text-slate-500">Build automated pipelines: trigger → script → voiceover → thumbnail → publish</p>
        </div>
        <button onClick={() => setShowBuilder(true)} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
          <Plus size={16} /> New Workflow
        </button>
      </div>

      {showBuilder && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Workflow name" className="mb-4 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
          <p className="mb-2 text-sm font-medium text-slate-700">1. Choose a trigger</p>
          <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
            {TRIGGERS.map((tr) => (
              <button key={tr.id} onClick={() => setTrigger(tr.id)} className={`rounded-lg border p-3 text-sm font-medium ${trigger === tr.id ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{tr.label}</button>
            ))}
          </div>
          <p className="mb-2 text-sm font-medium text-slate-700">2. Add action steps</p>
          <div className="mb-4 flex flex-wrap gap-2">
            {ACTIONS.map((a) => {
              const selected = selectedSteps.includes(a.id);
              return (
                <button key={a.id} onClick={() => setSelectedSteps(selected ? selectedSteps.filter((s) => s !== a.id) : [...selectedSteps, a.id])} className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${selected ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                  {selected ? <Check size={14} className="mr-1 inline" /> : <Plus size={14} className="mr-1 inline" />}{a.label}
                </button>
              );
            })}
          </div>
          {selectedSteps.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-1 rounded-lg bg-slate-50 p-3">
              <span className="rounded bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700">{TRIGGERS.find((tr) => tr.id === trigger)?.label}</span>
              {selectedSteps.map((s, i) => (
                <div key={i} className="flex items-center gap-1">
                  <ArrowRight size={12} className="text-slate-400" />
                  <span className="rounded bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">{ACTIONS.find((a) => a.id === s)?.label}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={handleCreate} className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">Create Workflow</button>
            <button onClick={() => setShowBuilder(false)} className="rounded-lg border border-slate-200 px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {workflows.map((w) => (
          <div key={w.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <GitBranch size={20} className="text-slate-400" />
                <div>
                  <h3 className="font-semibold text-slate-900">{w.name}</h3>
                  <p className="text-xs text-slate-400">{w.run_count} runs · {w.success_count} successes</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${w.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{w.status}</span>
                <button onClick={async () => { await supabase.from('workflow_automations').delete().eq('id', w.id); load(); }} className="text-slate-300 hover:text-red-500"><Trash2 size={16} /></button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1">
              <span className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700">{(w.trigger as Record<string, string>)?.type || 'trigger'}</span>
              {(w.steps as Array<Record<string, unknown>>).map((s, i) => (
                <div key={i} className="flex items-center gap-1">
                  <ArrowRight size={12} className="text-slate-300" />
                  <span className="rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-700">{String(s.action || '')}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {workflows.length === 0 && !showBuilder && (
        <div className="rounded-xl border border-dashed border-slate-300 py-16 text-center">
          <Zap size={32} className="mx-auto text-slate-300" />
          <p className="mt-2 text-sm text-slate-400">Build your first automation workflow</p>
        </div>
      )}
    </div>
  );
}


