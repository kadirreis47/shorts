import type { ViewKey } from '@/components/Sidebar';
import type { Channel } from '@/lib/types';
import { VIEW_REGISTRY } from '@/app/viewRegistry';

interface ViewHostProps {
  view: ViewKey;
  channels: Channel[];
  onNavigate: (view: ViewKey) => void;
}

export function ViewHost({ view, channels, onNavigate }: ViewHostProps) {
  const renderView = VIEW_REGISTRY[view];

  return <>{renderView({ channels, navigate: onNavigate })}</>;
}
