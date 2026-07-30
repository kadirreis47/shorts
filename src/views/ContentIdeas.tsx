import { useEffect, useState } from 'react';
import { Lightbulb, Plus, Archive, ArrowUpRight, ScanLine, Loader2, Sparkles, MessageCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Channel, ContentIdea, Comment } from '@/lib/types';
import { Card, Button, EmptyState } from '@/components/ui';
import { timeAgo, classNames } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

interface ContentIdeasProps {
  channels: Channel[];
}

export function ContentIdeas({ channels }: ContentIdeasProps) {
  const { t } = useI18n();
  const [ideas, setIdeas] = useState<ContentIdea[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [scanResult, setScanResult] = useState<number | null>(null);

  useEffect(() => { loadIdeas(); }, []);

  async function loadIdeas() {
    setLoading(true);
    const { data } = await supabase.from('content_ideas').select('*').order('created_at', { ascending: false });
    setIdeas(data ?? []);
    setLoading(false);
  }

  async function scanComments() {
    setScanning(true);
    setScanResult(null);
    try {
      const { data: comments } = await supabase.from('comments').select('*').eq('is_reply', false).order('created_at', { ascending: false }).limit(200);
      if (!comments || comments.length === 0) { setScanning(false); return; }

      // Extract questions and topic requests from comments
      const questionPatterns = [
        /\b(can you|could you|please make|do a video|video about|make a video|you should|wish you|hope you|next video|more about|explain|how do|what is|why does|tell us about)\b/i,
      ];

      const foundIdeas: { topic: string; angle: string; source_id: string; score: number }[] = [];
      for (const c of comments as Comment[]) {
        const isQuestion = questionPatterns.some((p) => p.test(c.text));
        if (isQuestion) {
          const topic = c.text.length > 80 ? c.text.slice(0, 80) + '...' : c.text;
          foundIdeas.push({
            topic,
            angle: 'From audience question',
            source_id: c.id,
            score: c.likes + 1,
          });
        }
      }

      // Deduplicate and insert
      const unique = foundIdeas.filter((idea, idx, self) => idx === self.findIndex((i) => i.topic === idea.topic));
      for (const idea of unique.slice(0, 20)) {
        await supabase.from('content_ideas').insert({
          source: 'comment',
          source_id: idea.source_id,
          topic: idea.topic,
          angle: idea.angle,
          priority: Math.min(10, Math.ceil(idea.score / 5)),
          status: 'pending',
          score: idea.score,
        });
      }

      setScanResult(unique.length);
      loadIdeas();
    } catch { /* ignore */ }
    setScanning(false);
  }

  async function addIdea(topic: string, angle: string) {
    if (!topic.trim()) return;
    await supabase.from('content_ideas').insert({
      source: 'manual',
      topic: topic.trim(),
      angle: angle.trim() || null,
      priority: 5,
      status: 'pending',
      score: 0,
    });
    setShowAdd(false);
    loadIdeas();
  }

  async function updateStatus(id: string, status: string) {
    await supabase.from('content_ideas').update({ status }).eq('id', id);
    loadIdeas();
  }

  const channelMap = new Map(channels.map((c) => [c.id, c]));
  const pending = ideas.filter((i) => i.status === 'pending');
  const used = ideas.filter((i) => i.status === 'used');
  const archived = ideas.filter((i) => i.status === 'archived');

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('ideas.title')}</h1>
          <p className="text-sm text-slate-500">{t('ideas.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={scanComments} disabled={scanning}>
            {scanning ? <Loader2 size={16} className="animate-spin" /> : <ScanLine size={16} />}
            {scanning ? t('ideas.scanning') : t('ideas.scanComments')}
          </Button>
          <Button onClick={() => setShowAdd(true)}>
            <Plus size={16} /> {t('ideas.addIdea')}
          </Button>
        </div>
      </div>

      {scanResult !== null && scanResult > 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          <Sparkles size={16} />
          {t('ideas.found', { count: scanResult })}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4"><p className="text-2xl font-bold text-slate-900">{pending.length}</p><p className="text-xs text-slate-500">{t('ideas.pending')}</p></Card>
        <Card className="p-4"><p className="text-2xl font-bold text-slate-900">{used.length}</p><p className="text-xs text-slate-500">{t('ideas.used')}</p></Card>
        <Card className="p-4"><p className="text-2xl font-bold text-slate-900">{archived.length}</p><p className="text-xs text-slate-500">{t('ideas.archived')}</p></Card>
      </div>

      {loading ? (
        <div className="py-16 text-center text-slate-400">{t('common.loading')}</div>
      ) : ideas.length === 0 ? (
        <EmptyState icon={<Lightbulb size={24} />} title={t('ideas.noIdeas')} description={t('ideas.noIdeasDesc')} />
      ) : (
        <div className="space-y-2">
          {ideas.map((idea) => (
            <Card key={idea.id} className="p-4">
              <div className="flex items-start gap-3">
                <div className={classNames('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                  idea.source === 'comment' ? 'bg-blue-50 text-blue-600' : idea.source === 'trend' ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500')}>
                  {idea.source === 'comment' ? <MessageCircle size={16} /> : <Lightbulb size={16} />}
                </div>
                <div className="min-0 flex-1">
                  <p className="text-sm font-medium text-slate-800">{idea.topic}</p>
                  {idea.angle && <p className="text-xs text-slate-500">{idea.angle}</p>}
                  <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                    <span className="capitalize">{t(`ideas.${idea.source === 'comment' ? 'fromComments' : idea.source === 'trend' ? 'fromTrends' : 'manual'}`)}</span>
                    <span>·</span>
                    <span>{timeAgo(idea.created_at)}</span>
                    {idea.score > 0 && <><span>·</span><span>Score: {idea.score}</span></>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {idea.status === 'pending' && (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => updateStatus(idea.id, 'used')}>
                        <ArrowUpRight size={14} /> {t('ideas.useIdea')}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => updateStatus(idea.id, 'archived')}>
                        <Archive size={14} />
                      </Button>
                    </>
                  )}
                  {idea.status === 'used' && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">{t('ideas.used')}</span>}
                  {idea.status === 'archived' && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{t('ideas.archived')}</span>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showAdd && <AddIdeaModal onClose={() => setShowAdd(false)} onAdd={addIdea} />}
    </div>
  );
}

function AddIdeaModal({ onClose, onAdd }: { onClose: () => void; onAdd: (topic: string, angle: string) => void }) {
  const { t } = useI18n();
  const [topic, setTopic] = useState('');
  const [angle, setAngle] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 text-lg font-semibold text-slate-900">{t('ideas.addIdea')}</h3>
        <div className="space-y-3">
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={t('ideas.addTopic')}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
          <input value={angle} onChange={(e) => setAngle(e.target.value)} placeholder={t('ideas.addAngle')}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>{t('videos.cancel')}</Button>
            <Button onClick={() => onAdd(topic, angle)} disabled={!topic.trim()}>{t('ideas.add')}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
