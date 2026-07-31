import { useEffect, useState } from 'react';
import { withTimeout } from '@/lib/async';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { Channel } from '@/lib/types';

export interface ChannelsState {
  channels: Channel[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useChannels(): ChannelsState {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    if (!isSupabaseConfigured) {
      setChannels([]);
      setError(null);
      setLoading(false);
      return () => {
        active = false;
      };
    }

    const loadChannels = async () => {
      setLoading(true);
      setError(null);

      try {
        const request = supabase
          .from('channels')
          .select('*')
          .order('created_at', { ascending: true });

        const { data, error: requestError } = await withTimeout(
          request,
          8000,
          'Supabase bağlantısı zaman aşımına uğradı',
        );

        if (requestError) {
          throw requestError;
        }

        if (active) {
          setChannels(data ?? []);
        }
      } catch (loadError) {
        const message =
          loadError instanceof Error ? loadError.message : 'Kanallar yüklenemedi';

        console.warn('Uygulama çevrimdışı modda açıldı:', loadError);

        if (active) {
          setChannels([]);
          setError(message);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadChannels();

    return () => {
      active = false;
    };
  }, [reloadKey]);

  return {
    channels,
    loading,
    error,
    reload: () => setReloadKey((value) => value + 1),
  };
}
