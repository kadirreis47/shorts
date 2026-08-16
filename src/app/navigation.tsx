import {
  Calendar,
  Clapperboard,
  Film,
  LayoutDashboard,
  Send,
  Settings as SettingsIcon,
  Type,
  Video as VideoIcon,
  BrainCircuit,
  Scissors,
  AudioLines,
  Eye,
} from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import type { ViewKey } from '@/components/Sidebar';
import { useI18n } from '@/lib/i18n';

export interface NavigationItem {
  key: ViewKey;
  label: string;
  icon: ReactNode;
  section?: string;
}

export function useNavigationItems(): NavigationItem[] {
  const { t } = useI18n();

  return useMemo(
    () => [
      { key: 'dashboard', label: t('nav.dashboard'), icon: <LayoutDashboard size={18} />, section: t('nav.section.overview') },
      { key: 'studio', label: t('nav.studio'), icon: <Clapperboard size={18} />, section: t('nav.section.create') },
      { key: 'director', label: 'AI Director', icon: <BrainCircuit size={18} /> },
      { key: 'editor', label: 'AI Editor', icon: <Scissors size={18} /> },
      { key: 'audio-studio', label: 'AI Audio Studio', icon: <AudioLines size={18} /> },
      { key: 'visual-studio', label: 'AI Visual Studio', icon: <Eye size={18} /> },
      { key: 'subtitle-studio', label: 'AI Subtitle Studio', icon: <Type size={18} /> },
      { key: 'export-studio', label: 'AI Export Studio', icon: <Film size={18} /> },
      { key: 'publishing-studio', label: 'AI Publishing Studio', icon: <Send size={18} /> },
      { key: 'videos', label: t('nav.videos'), icon: <VideoIcon size={18} /> },
      { key: 'calendar', label: t('nav.calendar'), icon: <Calendar size={18} />, section: t('nav.section.manage') },
      { key: 'settings', label: t('nav.settings'), icon: <SettingsIcon size={18} />, section: t('nav.section.system') },
    ],
    [t],
  );
}
