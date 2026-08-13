import { useMemo } from 'react';
import { buildCanonicalChannelCatalog } from '@/services/canonicalChannelCatalog';
import { useChannelStore } from '@/store';
import { usePublishingStore } from '@/store/publishingStore';

export function useChannels() {
  const channels = useChannelStore((state) => state.channels);
  const loading = useChannelStore((state) => state.loading);
  const initialized = useChannelStore((state) => state.initialized);
  const error = useChannelStore((state) => state.error);
  const loadChannels = useChannelStore((state) => state.loadChannels);
  const publishingAccounts = usePublishingStore((state) => state.accounts);
  const canonicalChannels = useMemo(
    () => buildCanonicalChannelCatalog(channels, publishingAccounts),
    [channels, publishingAccounts],
  );

  return {
    channels,
    canonicalChannels,
    loading: loading || !initialized,
    error,
    reload: () => loadChannels(true),
  };
}
