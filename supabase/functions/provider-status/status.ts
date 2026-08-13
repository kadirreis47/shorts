export const PROVIDER_KEYS = ['openai', 'elevenlabs', 'pexels'] as const;

export type ProviderKey = (typeof PROVIDER_KEYS)[number];

export interface ProviderStatusResponse {
  openai: { configured: boolean };
  elevenlabs: { configured: boolean };
  pexels: { configured: boolean };
}

export function providerStatusFromRows(rows: readonly { key?: unknown; value?: unknown }[]): ProviderStatusResponse {
  const configured = new Set<ProviderKey>();
  for (const row of rows) {
    if (typeof row.key === 'string' && isProviderKey(row.key) && typeof row.value === 'string' && row.value.trim().length > 0) {
      configured.add(row.key);
    }
  }
  return {
    openai: { configured: configured.has('openai') },
    elevenlabs: { configured: configured.has('elevenlabs') },
    pexels: { configured: configured.has('pexels') },
  };
}

function isProviderKey(value: string): value is ProviderKey {
  return (PROVIDER_KEYS as readonly string[]).includes(value);
}
