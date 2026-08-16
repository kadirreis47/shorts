import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20260814000000_secure_dashboard_activity_log.sql',
  'utf8',
);

describe('Slice 3C Dashboard activity security', () => {
  it('adds nullable authenticated ownership without claiming legacy activity', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS user_id uuid DEFAULT auth.uid();');
    expect(migration).toContain('REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID');
    expect(migration).toContain('CHECK (user_id IS NOT NULL) NOT VALID');
    expect(migration).not.toMatch(/UPDATE\s+public\.activity_log\s+SET\s+user_id/i);
    expect(migration).not.toMatch(/ALTER TABLE\s+public\.activity_log\s+ALTER COLUMN\s+user_id\s+SET NOT NULL/i);
  });

  it('enforces same-owner channel and video relationships for owned activity', () => {
    expect(migration).toContain('activity_log_channel_user_id_fkey');
    expect(migration).toContain('activity_log_video_user_id_fkey');
    expect(migration).toContain('FOREIGN KEY (channel_id, user_id)');
    expect(migration).toContain('FOREIGN KEY (video_id, user_id)');
  });

  it('denies anonymous access and permits authenticated owner reads only', () => {
    expect(migration).toContain('REVOKE ALL PRIVILEGES ON TABLE public.activity_log FROM PUBLIC, anon, authenticated;');
    expect(migration).toContain('GRANT SELECT ON TABLE public.activity_log TO authenticated;');
    expect(migration).toContain('FOR SELECT TO authenticated');
    expect(migration).toContain('USING (user_id = (SELECT auth.uid()));');
    expect(migration).not.toMatch(/TO anon[\s\S]{0,120}(?:USING|WITH CHECK)\s*\(true\)/i);
    expect(migration).not.toMatch(/GRANT\s+(?:INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER)[^;]*TO authenticated/i);
  });

  it('keeps server writes server-side and does not change independent boundaries', () => {
    expect(migration).toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.activity_log TO service_role;');
    expect(migration).not.toContain('api_keys');
    expect(migration).not.toContain('youtube_tokens');
    expect(migration).not.toMatch(/CREATE POLICY[\s\S]*FOR (?:INSERT|UPDATE|DELETE) TO authenticated/i);
  });
});
