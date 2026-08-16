import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20260813000001_enforce_core_write_ownership.sql',
  'utf8',
);

describe('Slice 3A.1 core write ownership enforcement', () => {
  const ownedTables = ['channels', 'videos', 'assets'];

  it('removes permissive core write policies and anonymous write privileges', () => {
    for (const table of [...ownedTables, 'app_settings']) {
      for (const command of ['insert', 'update', 'delete']) {
        expect(migration).toContain(`DROP POLICY IF EXISTS ${table}_${command} ON public.${table};`);
      }
    }
    expect(migration).toContain('REVOKE INSERT, UPDATE, DELETE ON TABLE public.channels, public.videos, public.assets, public.app_settings FROM PUBLIC, anon;');
    expect(migration).not.toMatch(/TO anon[\s\S]{0,120}(?:WITH CHECK|USING)/i);
  });

  it('requires authenticated ownership for inserts, updates, and deletes', () => {
    for (const table of ownedTables) {
      expect(migration).toContain(`CREATE POLICY ${table}_authenticated_insert ON public.${table}`);
      expect(migration).toContain(`CREATE POLICY ${table}_authenticated_update ON public.${table}`);
      expect(migration).toContain(`CREATE POLICY ${table}_authenticated_delete ON public.${table}`);
    }
    expect(migration).toContain('WITH CHECK (user_id = (SELECT auth.uid()));');
    expect(migration).toContain('USING (user_id = (SELECT auth.uid()))');
    expect(migration).toContain('GRANT INSERT, UPDATE, DELETE ON TABLE public.channels, public.videos, public.assets TO authenticated;');
  });

  it('keeps same-owner composite relationships and nullable native attribution from Slice 3A', () => {
    const foundation = readFileSync('supabase/migrations/20260813000000_add_core_user_ownership_foundation.sql', 'utf8');
    expect(foundation).toContain('videos_channel_user_id_fkey');
    expect(foundation).toContain('assets_channel_user_id_fkey');
    expect(foundation).toContain('FOREIGN KEY (channel_id, user_id)');
  });

  it('fails closed for app_settings writes while preserving its transitional broad SELECT policy', () => {
    expect(migration).not.toMatch(/CREATE POLICY app_settings.*(?:INSERT|UPDATE|DELETE)/i);
    expect(migration).not.toContain('GRANT INSERT, UPDATE, DELETE ON TABLE public.app_settings TO authenticated;');
    expect(migration).toContain('Broad SELECT remains temporarily for legacy compatibility.');
  });

  it('does not weaken the independent api_keys boundary', () => {
    expect(migration).not.toContain('api_keys');
    expect(migration).toContain('TO service_role');
  });
});
