import type { ViewKey } from '@/components/Sidebar';
import type { Channel } from '@/lib/types';
import type { CanonicalChannelIdentity } from '@/services/canonicalChannelCatalog';
import { VIEW_REGISTRY } from '@/app/viewRegistry';
import { resolveV1View } from '@/app/v1Features';

interface ViewHostProps {
  view: ViewKey;
  channels: Channel[];
  productionChannels: CanonicalChannelIdentity[];
  onNavigate: (view: ViewKey) => void;
}

export function ViewHost({ view, channels, productionChannels, onNavigate }: ViewHostProps) {
  const renderView = VIEW_REGISTRY[resolveV1View(view)];

  return <>{renderView({ channels, productionChannels, navigate: onNavigate })}</>;
}
