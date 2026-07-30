import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { addTeamMember } from '@/lib/api';
import type { TeamMember } from '@/lib/types';
import { Users, Plus, Loader2, Trash2, Shield, Check, Clock, Mail } from 'lucide-react';

export function TeamWorkspace() {
  const { t } = useI18n();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('editor');

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('team_members').select('*').order('created_at', { ascending: false });
    setMembers(data ?? []);
    setLoading(false);
  }
  useState(() => { load(); });

  async function handleAdd() {
    if (!name.trim()) return;
    setAdding(false);
    await addTeamMember({ name, email: email || undefined, role });
    setName(''); setEmail(''); setRole('editor');
    load();
  }

  const roleColors: Record<string, string> = { admin: 'bg-red-50 text-red-700', editor: 'bg-blue-50 text-blue-700', reviewer: 'bg-amber-50 text-amber-700', viewer: 'bg-slate-50 text-slate-600' };

  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><Users size={24} /> Team Workspace</h1>
          <p className="mt-1 text-sm text-slate-500">Manage team members, roles, and approval workflows</p>
        </div>
        <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
          <Plus size={16} /> Add Member
        </button>
      </div>

      {adding && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="grid grid-cols-3 gap-3">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional)" className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
            <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <option value="admin">Admin</option>
              <option value="editor">Editor</option>
              <option value="reviewer">Reviewer</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={handleAdd} className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">Save</button>
            <button onClick={() => setAdding(false)} className="rounded-lg border border-slate-200 px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {members.map((m) => (
          <div key={m.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white" style={{ backgroundColor: m.avatar_color }}>{m.name.charAt(0)}</div>
                <div>
                  <h3 className="font-semibold text-slate-900">{m.name}</h3>
                  {m.email && <p className="text-xs text-slate-400">{m.email}</p>}
                </div>
              </div>
              <button onClick={async () => { await supabase.from('team_members').delete().eq('id', m.id); load(); }} className="text-slate-300 hover:text-red-500"><Trash2 size={16} /></button>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${roleColors[m.role] || roleColors.viewer}`}>{m.role}</span>
              <span className="flex items-center gap-1 text-xs text-slate-500">
                {m.status === 'active' ? <><Check size={12} className="text-emerald-500" /> Active</> : <><Clock size={12} /> Inactive</>}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1">
              {m.permissions?.map((p) => <span key={p} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{p}</span>)}
            </div>
          </div>
        ))}
      </div>

      {members.length === 0 && !adding && (
        <div className="rounded-xl border border-dashed border-slate-300 py-16 text-center">
          <Users size={32} className="mx-auto text-slate-300" />
          <p className="mt-2 text-sm text-slate-400">Add team members to start collaborating</p>
        </div>
      )}
    </div>
  );
}
