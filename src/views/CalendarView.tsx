import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalIcon, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Video } from '@/lib/types';
import { classNames, formatTime } from '@/lib/utils';
import { StatusBadge, Card, Button } from '@/components/ui';
import type { CanonicalChannelIdentity } from '@/services/canonicalChannelCatalog';
import { resolveVideoCanonicalChannelId } from '@/services/videoChannelAttribution';

interface CalendarViewProps {
  channels: CanonicalChannelIdentity[];
}

export function CalendarView({ channels }: CalendarViewProps) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('videos')
        .select('*')
        .in('status', ['scheduled', 'published']);
      setVideos(data ?? []);
    })();
  }, []);

  const channelMap = new Map(channels.map((c) => [c.id, c]));

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startWeekday = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const weeks: (Date | null)[][] = [];
  let week: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) week.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    week.push(new Date(year, month, d));
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }

  function videosForDay(date: Date) {
    return videos.filter((v) => {
      const dt = v.scheduled_at ?? v.published_at;
      if (!dt) return false;
      const d = new Date(dt);
      return d.toDateString() === date.toDateString();
    });
  }

  const monthName = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Content Calendar</h1>
          <p className="text-sm text-slate-500">Review scheduled and published videos.</p>
          <p className="mt-1 text-xs text-amber-800">ShortsFlow must be running at the scheduled time. If the app is closed, overdue publications resume the next time ShortsFlow starts.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <button onClick={() => setCurrentMonth(new Date(year, month - 1, 1))} className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50">
              <ChevronLeft size={16} />
            </button>
            <span className="min-w-[140px] text-center text-sm font-semibold text-slate-700">{monthName}</span>
            <button onClick={() => setCurrentMonth(new Date(year, month + 1, 1))} className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50">
              <ChevronRight size={16} />
            </button>
          </div>
          <Button onClick={() => setCurrentMonth(new Date())} variant="secondary" size="sm">Today</Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="px-2 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {weeks.flat().map((date, i) => {
            if (!date) return <div key={i} className="min-h-[110px] border-b border-r border-slate-50 bg-slate-50/40" />;
            const dayVideos = videosForDay(date);
            const isToday = date.toDateString() === new Date().toDateString();
            return (
              <div key={i} className={classNames('min-h-[110px] border-b border-r border-slate-50 p-1.5', isToday && 'bg-emerald-50/40')}>
                <div className={classNames('mb-1 text-xs font-medium', isToday ? 'text-emerald-700' : 'text-slate-400')}>
                  {date.getDate()}
                </div>
                <div className="space-y-1">
                  {dayVideos.map((v) => {
                    const ch = channelMap.get(resolveVideoCanonicalChannelId(v) ?? '');
                    return (
                      <div
                        key={v.id}
                        className="rounded-md px-1.5 py-1 text-[11px] leading-tight"
                        style={{ backgroundColor: `${ch?.avatar_color ?? '#94a3b8'}15`, borderLeft: `2px solid ${ch?.avatar_color ?? '#94a3b8'}` }}
                      >
                        <p className="truncate font-medium text-slate-700">{v.title}</p>
                        <p className="text-slate-400">{formatTime(v.scheduled_at ?? v.published_at!)}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4">
        <span className="text-sm font-medium text-slate-500">Channels:</span>
        {channels.map((c) => (
          <div key={c.id} className="flex items-center gap-2">
            <div className="h-3 w-3 rounded" style={{ backgroundColor: c.avatar_color }} />
            <span className="text-sm text-slate-600">{c.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
