import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { addCollaborationNote } from '@/lib/api';
import type { CollaborationNote } from '@/lib/types';
import { MessageSquare, Plus, Loader2, Check, Clock, AlertCircle, Trash2 } from 'lucide-react';

export function CollaborationNotes() {
  const { t } = useI18n();
  const [notes, setNotes] = useState<CollaborationNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [authorName, setAuthorName] = useState('');
  const [noteText, setNoteText] = useState('');
  const [timestamp, setTimestamp] = useState('');
  const [priority, setPriority] = useState('normal');

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('collaboration_notes').select('*').order('created_at', { ascending: false });
    setNotes(data ?? []);
    setLoading(false);
  }
  useState(() => { load(); });

  async function handleAdd() {
    if (!authorName.trim() || !noteText.trim()) return;
    setAdding(false);
    await addCollaborationNote({
      videoId: '00000000-0000-0000-0000-000000000000',
      authorName,
      noteText,
      timestampSeconds: timestamp ? parseFloat(timestamp) : undefined,
      priority,
    });
    setAuthorName(''); setNoteText(''); setTimestamp(''); setPriority('normal');
    load();
  }

  const priorityColors: Record<string, string> = { high: 'bg-red-50 text-red-700', medium: 'bg-amber-50 text-amber-700', normal: 'bg-slate-50 text-slate-600' };

  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><MessageSquare size={24} /> Collaboration Notes</h1>
          <p className="mt-1 text-sm text-slate-500">Timestamped team feedback and review notes on videos</p>
        </div>
        <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
          <Plus size={16} /> Add Note
        </button>
      </div>

      {adding && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="grid grid-cols-3 gap-3">
            <input value={authorName} onChange={(e) => setAuthorName(e.target.value)} placeholder="Your name" className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
            <input value={timestamp} onChange={(e) => setTimestamp(e.target.value)} type="number" placeholder="Timestamp (seconds)" className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <option value="normal">Normal</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Your feedback..." className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" rows={3} />
          <div className="mt-3 flex gap-2">
            <button onClick={handleAdd} className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">Save</button>
            <button onClick={() => setAdding(false)} className="rounded-lg border border-slate-200 px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {notes.map((n) => (
          <div key={n.id} className={`rounded-xl border p-4 ${n.resolved ? 'border-slate-200 bg-slate-50' : 'border-slate-200 bg-white'}`}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-slate-600 to-slate-800 text-xs font-bold text-white">{n.author_name.charAt(0)}</div>
                <div>
                  <p className="text-sm font-medium text-slate-900">{n.author_name} <span className="text-xs font-normal text-slate-400">· {n.author_role}</span></p>
                  {n.timestamp_seconds != null && <p className="text-xs text-slate-400">at {Math.floor(n.timestamp_seconds / 60)}:{String(Math.floor(n.timestamp_seconds % 60)).padStart(2, '0')}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${priorityColors[n.priority] || priorityColors.normal}`}>{n.priority}</span>
                {n.resolved ? <Check size={16} className="text-emerald-500" /> : <Clock size={16} className="text-slate-300" />}
                <button onClick={async () => { await supabase.from('collaboration_notes').delete().eq('id', n.id); load(); }} className="text-slate-300 hover:text-red-500"><Trash2 size={16} /></button>
              </div>
            </div>
            <p className="mt-2 text-sm text-slate-600">{n.note_text}</p>
          </div>
        ))}
      </div>

      {notes.length === 0 && !adding && (
        <div className="rounded-xl border border-dashed border-slate-300 py-16 text-center">
          <MessageSquare size={32} className="mx-auto text-slate-300" />
          <p className="mt-2 text-sm text-slate-400">Add your first collaboration note</p>
        </div>
      )}
    </div>
  );
}
