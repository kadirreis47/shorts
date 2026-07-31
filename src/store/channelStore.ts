import { create } from 'zustand';
import { channelService, type CreateChannelInput, type UpdateChannelInput } from '@/services/channelService';
import type { Channel } from '@/lib/types';

interface ChannelState {
  channels: Channel[];
  selectedChannelId: string | null;
  loading: boolean;
  mutating: boolean;
  initialized: boolean;
  error: string | null;
  lastUpdated: string | null;
  loadChannels: (force?: boolean) => Promise<void>;
  createChannel: (input: CreateChannelInput) => Promise<Channel>;
  updateChannel: (id: string, input: UpdateChannelInput) => Promise<Channel>;
  deleteChannel: (id: string) => Promise<void>;
  selectChannel: (channelId: string | null) => void;
  clearError: () => void;
  clear: () => void;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export const useChannelStore = create<ChannelState>()((set, get) => ({
  channels: [],
  selectedChannelId: null,
  loading: false,
  mutating: false,
  initialized: false,
  error: null,
  lastUpdated: null,

  loadChannels: async (force = false) => {
    const state = get();
    if (state.loading || (state.initialized && !force)) return;

    set({ loading: true, error: null });

    try {
      const channels = await channelService.list();
      set((current) => ({
        channels,
        selectedChannelId:
          current.selectedChannelId && channels.some((channel) => channel.id === current.selectedChannelId)
            ? current.selectedChannelId
            : null,
        initialized: true,
        lastUpdated: new Date().toISOString(),
      }));
    } catch (error) {
      console.warn('Kanallar yüklenemedi:', error);
      set({
        channels: [],
        initialized: true,
        error: getErrorMessage(error, 'Kanallar yüklenemedi.'),
      });
    } finally {
      set({ loading: false });
    }
  },

  createChannel: async (input) => {
    set({ mutating: true, error: null });

    try {
      const channel = await channelService.create(input);
      set((state) => ({
        channels: [...state.channels, channel],
        lastUpdated: new Date().toISOString(),
      }));
      return channel;
    } catch (error) {
      set({ error: getErrorMessage(error, 'Kanal oluşturulamadı.') });
      throw error;
    } finally {
      set({ mutating: false });
    }
  },

  updateChannel: async (id, input) => {
    set({ mutating: true, error: null });

    try {
      const channel = await channelService.update(id, input);
      set((state) => ({
        channels: state.channels.map((item) => (item.id === id ? channel : item)),
        lastUpdated: new Date().toISOString(),
      }));
      return channel;
    } catch (error) {
      set({ error: getErrorMessage(error, 'Kanal güncellenemedi.') });
      throw error;
    } finally {
      set({ mutating: false });
    }
  },

  deleteChannel: async (id) => {
    set({ mutating: true, error: null });

    try {
      await channelService.remove(id);
      set((state) => ({
        channels: state.channels.filter((channel) => channel.id !== id),
        selectedChannelId: state.selectedChannelId === id ? null : state.selectedChannelId,
        lastUpdated: new Date().toISOString(),
      }));
    } catch (error) {
      set({ error: getErrorMessage(error, 'Kanal silinemedi.') });
      throw error;
    } finally {
      set({ mutating: false });
    }
  },

  selectChannel: (selectedChannelId) => set({ selectedChannelId }),
  clearError: () => set({ error: null }),
  clear: () =>
    set({
      channels: [],
      selectedChannelId: null,
      loading: false,
      mutating: false,
      initialized: false,
      error: null,
      lastUpdated: null,
    }),
}));
