import type { VideoStatus } from '@/lib/types';

export type StatusKey = VideoStatus | 'active' | 'paused';

export interface StatusConfig {
  labelKey: string;
  color: string;
  bg: string;
  dot: string;
}

const DEFAULT_STATUS: StatusKey = 'idea';

export const STATUS_CONFIG = {
  idea: {
    labelKey: 'status.idea',
    color: 'text-slate-600',
    bg: 'bg-slate-100',
    dot: 'bg-slate-400',
  },
  script_ready: {
    labelKey: 'status.script_ready',
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    dot: 'bg-blue-500',
  },
  rendering: {
    labelKey: 'status.rendering',
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    dot: 'bg-amber-500',
  },
  rendered: {
    labelKey: 'status.rendered',
    color: 'text-cyan-700',
    bg: 'bg-cyan-50',
    dot: 'bg-cyan-500',
  },
  scheduled: {
    labelKey: 'status.scheduled',
    color: 'text-violet-700',
    bg: 'bg-violet-50',
    dot: 'bg-violet-500',
  },
  published: {
    labelKey: 'status.published',
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    dot: 'bg-emerald-500',
  },
  failed: {
    labelKey: 'status.failed',
    color: 'text-red-700',
    bg: 'bg-red-50',
    dot: 'bg-red-500',
  },
  active: {
    labelKey: 'status.active',
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    dot: 'bg-emerald-500',
  },
  paused: {
    labelKey: 'status.paused',
    color: 'text-slate-500',
    bg: 'bg-slate-100',
    dot: 'bg-slate-400',
  },
} satisfies Record<StatusKey, StatusConfig>;

export function isStatusKey(status: string): status is StatusKey {
  return status in STATUS_CONFIG;
}

export function statusConfig(status: string): StatusConfig {
  return isStatusKey(status)
    ? STATUS_CONFIG[status]
    : STATUS_CONFIG[DEFAULT_STATUS];
}

export const VIDEO_STATUSES = [
  'idea',
  'script_ready',
  'rendering',
  'rendered',
  'scheduled',
  'published',
  'failed',
] as const satisfies readonly VideoStatus[];