import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20260813000002_scope_app_settings_and_isolate_core_reads.sql',
  'utf8',
);

describe('Slice 3B core read isolation and per-user settings', () => {
  const tables = ['channels', 'videos', 'assets', 'app_settings'];

  it('replaces permissive reads and removes anon select privileges', () => {
    for (const table of tables) {
      expect(migration).toContain(`DROP POLICY IF EXISTS ${table}_select ON public.${table};`);
      expect(migration).toContain(`CREATE POLICY ${table}_authenticated_select ON public.${table}`);
    }
    expect(migration).toContain('REVOKE SELECT ON TABLE public.channels, public.videos, public.assets, public.app_settings FROM PUBLIC, anon;');
    expect(migration).not.toMatch(/TO anon[\s\S]{0,120}USING \(true\)/i);
  });

  it('allows authenticated users to read only their owned core rows, never legacy NULL rows', () => {
    expect(migration).toContain('USING (user_id = (SELECT auth.uid()));');
    expect(migration).toContain('Legacy NULL-owned rows remain in place but are invisible and immutable');
  });

  it('replaces the global settings key primary key with a surrogate identity while retaining per-user key uniqueness', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();');
    expect(migration).toContain('DROP CONSTRAINT IF EXISTS app_settings_pkey;');
    expect(migration).toContain('ADD CONSTRAINT app_settings_pkey PRIMARY KEY (id);');
    const foundation = readFileSync('supabase/migrations/20260813000000_add_core_user_ownership_foundation.sql', 'utf8');
    expect(foundation).toContain('app_settings_user_id_key_key UNIQUE (user_id, key)');
  });

  it('restores only owner-bound authenticated app_settings writes', () => {
    for (const command of ['insert', 'update', 'delete']) {
      expect(migration).toContain(`CREATE POLICY app_settings_authenticated_${command} ON public.app_settings`);
    }
    expect(migration).toContain('ALTER TABLE public.app_settings ALTER COLUMN user_id SET DEFAULT auth.uid();');
    expect(migration).toContain('WITH CHECK (user_id = (SELECT auth.uid()));');
  });

  it('keeps legacy settings physically preserved without claiming them', () => {
    expect(migration).not.toMatch(/UPDATE\s+public\.app_settings\s+SET\s+user_id/i);
    expect(migration).toContain('Legacy NULL-owned rows remain in place but are invisible and immutable');
  });

  it('keeps the owner-scoped schema contract while V1 Settings exposes no generic settings write path', () => {
    const settingsView = readFileSync('src/views/Settings.tsx', 'utf8');

    expect(migration).toContain('ALTER TABLE public.app_settings ALTER COLUMN user_id SET DEFAULT auth.uid();');
    expect(settingsView).not.toContain("from('app_settings')");
    expect(settingsView).not.toContain('async function updateSetting');
    expect(settingsView).not.toMatch(/user_id\s*:/);
    expect(settingsView).not.toContain('Settings are temporarily unavailable');
  });

  it('preserves Slice 3A.1 write enforcement and api_keys isolation', () => {
    const writeMigration = readFileSync('supabase/migrations/20260813000001_enforce_core_write_ownership.sql', 'utf8');
    const apiKeysMigration = readFileSync('supabase/migrations/20260812000002_restrict_api_keys_to_service_role.sql', 'utf8');
    expect(writeMigration).toContain('videos_authenticated_update');
    expect(writeMigration).toContain('assets_authenticated_update');
    expect(migration).not.toContain('api_keys');
    expect(apiKeysMigration).toContain('GRANT SELECT ON TABLE public.api_keys TO service_role;');
  });
});
