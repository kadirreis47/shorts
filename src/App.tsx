import { Suspense } from 'react';
import { Bell, Search } from 'lucide-react';
import { Sidebar } from '@/components/Sidebar';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { I18nProvider, useI18n } from '@/lib/i18n';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useChannels } from '@/hooks/useChannels';
import { useNavigationItems } from '@/app/navigation';
import { ViewHost } from '@/app/ViewHost';
import { useUIStore } from '@/store';

function AppContent() {
  const { t } = useI18n();
  const view = useUIStore((state) => state.currentView);
  const navigate = useUIStore((state) => state.navigate);
  const { channels, loading } = useChannels();
  const navigationItems = useNavigationItems();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-slate-400">{t('app.loading')}</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar
        current={view}
        onNavigate={navigate}
        items={navigationItems}
        channels={channels}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <div className="relative w-72">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              placeholder={t('app.search')}
              className="w-full rounded-lg border border-slate-200 py-1.5 pl-9 pr-3 text-sm outline-none focus:border-slate-400"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              aria-label={t('app.notifications')}
            >
              <Bell size={18} />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
            </button>

            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-xs font-bold text-white">
                SF
              </div>
              <span className="text-sm font-medium text-slate-700">
                {t('app.admin')}
              </span>
            </div>
          </div>
        </header>

        {!isSupabaseConfigured && (
          <div className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-sm text-amber-900">
            <span className="font-semibold">{t('app.offline')}:</span>{' '}
            {t('app.offlineDetail')}
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-6">
          <Suspense
            fallback={
              <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-400">
                {t('app.loadingView')}
              </div>
            }
          >
            <AppErrorBoundary resetKey={view}>
              <ViewHost
                view={view}
                channels={channels}
                onNavigate={navigate}
              />
            </AppErrorBoundary>
          </Suspense>
        </main>
      </div>
    </div>
  );
}

function App() {
  return (
    <I18nProvider>
      <AppContent />
    </I18nProvider>
  );
}

export default App;
