import type { ReactNode } from 'react';
import type { ViewKey } from '@/components/Sidebar';
import type { Channel } from '@/lib/types';
import { lazyNamed } from '@/app/lazyNamed';

const Dashboard = lazyNamed(() => import('@/views/Dashboard'), 'Dashboard');
const Studio = lazyNamed(() => import('@/views/Studio'), 'Studio');
const Videos = lazyNamed(() => import('@/views/Videos'), 'Videos');
const CalendarView = lazyNamed(() => import('@/views/CalendarView'), 'CalendarView');
const Automation = lazyNamed(() => import('@/views/Automation'), 'Automation');
const Analytics = lazyNamed(() => import('@/views/Analytics'), 'Analytics');
const RenderOperationsDashboard = lazyNamed(
  () => import('@/views/RenderOperationsDashboard'),
  'RenderOperationsDashboard',
);
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
const CommentSentimentDashboard = lazyNamed(
  () => import('@/views/CommentSentimentDashboard'),
  'CommentSentimentDashboard',
);
const ContentPillarPlanner = lazyNamed(() => import('@/views/ContentPillarPlanner'), 'ContentPillarPlanner');
const HookTester = lazyNamed(() => import('@/views/HookTester'), 'HookTester');
const CrossPlatformScheduler = lazyNamed(
  () => import('@/views/CrossPlatformScheduler'),
  'CrossPlatformScheduler',
);
const StoryboardGenerator = lazyNamed(() => import('@/views/StoryboardGenerator'), 'StoryboardGenerator');

export interface ViewRenderContext {
  channels: Channel[];
  navigate: (view: ViewKey) => void;
}

type ViewRenderer = (context: ViewRenderContext) => ReactNode;

export const VIEW_REGISTRY: Record<ViewKey, ViewRenderer> = {
  dashboard: ({ channels }) => <Dashboard channels={channels} />,
  studio: ({ channels }) => <Studio channels={channels} />,
  videos: ({ channels, navigate }) => (
    <Videos channels={channels} onNavigateStudio={() => navigate('studio')} />
  ),
  calendar: ({ channels }) => <CalendarView channels={channels} />,
  automation: ({ channels }) => <Automation channels={channels} />,
  analytics: ({ channels }) => <Analytics channels={channels} />,
  renderops: () => <RenderOperationsDashboard />,
  assets: ({ channels }) => <Assets channels={channels} />,
  channels: () => <Channels />,
  templates: () => <Templates />,
  comments: ({ channels }) => <Comments channels={channels} />,
  aitools: () => <AITools />,
  bulk: ({ channels }) => <BulkGeneration channels={channels} />,
  trends: () => <TrendResearch />,
  monetization: ({ channels }) => <Monetization channels={channels} />,
  series: ({ channels }) => <SeriesView channels={channels} />,
  thumbnails: () => <ThumbnailGenerator />,
  ideas: ({ channels }) => <ContentIdeas channels={channels} />,
  competitor: () => <CompetitorRadar />,
  brandkit: () => <BrandKitView />,
  abtest: () => <ABTesting />,
  trendalerts: () => <TrendAlerts />,
  retention: () => <RetentionReplay />,
  contentgap: () => <AIContentGap />,
  avatars: () => <AvatarPresets />,
  voiceclones: () => <VoiceClones />,
  viraldna: () => <ViralDNAView />,
  faceless: ({ channels }) => <FacelessStudio channels={channels} />,
  team: () => <TeamWorkspace />,
  workflow: ({ channels }) => <WorkflowBuilder channels={channels} />,
  revenue: ({ channels }) => <RevenueForecasting channels={channels} />,
  prompts: () => <PromptGenerator />,
  hashtags: ({ channels }) => <HashtagEngine channels={channels} />,
  repurpose: ({ channels }) => <RepurposingEngine channels={channels} />,
  personas: ({ channels }) => <PersonaBuilder channels={channels} />,
  scriptlib: () => <ScriptLibrary />,
  introoutro: ({ channels }) => <IntroOutroDesigner channels={channels} />,
  collabnotes: () => <CollaborationNotes />,
  bulkthumbs: ({ channels }) => <BulkThumbnailGenerator channels={channels} />,
  nichetrends: () => <NicheTrendExplorer />,
  subgrowth: ({ channels }) => <SubscriberGrowthTracker channels={channels} />,
  titleopt: () => <TitleOptimizer />,
  sentiment: ({ channels }) => <CommentSentimentDashboard channels={channels} />,
  pillars: ({ channels }) => <ContentPillarPlanner channels={channels} />,
  hooktester: () => <HookTester />,
  crossplatform: ({ channels }) => <CrossPlatformScheduler channels={channels} />,
  storyboard: ({ channels }) => <StoryboardGenerator channels={channels} />,
  settings: ({ channels }) => <Settings channels={channels} />,
};
