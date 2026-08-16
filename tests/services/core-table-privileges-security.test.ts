import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20260813000003_harden_core_table_privileges.sql',
  'utf8',
);
const readIsolationMigration = readFileSync(
  'supabase/migrations/20260813000002_scope_app_settings_and_isolate_core_reads.sql',
  'utf8',
);

describe('core private table privilege hardening', () => {
  const coreTables = 'public.channels, public.videos, public.assets, public.app_settings';

  it('removes every inherited or direct core privilege from PUBLIC and anon', () => {
    expect(migration).toContain(`REVOKE ALL PRIVILEGES ON TABLE ${coreTables}\n  FROM PUBLIC, anon, authenticated;`);
    expect(migration).not.toContain('TO PUBLIC');
    expect(migration).not.toContain('TO anon');
  });

  it('restores only authenticated CRUD, never table-wide privileges', () => {
    expect(migration).toContain(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ${coreTables}\n  TO authenticated;`);
    expect(migration).not.toMatch(/GRANT[\s\S]*\b(?:TRUNCATE|REFERENCES|TRIGGER)\b[\s\S]*\bTO\s+authenticated\b/i);
  });

  it('does not modify owner-scoped RLS policies or the api_keys boundary', () => {
    expect(migration).not.toMatch(/(?:CREATE|DROP|ALTER)\s+POLICY/i);
    expect(migration).not.toContain('api_keys');
    expect(readIsolationMigration).toContain('CREATE POLICY channels_authenticated_select ON public.channels');
    expect(readIsolationMigration).toContain('CREATE POLICY app_settings_authenticated_delete ON public.app_settings');
  });

  it('does not reduce service_role server-side access', () => {
    expect(migration).not.toContain('FROM service_role');
    expect(migration).not.toContain('TO service_role');
  });
});
