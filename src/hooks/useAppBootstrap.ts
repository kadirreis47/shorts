import { useEffect } from 'react';
import {
  bootstrapApplication,
  retryApplicationBootstrap,
} from '@/app/bootstrap';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useAppStore } from '@/store';

export function useAppBootstrap(userId: string) {
  const lifecycle = useAppStore((state) => state.lifecycle);
  const initialized = useAppStore((state) => state.initialized);
  const offline = useAppStore((state) => state.offline);
  const error = useAppStore((state) => state.error);
  const setOffline = useAppStore((state) => state.setOffline);

  useEffect(() => {
    void bootstrapApplication(userId);
  }, [userId]);

  useEffect(() => {
    const syncConnectionState = () => {
      setOffline(!navigator.onLine || !isSupabaseConfigured);
    };

    syncConnectionState();
    window.addEventListener('online', syncConnectionState);
    window.addEventListener('offline', syncConnectionState);

    return () => {
      window.removeEventListener('online', syncConnectionState);
      window.removeEventListener('offline', syncConnectionState);
    };
  }, [setOffline]);

  return {
    lifecycle,
    initialized,
    ready: lifecycle === 'ready' && initialized,
    booting: lifecycle === 'idle' || lifecycle === 'booting',
    offline,
    error,
    retry: () => retryApplicationBootstrap(userId),
  };
}
