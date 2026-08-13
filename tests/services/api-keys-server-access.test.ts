import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('api_keys server-only migration', () => {
  it('grants only SELECT to service_role and removes client table access and policies', () => {
    const migration = readFileSync('supabase/migrations/20260812000002_restrict_api_keys_to_service_role.sql', 'utf8');

    expect(migration).toContain('REVOKE ALL PRIVILEGES ON TABLE public.api_keys FROM PUBLIC, anon, authenticated;');
    expect(migration).toContain('GRANT SELECT ON TABLE public.api_keys TO service_role;');
    expect(migration).not.toMatch(/GRANT\s+(?:ALL|INSERT|UPDATE|DELETE)\s+(?:PRIVILEGES\s+)?ON\s+TABLE\s+public\.api_keys\s+TO\s+service_role/i);
    for (const policy of ['api_keys_select', 'api_keys_insert', 'api_keys_update', 'api_keys_delete']) {
      expect(migration).toContain(`DROP POLICY IF EXISTS "${policy}" ON public.api_keys;`);
    }
  });

  it('does not retain renderer-side api_keys helpers', () => {
    const rendererApi = readFileSync('src/lib/api.ts', 'utf8');

    expect(rendererApi).not.toContain(".from('api_keys')");
    expect(rendererApi).not.toContain('saveApiKey');
    expect(rendererApi).not.toContain('getApiKeyKeys');
  });
});
