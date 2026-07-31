import { useEffect } from 'react';
import { useChannelStore } from '@/store';

export function useChannels() {
  const channels = useChannelStore((state) => state.channels);
  const loading = useChannelStore((state) => state.loading);
  const initialized = useChannelStore((state) => state.initialized);
  const error = useChannelStore((state) => state.error);
  const loadChannels = useChannelStore((state) => state.loadChannels);

  useEffect(() => {
    void loadChannels();
  }, [loadChannels]);

  return {
    channels,
    loading: loading || !initialized,
    error,
    reload: () => loadChannels(true),
  };
}
