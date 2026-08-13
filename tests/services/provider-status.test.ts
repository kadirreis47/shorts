import { describe, expect, it } from 'vitest';
import { providerStatusFromRows } from '../../supabase/functions/provider-status/status';
import { readFileSync } from 'node:fs';

describe('provider-status', () => {
  it('reports only bounded configuration booleans', () => {
    expect(providerStatusFromRows([
      { key: 'openai', value: '  configured-key  ' },
      { key: 'elevenlabs', value: '' },
      { key: 'pexels', value: null },
    ])).toEqual({
      openai: { configured: true },
      elevenlabs: { configured: false },
      pexels: { configured: false },
    });
  });

  it('ignores unknown keys and does not include credential values in its response', () => {
    const secret = 'should-never-be-returned';
    const status = providerStatusFromRows([{ key: 'unknown', value: secret }, { key: 'pexels', value: secret }]);
    expect(status).toEqual({ openai: { configured: false }, elevenlabs: { configured: false }, pexels: { configured: true } });
    expect(JSON.stringify(status)).not.toContain(secret);
  });

  it('uses a service-role client and returns a safe unavailable response on lookup failure', () => {
    const source = readFileSync('supabase/functions/provider-status/index.ts', 'utf8');
    expect(source).toContain('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")');
    expect(source).toContain('.from("api_keys")');
    expect(source).toContain('.select("key,value")');
    expect(source).toContain('Provider status is unavailable.');
    expect(source).not.toContain('console.');
  });
});
