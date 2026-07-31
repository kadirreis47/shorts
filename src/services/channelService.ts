import { withTimeout } from '@/lib/async';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { Channel } from '@/lib/types';

const REQUEST_TIMEOUT_MS = 8000;

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

function assertConfigured() {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase bağlantısı yapılandırılmamış.');
  }
}

async function execute<T>(request: PromiseLike<T>, timeoutMessage: string): Promise<T> {
  return withTimeout(request, REQUEST_TIMEOUT_MS, timeoutMessage);
}

export function createChannelService(): ChannelService {
  return {
    async list(): Promise<Channel[]> {
      if (!isSupabaseConfigured) {
        return [];
      }

      const { data, error } = await execute(
        supabase.from('channels').select('*').order('created_at', { ascending: true }),
        'Kanallar yüklenirken Supabase bağlantısı zaman aşımına uğradı.',
      );

      if (error) throw error;
      return data ?? [];
    },

    async create(input: CreateChannelInput): Promise<Channel> {
      assertConfigured();

      const { data, error } = await execute(
        supabase
          .from('channels')
          .insert({
            ...input,
            status: input.status ?? 'active',
          })
          .select('*')
          .single(),
        'Kanal oluşturulurken Supabase bağlantısı zaman aşımına uğradı.',
      );

      if (error) throw error;
      return data;
    },

    async update(id: string, input: UpdateChannelInput): Promise<Channel> {
      assertConfigured();

      const { data, error } = await execute(
        supabase
          .from('channels')
          .update({
            ...input,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
          .select('*')
          .single(),
        'Kanal güncellenirken Supabase bağlantısı zaman aşımına uğradı.',
      );

      if (error) throw error;
      return data;
    },

    async remove(id: string): Promise<void> {
      assertConfigured();

      const { error } = await execute(
        supabase.from('channels').delete().eq('id', id),
        'Kanal silinirken Supabase bağlantısı zaman aşımına uğradı.',
      );

      if (error) throw error;
    },
  };
}

// Backwards-compatible default instance for modules not migrated to DI yet.
export const channelService = createChannelService();
