import { type ReactNode } from 'react';
import { classNames } from '@/lib/utils';
import { useI18n, type Lang } from '@/lib/i18n';
import { Globe } from 'lucide-react';

export type ViewKey =
  | 'dashboard'
  | 'studio'
  | 'videos'
  | 'calendar'
  | 'automation'
  | 'analytics'
  | 'renderops'
  | 'assets'
  | 'channels'
  | 'templates'
  | 'comments'
  | 'settings'
  | 'aitools'
  | 'bulk'
  | 'trends'
  | 'monetization'
  | 'series'
  | 'thumbnails'
  | 'ideas'
  | 'competitor'
  | 'brandkit'
  | 'abtest'
  | 'trendalerts'
  | 'retention'
  | 'contentgap'
  | 'avatars'
  | 'voiceclones'
  | 'viraldna'
  | 'faceless'
  | 'team'
  | 'workflow'
  | 'revenue'
  | 'prompts'
  | 'hashtags'
  | 'repurpose'
  | 'personas'
  | 'scriptlib'
  | 'introoutro'
  | 'collabnotes'
  | 'bulkthumbs'
  | 'nichetrends'
  | 'subgrowth'
  | 'titleopt'
  | 'sentiment'
  | 'pillars'
  | 'hooktester'
  | 'crossplatform'
  | 'storyboard'
  | 'director'
  | 'editor';

interface SidebarProps {
  current: ViewKey;
  onNavigate: (view: ViewKey) => void;
  items: { key: ViewKey; label: string; icon: ReactNode; section?: string }[];
  channels: { id: string; name: string; avatar_color: string; status: string }[];
}

export function Sidebar({ current, onNavigate, items, channels }: SidebarProps) {
  const { lang, setLang, t } = useI18n();

  return (
    <aside className="flex h-full w-60 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm">
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
        <div>
          <h1 className="text-sm font-bold text-slate-900 leading-tight">ShortsFlow</h1>
          <p className="text-[11px] text-slate-400">{t('sidebar.automationStudio')}</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {(() => {
          let lastSection = '';
          return items.map((item) => {
            const showHeader = item.section && item.section !== lastSection;
            lastSection = item.section || lastSection;
            return (
              <div key={item.key}>
                {showHeader && (
                  <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{item.section}</p>
                )}
                <button
                  onClick={() => onNavigate(item.key)}
                  className={classNames(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    current === item.key
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  )}
                >
                  <span className="shrink-0">{item.icon}</span>
                  {item.label}
                </button>
              </div>
            );
          });
        })()}
      </nav>

      <div className="border-t border-slate-100 px-3 py-3">
        <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{t('sidebar.channels')}</p>
        <div className="space-y-0.5">
          {channels.map((ch) => (
            <div key={ch.id} className="flex items-center gap-2.5 rounded-lg px-3 py-1.5">
              <div
                className="flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold text-white"
                style={{ backgroundColor: ch.avatar_color }}
              >
                {ch.name.charAt(0)}
              </div>
              <span className="flex-1 truncate text-xs font-medium text-slate-600">{ch.name}</span>
              <span
                className={classNames(
                  'h-1.5 w-1.5 rounded-full',
                  ch.status === 'active' ? 'bg-emerald-500' : 'bg-slate-300'
                )}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-slate-100 px-3 py-3">
        <div className="flex items-center gap-2 rounded-lg px-3 py-2">
          <Globe size={16} className="text-slate-400" />
          <span className="text-xs font-medium text-slate-500">{t('common.language')}</span>
          <div className="ml-auto flex rounded-lg border border-slate-200">
            <button
              onClick={() => setLang('en' as Lang)}
              className={classNames(
                'px-2.5 py-1 text-xs font-medium transition-colors',
                lang === 'en' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'
              )}
            >
              EN
            </button>
            <button
              onClick={() => setLang('tr' as Lang)}
              className={classNames(
                'border-l border-slate-200 px-2.5 py-1 text-xs font-medium transition-colors',
                lang === 'tr' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'
              )}
            >
              TR
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
