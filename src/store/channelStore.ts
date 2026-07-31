import { create } from 'zustand';
import type { Channel } from '@/lib/types';

interface ChannelState {
  channels: Channel[];
  selectedChannelId: string | null;
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
  setChannels: (channels: Channel[]) => void;
  selectChannel: (channelId: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clear: () => void;
}

export const useChannelStore = create<ChannelState>()((set) => ({
  channels: [],
  selectedChannelId: null,
  loading: false,
  error: null,
  lastUpdated: null,
  setChannels: (channels) =>
    set((state) => ({
      channels,
      selectedChannelId:
        state.selectedChannelId &&
        channels.some((channel) => channel.id === state.selectedChannelId)
          ? state.selectedChannelId
          : null,
      lastUpdated: new Date().toISOString(),
      error: null,
    })),
  selectChannel: (selectedChannelId) => set({ selectedChannelId }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  clear: () =>
    set({
      channels: [],
      selectedChannelId: null,
      loading: false,
      error: null,
      lastUpdated: null,
    }),
}));
