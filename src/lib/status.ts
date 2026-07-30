import type { VideoStatus } from '@/lib/types';

export const STATUS_CONFIG: Record<string, { labelKey: string; color: string; bg: string; dot: string }> = {
  idea: { labelKey: 'status.idea', color: 'text-slate-600', bg: 'bg-slate-100', dot: 'bg-slate-400' },
  script_ready: { labelKey: 'status.script_ready', color: 'text-blue-700', bg: 'bg-blue-50', dot: 'bg-blue-500' },
  rendered: { labelKey: 'status.rendered', color: 'text-cyan-700', bg: 'bg-cyan-50', dot: 'bg-cyan-500' },
  rendering: { labelKey: 'status.rendering', color: 'text-amber-700', bg: 'bg-amber-50', dot: 'bg-amber-500' },
  scheduled: { labelKey: 'status.scheduled', color: 'text-violet-700', bg: 'bg-violet-50', dot: 'bg-violet-500' },
  published: { labelKey: 'status.published', color: 'text-emerald-700', bg: 'bg-emerald-50', dot: 'bg-emerald-500' },
  failed: { labelKey: 'status.failed', color: 'text-red-700', bg: 'bg-red-50', dot: 'bg-red-500' },
  active: { labelKey: 'status.active', color: 'text-emerald-700', bg: 'bg-emerald-50', dot: 'bg-emerald-500' },
  paused: { labelKey: 'status.paused', color: 'text-slate-500', bg: 'bg-slate-100', dot: 'bg-slate-400' },
};

export function statusConfig(status: string) {
  return STATUS_CONFIG[status] ?? STATUS_CONFIG.idea;
}

export const VIDEO_STATUSES: VideoStatus[] = ['idea', 'script_ready', 'rendering', 'rendered', 'scheduled', 'published', 'failed'];
