import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20260813000000_add_core_user_ownership_foundation.sql',
  'utf8',
);

describe('Slice 3A core ownership schema', () => {
  it('adds nullable ownership columns with auth.users foreign keys without claiming legacy rows', () => {
    for (const table of ['channels', 'videos', 'assets', 'app_settings']) {
      expect(migration).toContain(`ALTER TABLE public.${table} ADD COLUMN IF NOT EXISTS user_id uuid;`);
      expect(migration).toContain(`${table}_user_id_fkey`);
    }
    expect(migration).toMatch(/REFERENCES auth\.users\(id\) ON DELETE CASCADE NOT VALID/);
    expect(migration).not.toMatch(/UPDATE\s+public\.(channels|videos|assets|app_settings)\s+SET\s+user_id/i);
    expect(migration).not.toMatch(/ALTER COLUMN user_id SET NOT NULL/i);
  });

  it('uses auth.uid defaults only where the current key model can safely support them', () => {
    for (const table of ['channels', 'videos', 'assets']) {
      expect(migration).toContain(`ALTER TABLE public.${table} ALTER COLUMN user_id SET DEFAULT auth.uid();`);
    }
    expect(migration).not.toContain('ALTER TABLE public.app_settings ALTER COLUMN user_id SET DEFAULT auth.uid();');
  });

  it('adds owner indexes and same-owner channel relationships while retaining nullable native attribution', () => {
    for (const index of ['idx_channels_user_id', 'idx_videos_user_id', 'idx_assets_user_id']) {
      expect(migration).toContain(index);
    }
    expect(migration).toContain('channels_id_user_id_key UNIQUE (id, user_id)');
    expect(migration).toContain('videos_channel_user_id_fkey');
    expect(migration).toContain('FOREIGN KEY (channel_id, user_id)');
    expect(migration).toContain('REFERENCES public.channels(id, user_id)');
    expect(migration).toContain('assets_channel_user_id_fkey');
    expect(migration).toContain('ON DELETE SET NULL (channel_id)');
  });

  it('prepares per-user settings identity without replacing the legacy key primary key', () => {
    expect(migration).toContain('app_settings_user_id_key_key UNIQUE (user_id, key)');
    expect(migration).not.toContain('idx_app_settings_user_id');
    expect(migration).not.toMatch(/DROP CONSTRAINT.*app_settings.*pkey/i);
    expect(migration).not.toMatch(/DROP COLUMN.*key/i);
  });

  it('does not perform the final RLS or api_keys security cutover', () => {
    expect(migration).not.toMatch(/^\s*(?:DROP POLICY|CREATE POLICY|REVOKE|GRANT)\b/im);
    expect(migration).not.toContain('api_keys');
  });
});
