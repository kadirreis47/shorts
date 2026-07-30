import { useEffect, useState } from 'react';
import { MessageCircle, Heart, Reply, Check, Filter, Smile, Frown, Meh } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Comment, Video, Channel } from '@/lib/types';
import { formatNumber, timeAgo, classNames } from '@/lib/utils';
import { Card, Button, EmptyState } from '@/components/ui';

interface CommentsProps {
  channels: Channel[];
}

const SENTIMENT_CONFIG = {
  positive: { icon: Smile, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  neutral: { icon: Meh, color: 'text-slate-500', bg: 'bg-slate-100' },
  negative: { icon: Frown, color: 'text-red-600', bg: 'bg-red-50' },
};

export function Comments({ channels }: CommentsProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [replyText, setReplyText] = useState<Record<string, string>>({});

  const channelMap = new Map(channels.map((c) => [c.id, c]));
  const videoMap = new Map(videos.map((v) => [v.id, v]));

  useEffect(() => {
    (async () => {
      const [{ data: comms }, { data: vids }] = await Promise.all([
        supabase.from('comments').select('*').order('created_at', { ascending: false }),
        supabase.from('videos').select('*'),
      ]);
      setComments(comms ?? []);
      setVideos(vids ?? []);
      setLoading(false);
    })();
  }, []);

  const filtered = comments
    .filter((c) => filter === 'all' || (filter === 'unreplied' && !c.replied) || (filter === 'positive' && c.sentiment === 'positive') || (filter === 'negative' && c.sentiment === 'negative'));

  async function markReplied(comment: Comment) {
    await supabase.from('comments').update({ replied: true }).eq('id', comment.id);
    setComments((prev) => prev.map((c) => c.id === comment.id ? { ...c, replied: true } : c));
  }

  async function sendReply(comment: Comment) {
    const text = replyText[comment.id];
    if (!text?.trim()) return;
    await supabase.from('comments').insert({
      video_id: comment.video_id,
      channel_id: comment.channel_id,
      author: channelMap.get(comment.channel_id)?.name ?? 'Channel',
      text: text.trim(),
      is_reply: true,
      replied: true,
      sentiment: 'neutral',
    });
    await supabase.from('comments').update({ replied: true }).eq('id', comment.id);
    setReplyText((prev) => ({ ...prev, [comment.id]: '' }));
    setComments((prev) => prev.map((c) => c.id === comment.id ? { ...c, replied: true } : c));
  }

  const unrepliedCount = comments.filter((c) => !c.replied).length;

  if (loading) return <div className="py-16 text-center text-slate-400">Loading comments…</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Comment Inbox</h1>
          <p className="text-sm text-slate-500">{comments.length} comments · {unrepliedCount} need replies</p>
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400">
          <option value="all">All comments</option>
          <option value="unreplied">Needs reply</option>
          <option value="positive">Positive</option>
          <option value="negative">Negative</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<MessageCircle size={24} />} title="No comments found" description="Comments from your videos will appear here." />
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => {
            const ch = channelMap.get(c.channel_id);
            const vid = videoMap.get(c.video_id);
            const sentiment = SENTIMENT_CONFIG[c.sentiment as keyof typeof SENTIMENT_CONFIG] ?? SENTIMENT_CONFIG.neutral;
            const SentIcon = sentiment.icon;
            return (
              <Card key={c.id} className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ backgroundColor: ch?.avatar_color ?? '#94a3b8' }}>
                    {c.author.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">{c.author}</span>
                      <span className={classNames('flex items-center gap-1 rounded-full px-2 py-0.5 text-xs', sentiment.bg, sentiment.color)}>
                        <SentIcon size={10} /> {c.sentiment}
                      </span>
                      {c.replied && (
                        <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                          <Check size={10} /> Replied
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-slate-700">{c.text}</p>
                    <div className="mt-1.5 flex items-center gap-3 text-xs text-slate-400">
                      <span>{vid?.title ?? 'Unknown video'}</span>
                      <span>·</span>
                      <span>{timeAgo(c.created_at)}</span>
                      <span className="flex items-center gap-1"><Heart size={12} /> {formatNumber(c.likes)}</span>
                    </div>

                    {!c.replied && !c.is_reply && (
                      <div className="mt-3 flex gap-2">
                        <input
                          value={replyText[c.id] ?? ''}
                          onChange={(e) => setReplyText((prev) => ({ ...prev, [c.id]: e.target.value }))}
                          placeholder="Write a reply…"
                          className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-slate-400"
                        />
                        <Button size="sm" onClick={() => sendReply(c)} disabled={!replyText[c.id]?.trim()}>
                          <Reply size={14} /> Reply
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => markReplied(c)}>
                          <Check size={14} />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
