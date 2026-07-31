import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { applicationContainer, dependencyTokens } from '@/core/di';
import { getUserErrorMessage } from '@/core/errors';
import type { EventBus, ApplicationEventMap } from '@/core/events';
import { queryKeys, type QueryClient } from '@/core/query';
import type { Channel } from '@/lib/types';
import { createPersistentStorage } from '@/persistence/storeStorage';
import type {
  ChannelService,
  CreateChannelInput,
  UpdateChannelInput,
} from '@/services/channelService';

interface PersistedChannelState {
  selectedChannelId: string | null;
}

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

function getChannelService(): ChannelService {
  return applicationContainer.resolve(dependencyTokens.channelService);
}

function getQueryClient(): QueryClient {
  return applicationContainer.resolve(dependencyTokens.queryClient);
}

function getEventBus(): EventBus<ApplicationEventMap> {
  return applicationContainer.resolve(dependencyTokens.eventBus);
}

function publish<TKey extends keyof ApplicationEventMap>(
  event: TKey,
  payload: ApplicationEventMap[TKey],
) {
  void getEventBus().emit(event, payload);
}

export const useChannelStore = create<ChannelState>()(
  persist(
    (set, get) => ({
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
          const channels = await getQueryClient().fetchQuery({
            key: queryKeys.channels.list(),
            queryFn: () => getChannelService().list(),
            force,
            staleTime: 30_000,
          });
          const loadedAt = new Date().toISOString();

          set((current) => ({
            channels,
            selectedChannelId:
              current.selectedChannelId &&
              channels.some((channel) => channel.id === current.selectedChannelId)
                ? current.selectedChannelId
                : null,
            initialized: true,
            lastUpdated: loadedAt,
          }));

          publish('channel:list-loaded', { channels, loadedAt });
        } catch (error) {
          console.warn('Kanallar yüklenemedi:', error);
          set({
            channels: [],
            initialized: true,
            error: getUserErrorMessage(error, 'Kanallar yüklenemedi.'),
          });
        } finally {
          set({ loading: false });
        }
      },

      createChannel: async (input) => {
        set({ mutating: true, error: null });

        try {
          const channel = await getChannelService().create(input);
          const createdAt = new Date().toISOString();

          getQueryClient().updateQueryData<Channel[]>(
            queryKeys.channels.list(),
            (current) => [...(current ?? get().channels), channel],
          );

          set((state) => ({
            channels: [...state.channels, channel],
            lastUpdated: createdAt,
          }));

          publish('channel:created', { channel, createdAt });
          return channel;
        } catch (error) {
          set({ error: getUserErrorMessage(error, 'Kanal oluşturulamadı.') });
          throw error;
        } finally {
          set({ mutating: false });
        }
      },

      updateChannel: async (id, input) => {
        set({ mutating: true, error: null });

        try {
          const channel = await getChannelService().update(id, input);
          const updatedAt = new Date().toISOString();

          getQueryClient().updateQueryData<Channel[]>(
            queryKeys.channels.list(),
            (current) => (current ?? get().channels).map((item) =>
              item.id === id ? channel : item,
            ),
          );
          getQueryClient().setQueryData(queryKeys.channels.detail(id), channel);

          set((state) => ({
            channels: state.channels.map((item) =>
              item.id === id ? channel : item,
            ),
            lastUpdated: updatedAt,
          }));

          publish('channel:updated', { channel, updatedAt });
          return channel;
        } catch (error) {
          set({ error: getUserErrorMessage(error, 'Kanal güncellenemedi.') });
          throw error;
        } finally {
          set({ mutating: false });
        }
      },

      deleteChannel: async (id) => {
        set({ mutating: true, error: null });

        try {
          await getChannelService().remove(id);
          const deletedAt = new Date().toISOString();

          getQueryClient().updateQueryData<Channel[]>(
            queryKeys.channels.list(),
            (current) => (current ?? get().channels).filter(
              (channel) => channel.id !== id,
            ),
          );
          getQueryClient().removeQueries(queryKeys.channels.detail(id));

          set((state) => ({
            channels: state.channels.filter((channel) => channel.id !== id),
            selectedChannelId:
              state.selectedChannelId === id ? null : state.selectedChannelId,
            lastUpdated: deletedAt,
          }));

          publish('channel:deleted', { channelId: id, deletedAt });
        } catch (error) {
          set({ error: getUserErrorMessage(error, 'Kanal silinemedi.') });
          throw error;
        } finally {
          set({ mutating: false });
        }
      },

      selectChannel: (selectedChannelId) => {
        set({ selectedChannelId });
        publish('channel:selected', {
          channelId: selectedChannelId,
          selectedAt: new Date().toISOString(),
        });
      },

      clearError: () => set({ error: null }),
      clear: () => {
        getQueryClient().removeQueries(queryKeys.channels.all);
        set({
          channels: [],
          selectedChannelId: null,
          loading: false,
          mutating: false,
          initialized: false,
          error: null,
          lastUpdated: null,
        });
      },
    }),
    {
      name: 'shortsflow-channels',
      version: 1,
      storage: createPersistentStorage<PersistedChannelState>(),
      skipHydration: true,
      partialize: (state) => ({
        selectedChannelId: state.selectedChannelId,
      }),
    },
  ),
);
