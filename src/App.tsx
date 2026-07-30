import { lazy, Suspense, useEffect, useMemo, useState, type ComponentType } from 'react';
import {
  LayoutDashboard, Video as VideoIcon, Calendar, Zap, BarChart3,
  FolderOpen, Users, FileText, MessageSquare, Settings as SettingsIcon, Search, Bell, Clapperboard, Wand2,
  Layers, TrendingUp, DollarSign, Film, Lightbulb, Image as ImageIcon,
  Radar, Palette, FlaskConical, BellRing, Activity, Compass,
  UserCircle, Mic, Dna,
  Repeat, GitBranch, Hash, Smile, Type, LayoutGrid, Trophy,
  Camera, Send, Sparkles,
} from 'lucide-react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { Channel } from '@/lib/types';
import { Sidebar, type ViewKey } from '@/components/Sidebar';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { I18nProvider, useI18n } from '@/lib/i18n';
import { withTimeout } from '@/lib/async';

// Lazy-loaded view modules expose components with different prop shapes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LazyViewComponent = ComponentType<any>;

function lazyNamed(
  importer: () => Promise<Record<string, LazyViewComponent>>,
  exportName: string,
) {
  return lazy(async () => {
    const module = await importer();
    const component = module[exportName];

    if (!component) {
      throw new Error(`Beklenen React bileşeni bulunamadı: ${exportName}`);
    }

    return { default: component };
  });
}

const Dashboard = lazyNamed(() => import('@/views/Dashboard'), 'Dashboard');
const Studio = lazyNamed(() => import('@/views/Studio'), 'Studio');
const Videos = lazyNamed(() => import('@/views/Videos'), 'Videos');
const CalendarView = lazyNamed(() => import('@/views/CalendarView'), 'CalendarView');
const Automation = lazyNamed(() => import('@/views/Automation'), 'Automation');
const Analytics = lazyNamed(() => import('@/views/Analytics'), 'Analytics');
const Assets = lazyNamed(() => import('@/views/Assets'), 'Assets');
const Channels = lazyNamed(() => import('@/views/Channels'), 'Channels');
const Templates = lazyNamed(() => import('@/views/Templates'), 'Templates');
const Comments = lazyNamed(() => import('@/views/Comments'), 'Comments');
const Settings = lazyNamed(() => import('@/views/Settings'), 'Settings');
const AITools = lazyNamed(() => import('@/views/AITools'), 'AITools');
const BulkGeneration = lazyNamed(() => import('@/views/BulkGeneration'), 'BulkGeneration');
const TrendResearch = lazyNamed(() => import('@/views/TrendResearch'), 'TrendResearch');
const Monetization = lazyNamed(() => import('@/views/Monetization'), 'Monetization');
const SeriesView = lazyNamed(() => import('@/views/SeriesView'), 'SeriesView');
const ThumbnailGenerator = lazyNamed(() => import('@/views/ThumbnailGenerator'), 'ThumbnailGenerator');
const ContentIdeas = lazyNamed(() => import('@/views/ContentIdeas'), 'ContentIdeas');
const CompetitorRadar = lazyNamed(() => import('@/views/CompetitorRadar'), 'CompetitorRadar');
const BrandKitView = lazyNamed(() => import('@/views/BrandKitView'), 'BrandKitView');
const ABTesting = lazyNamed(() => import('@/views/ABTesting'), 'ABTesting');
const TrendAlerts = lazyNamed(() => import('@/views/TrendAlerts'), 'TrendAlerts');
const RetentionReplay = lazyNamed(() => import('@/views/RetentionReplay'), 'RetentionReplay');
const AIContentGap = lazyNamed(() => import('@/views/AIContentGap'), 'AIContentGap');
const AvatarPresets = lazyNamed(() => import('@/views/AvatarPresets'), 'AvatarPresets');
const VoiceClones = lazyNamed(() => import('@/views/VoiceClones'), 'VoiceClones');
const ViralDNAView = lazyNamed(() => import('@/views/ViralDNAView'), 'ViralDNAView');
const FacelessStudio = lazyNamed(() => import('@/views/FacelessStudio'), 'FacelessStudio');
const TeamWorkspace = lazyNamed(() => import('@/views/TeamWorkspace'), 'TeamWorkspace');
const WorkflowBuilder = lazyNamed(() => import('@/views/WorkflowBuilder'), 'WorkflowBuilder');
const RevenueForecasting = lazyNamed(() => import('@/views/RevenueForecasting'), 'RevenueForecasting');
const PromptGenerator = lazyNamed(() => import('@/views/PromptGenerator'), 'PromptGenerator');
const HashtagEngine = lazyNamed(() => import('@/views/HashtagEngine'), 'HashtagEngine');
const RepurposingEngine = lazyNamed(() => import('@/views/RepurposingEngine'), 'RepurposingEngine');
const PersonaBuilder = lazyNamed(() => import('@/views/PersonaBuilder'), 'PersonaBuilder');
const ScriptLibrary = lazyNamed(() => import('@/views/ScriptLibrary'), 'ScriptLibrary');
const IntroOutroDesigner = lazyNamed(() => import('@/views/IntroOutroDesigner'), 'IntroOutroDesigner');
const CollaborationNotes = lazyNamed(() => import('@/views/CollaborationNotes'), 'CollaborationNotes');
const BulkThumbnailGenerator = lazyNamed(() => import('@/views/BulkThumbnailGenerator'), 'BulkThumbnailGenerator');
const NicheTrendExplorer = lazyNamed(() => import('@/views/NicheTrendExplorer'), 'NicheTrendExplorer');
const SubscriberGrowthTracker = lazyNamed(() => import('@/views/SubscriberGrowthTracker'), 'SubscriberGrowthTracker');
const TitleOptimizer = lazyNamed(() => import('@/views/TitleOptimizer'), 'TitleOptimizer');
const CommentSentimentDashboard = lazyNamed(() => import('@/views/CommentSentimentDashboard'), 'CommentSentimentDashboard');
const ContentPillarPlanner = lazyNamed(() => import('@/views/ContentPillarPlanner'), 'ContentPillarPlanner');
const HookTester = lazyNamed(() => import('@/views/HookTester'), 'HookTester');
const CrossPlatformScheduler = lazyNamed(() => import('@/views/CrossPlatformScheduler'), 'CrossPlatformScheduler');
const StoryboardGenerator = lazyNamed(() => import('@/views/StoryboardGenerator'), 'StoryboardGenerator');

function AppContent() {
  const { t } = useI18n();
  const [view, setView] = useState<ViewKey>('dashboard');
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    if (!isSupabaseConfigured) {
      setChannels([]);
      setLoading(false);
      return () => { active = false; };
    }

    const loadChannels = async () => {
      try {
        const request = supabase
          .from('channels')
          .select('*')
          .order('created_at', { ascending: true });

        const { data, error } = await withTimeout(
          request,
          8000,
          'Supabase bağlantısı zaman aşımına uğradı',
        );
        if (error) console.warn('Kanallar yüklenemedi:', error.message);
        if (active) setChannels(data ?? []);
      } catch (error) {
        console.warn('Uygulama çevrimdışı modda açıldı:', error);
        if (active) setChannels([]);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadChannels();
    return () => { active = false; };
  }, []);

  const NAV_ITEMS: { key: ViewKey; label: string; icon: React.ReactNode; section?: string }[] = useMemo(() => [
    { key: 'dashboard', label: t('nav.dashboard'), icon: <LayoutDashboard size={18} />, section: t('nav.section.overview') },
    { key: 'studio', label: t('nav.studio'), icon: <Clapperboard size={18} />, section: t('nav.section.create') },
    { key: 'faceless', label: t('nav.faceless'), icon: <Film size={18} /> },
    { key: 'videos', label: t('nav.videos'), icon: <VideoIcon size={18} /> },
    { key: 'calendar', label: t('nav.calendar'), icon: <Calendar size={18} />, section: t('nav.section.manage') },
    { key: 'automation', label: t('nav.automation'), icon: <Zap size={18} /> },
    { key: 'workflow', label: t('nav.workflow'), icon: <GitBranch size={18} /> },
    { key: 'analytics', label: t('nav.analytics'), icon: <BarChart3 size={18} /> },
    { key: 'assets', label: t('nav.assets'), icon: <FolderOpen size={18} /> },
    { key: 'channels', label: t('nav.channels'), icon: <Users size={18} /> },
    { key: 'team', label: t('nav.team'), icon: <Users size={18} /> },
    { key: 'templates', label: t('nav.templates'), icon: <FileText size={18} /> },
    { key: 'comments', label: t('nav.comments'), icon: <MessageSquare size={18} /> },
    { key: 'collabnotes', label: t('nav.collabnotes'), icon: <MessageSquare size={18} /> },
    { key: 'aitools', label: t('nav.aitools'), icon: <Wand2 size={18} />, section: t('nav.section.aiTools') },
    { key: 'prompts', label: t('nav.prompts'), icon: <Sparkles size={18} /> },
    { key: 'bulk', label: t('nav.bulk'), icon: <Layers size={18} /> },
    { key: 'bulkthumbs', label: t('nav.bulkthumbs'), icon: <ImageIcon size={18} /> },
    { key: 'trends', label: t('nav.trends'), icon: <TrendingUp size={18} />, section: t('nav.section.research') },
    { key: 'nichetrends', label: t('nav.nichetrends'), icon: <Compass size={18} /> },
    { key: 'ideas', label: t('ideas.title'), icon: <Lightbulb size={18} /> },
    { key: 'competitor', label: t('nav.competitor'), icon: <Radar size={18} /> },
    { key: 'trendalerts', label: t('nav.trendalerts'), icon: <BellRing size={18} /> },
    { key: 'contentgap', label: t('nav.contentgap'), icon: <Compass size={18} /> },
    { key: 'monetization', label: t('nav.monetization'), icon: <DollarSign size={18} />, section: t('nav.section.growth') },
    { key: 'revenue', label: t('nav.revenue'), icon: <DollarSign size={18} /> },
    { key: 'subgrowth', label: t('nav.subgrowth'), icon: <TrendingUp size={18} /> },
    { key: 'series', label: t('nav.series'), icon: <Film size={18} /> },
    { key: 'thumbnails', label: t('thumbnail.title'), icon: <ImageIcon size={18} /> },
    { key: 'titleopt', label: t('nav.titleopt'), icon: <Type size={18} /> },
    { key: 'hooktester', label: t('nav.hooktester'), icon: <Trophy size={18} /> },
    { key: 'brandkit', label: t('nav.brandkit'), icon: <Palette size={18} />, section: t('nav.section.branding') },
    { key: 'introoutro', label: t('nav.introoutro'), icon: <Clapperboard size={18} /> },
    { key: 'abtest', label: t('nav.abtest'), icon: <FlaskConical size={18} />, section: t('nav.section.optimize') },
    { key: 'retention', label: t('nav.retention'), icon: <Activity size={18} /> },
    { key: 'sentiment', label: t('nav.sentiment'), icon: <Smile size={18} /> },
    { key: 'avatars', label: t('nav.avatars'), icon: <UserCircle size={18} />, section: t('nav.section.advanced') },
    { key: 'voiceclones', label: t('nav.voiceclones'), icon: <Mic size={18} /> },
    { key: 'viraldna', label: t('nav.viraldna'), icon: <Dna size={18} /> },
    { key: 'storyboard', label: t('nav.storyboard'), icon: <Camera size={18} /> },
    { key: 'repurpose', label: t('nav.repurpose'), icon: <Repeat size={18} /> },
    { key: 'personas', label: t('nav.personas'), icon: <Users size={18} /> },
    { key: 'scriptlib', label: t('nav.scriptlib'), icon: <FileText size={18} /> },
    { key: 'hashtags', label: t('nav.hashtags'), icon: <Hash size={18} /> },
    { key: 'pillars', label: t('nav.pillars'), icon: <LayoutGrid size={18} /> },
    { key: 'crossplatform', label: t('nav.crossplatform'), icon: <Send size={18} /> },
    { key: 'settings', label: t('nav.settings'), icon: <SettingsIcon size={18} />, section: t('nav.section.system') },
  ], [t]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-slate-400">{t('app.loading')}</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar current={view} onNavigate={setView} items={NAV_ITEMS} channels={channels} />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <div className="relative w-72">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              placeholder={t('app.search')}
              className="w-full rounded-lg border border-slate-200 py-1.5 pl-9 pr-3 text-sm outline-none focus:border-slate-400"
            />
          </div>
          <div className="flex items-center gap-3">
            <button className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100">
              <Bell size={18} />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
            </button>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-xs font-bold text-white">
                SF
              </div>
              <span className="text-sm font-medium text-slate-700">{t('app.admin')}</span>
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
          {view === 'dashboard' && <Dashboard channels={channels} />}
          {view === 'studio' && <Studio channels={channels} />}
          {view === 'videos' && <Videos channels={channels} onNavigateStudio={() => setView('studio')} />}
          {view === 'calendar' && <CalendarView channels={channels} />}
          {view === 'automation' && <Automation channels={channels} />}
          {view === 'analytics' && <Analytics channels={channels} />}
          {view === 'assets' && <Assets channels={channels} />}
          {view === 'channels' && <Channels />}
          {view === 'templates' && <Templates />}
          {view === 'comments' && <Comments channels={channels} />}
          {view === 'aitools' && <AITools />}
          {view === 'bulk' && <BulkGeneration channels={channels} />}
          {view === 'trends' && <TrendResearch />}
          {view === 'monetization' && <Monetization channels={channels} />}
          {view === 'series' && <SeriesView channels={channels} />}
          {view === 'thumbnails' && <ThumbnailGenerator />}
          {view === 'ideas' && <ContentIdeas channels={channels} />}
          {view === 'competitor' && <CompetitorRadar />}
          {view === 'brandkit' && <BrandKitView />}
          {view === 'abtest' && <ABTesting />}
          {view === 'trendalerts' && <TrendAlerts />}
          {view === 'retention' && <RetentionReplay />}
          {view === 'contentgap' && <AIContentGap />}
          {view === 'avatars' && <AvatarPresets />}
          {view === 'voiceclones' && <VoiceClones />}
          {view === 'viraldna' && <ViralDNAView />}
          {view === 'faceless' && <FacelessStudio channels={channels} />}
          {view === 'team' && <TeamWorkspace />}
          {view === 'workflow' && <WorkflowBuilder channels={channels} />}
          {view === 'revenue' && <RevenueForecasting channels={channels} />}
          {view === 'prompts' && <PromptGenerator />}
          {view === 'hashtags' && <HashtagEngine channels={channels} />}
          {view === 'repurpose' && <RepurposingEngine channels={channels} />}
          {view === 'personas' && <PersonaBuilder channels={channels} />}
          {view === 'scriptlib' && <ScriptLibrary />}
          {view === 'introoutro' && <IntroOutroDesigner channels={channels} />}
          {view === 'collabnotes' && <CollaborationNotes />}
          {view === 'bulkthumbs' && <BulkThumbnailGenerator channels={channels} />}
          {view === 'nichetrends' && <NicheTrendExplorer />}
          {view === 'subgrowth' && <SubscriberGrowthTracker channels={channels} />}
          {view === 'titleopt' && <TitleOptimizer />}
          {view === 'sentiment' && <CommentSentimentDashboard channels={channels} />}
          {view === 'pillars' && <ContentPillarPlanner channels={channels} />}
          {view === 'hooktester' && <HookTester />}
          {view === 'crossplatform' && <CrossPlatformScheduler channels={channels} />}
          {view === 'storyboard' && <StoryboardGenerator channels={channels} />}
          {view === 'settings' && <Settings channels={channels} />}
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
