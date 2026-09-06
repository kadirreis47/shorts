import type { ReactNode } from 'react';
import type { ViewKey } from '@/components/Sidebar';
import type { Channel } from '@/lib/types';
import type { CanonicalChannelIdentity } from '@/services/canonicalChannelCatalog';
import { lazyNamed } from '@/app/lazyNamed';
import type { V1ViewKey } from '@/app/v1Features';

const Dashboard = lazyNamed(() => import('@/views/Dashboard'), 'Dashboard');
const Studio = lazyNamed(() => import('@/views/Studio'), 'Studio');
const Videos = lazyNamed(() => import('@/views/Videos'), 'Videos');
const CalendarView = lazyNamed(() => import('@/views/CalendarView'), 'CalendarView');
const Settings = lazyNamed(() => import('@/views/Settings'), 'Settings');
const AIDirector = lazyNamed(() => import('@/views/AIDirector'), 'AIDirector');
const AIEditor = lazyNamed(() => import('@/views/AIEditor'), 'AIEditor');
const AIAudioStudio = lazyNamed(() => import('@/views/AIAudioStudio'), 'AIAudioStudio');
const AIVisualStudio = lazyNamed(() => import('@/views/AIVisualStudio'), 'AIVisualStudio');
const AISubtitleStudio = lazyNamed(() => import('@/views/AISubtitleStudio'), 'AISubtitleStudio');
const AIExportStudio = lazyNamed(() => import('@/views/AIExportStudio'), 'AIExportStudio');
const AIPublishingStudio = lazyNamed(() => import('@/views/AIPublishingStudio'), 'AIPublishingStudio');

export interface ViewRenderContext {
  channels: Channel[];
  productionChannels: CanonicalChannelIdentity[];
  navigate: (view: ViewKey) => void;
}

type ViewRenderer = (context: ViewRenderContext) => ReactNode;

export const VIEW_REGISTRY: Record<V1ViewKey, ViewRenderer> = {
  dashboard: ({ productionChannels }) => <Dashboard channels={productionChannels} />,
  studio: ({ productionChannels, navigate }) => <Studio channels={productionChannels} onNavigateDirector={() => navigate('director')} />,
  videos: ({ productionChannels, navigate }) => (
    <Videos channels={productionChannels} onNavigateStudio={() => navigate('studio')} />
  ),
  calendar: ({ productionChannels }) => <CalendarView channels={productionChannels} />,
  director: ({ navigate }) => <AIDirector onNavigateEditor={() => navigate('editor')} onNavigateStudio={() => navigate('studio')} />,
  editor: ({ navigate }) => <AIEditor onNavigateAudio={() => navigate('audio-studio')} />,
  'audio-studio': () => <AIAudioStudio />,
  'visual-studio': () => <AIVisualStudio />,
  'subtitle-studio': () => <AISubtitleStudio />,
  'export-studio': () => <AIExportStudio />,
  'publishing-studio': () => <AIPublishingStudio />,
  settings: ({ channels }) => <Settings channels={channels} />,
};
