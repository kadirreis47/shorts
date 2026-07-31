export const queryKeys = {
  channels: {
    all: ['channels'] as const,
    list: () => ['channels', 'list'] as const,
    detail: (channelId: string) => ['channels', 'detail', channelId] as const,
  },
} as const;
