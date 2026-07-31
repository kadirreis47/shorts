import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { Channel } from '@/lib/types';
import {
  configurationError,
  createServiceExecutor,
  type ServiceExecutor,
} from './serviceExecutor';

export interface CreateChannelInput {
  name: string;
  handle?: string | null;
  niche?: string | null;
  description?: string | null;
  avatar_color: string;
  status?: string;
}

export interface UpdateChannelInput {
  name?: string;
  handle?: string | null;
  niche?: string | null;
  description?: string | null;
  avatar_color?: string;
  status?: string;
}

export interface ChannelService {
  list(): Promise<Channel[]>;
  create(input: CreateChannelInput): Promise<Channel>;
  update(id: string, input: UpdateChannelInput): Promise<Channel>;
  remove(id: string): Promise<void>;
}

function assertConfigured(operation: string) {
  if (!isSupabaseConfigured) {
    throw configurationError(
      operation,
      'Supabase bağlantısı yapılandırılmamış.',
    );
  }
}

export function createChannelService(
  executor: ServiceExecutor = createServiceExecutor(),
): ChannelService {
  return {
    async list(): Promise<Channel[]> {
      if (!isSupabaseConfigured) return [];

      return executor.execute(async () => {
        const { data, error } = await supabase
          .from('channels')
          .select('*')
          .order('created_at', { ascending: true });

        if (error) throw error;
        return data ?? [];
      }, {
        operation: 'channel.list',
        fallbackMessage: 'Kanallar yüklenemedi.',
        timeoutMessage: 'Kanallar yüklenirken sunucu zaman aşımına uğradı.',
      });
    },

    async create(input: CreateChannelInput): Promise<Channel> {
      assertConfigured('channel.create');

      return executor.execute(async () => {
        const { data, error } = await supabase
          .from('channels')
          .insert({ ...input, status: input.status ?? 'active' })
          .select('*')
          .single();

        if (error) throw error;
        return data;
      }, {
        operation: 'channel.create',
        fallbackMessage: 'Kanal oluşturulamadı.',
        timeoutMessage: 'Kanal oluşturulurken sunucu zaman aşımına uğradı.',
      });
    },

    async update(id: string, input: UpdateChannelInput): Promise<Channel> {
      assertConfigured('channel.update');

      return executor.execute(async () => {
        const { data, error } = await supabase
          .from('channels')
          .update({ ...input, updated_at: new Date().toISOString() })
          .eq('id', id)
          .select('*')
          .single();

        if (error) throw error;
        return data;
      }, {
        operation: 'channel.update',
        fallbackMessage: 'Kanal güncellenemedi.',
        timeoutMessage: 'Kanal güncellenirken sunucu zaman aşımına uğradı.',
      });
    },

    async remove(id: string): Promise<void> {
      assertConfigured('channel.remove');

      await executor.execute(async () => {
        const { error } = await supabase.from('channels').delete().eq('id', id);
        if (error) throw error;
      }, {
        operation: 'channel.remove',
        fallbackMessage: 'Kanal silinemedi.',
        timeoutMessage: 'Kanal silinirken sunucu zaman aşımına uğradı.',
      });
    },
  };
}

export const channelService = createChannelService();
