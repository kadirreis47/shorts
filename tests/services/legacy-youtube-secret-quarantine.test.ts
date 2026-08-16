import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20260814000001_quarantine_legacy_youtube_tokens.sql',
  'utf8',
);
const youtubeAuth = readFileSync('supabase/functions/youtube-auth/index.ts', 'utf8');
const youtubePublish = readFileSync('supabase/functions/youtube-publish/index.ts', 'utf8');

describe('legacy YouTube credential quarantine', () => {
  it('preserves rows while removing all application-role privileges and policies', () => {
    expect(migration).toContain('ALTER TABLE public.youtube_tokens ENABLE ROW LEVEL SECURITY;');
    expect(migration).toContain("tablename = 'youtube_tokens'");
    expect(migration).toContain("DROP POLICY IF EXISTS %I ON public.youtube_tokens");
    expect(migration).toContain('REVOKE ALL PRIVILEGES ON TABLE public.youtube_tokens\n  FROM PUBLIC, anon, authenticated, service_role;');
    expect(migration).not.toMatch(/\b(?:DELETE FROM|TRUNCATE|UPDATE)\s+public\.youtube_tokens\b/i);
    expect(migration).not.toMatch(/\bGRANT\b[\s\S]*\byoutube_tokens\b/i);
  });

  it('makes both legacy endpoints fail closed before any token, provider, storage, or database work', () => {
    for (const source of [youtubeAuth, youtubePublish]) {
      expect(source).toContain('status: 410');
      expect(source).toContain('This legacy YouTube endpoint is unavailable.');
      expect(source).not.toContain('youtube_tokens');
      expect(source).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
      expect(source).not.toContain('api_keys');
      expect(source).not.toContain('access_token');
      expect(source).not.toContain('refresh_token');
      expect(source).not.toContain('googleapis.com');
      expect(source).not.toContain('console.');
    }
  });

  it('keeps supported renderer publishing on the native handoff path', () => {
    for (const file of ['src/views/Studio.tsx', 'src/views/Videos.tsx']) {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toContain('publishToYouTube(');
      expect(source).not.toContain('getYouTubeAuthUrl(');
      expect(source).not.toContain('youtube-auth');
      expect(source).not.toContain('youtube-publish');
    }

    const nativeIpc = readFileSync('electron/youtube-ipc.cjs', 'utf8');
    const ownerBinding = readFileSync('electron/youtube-owner-context.cjs', 'utf8');
    expect(nativeIpc).not.toContain('youtube_tokens');
    expect(ownerBinding).toContain('createYouTubeOwnerContext');
  });

  it('does not weaken independent credential or core-data boundaries', () => {
    const apiKeysMigration = readFileSync(
      'supabase/migrations/20260812000002_restrict_api_keys_to_service_role.sql',
      'utf8',
    );
    const coreMigration = readFileSync(
      'supabase/migrations/20260813000002_scope_app_settings_and_isolate_core_reads.sql',
      'utf8',
    );
    const activityMigration = readFileSync(
      'supabase/migrations/20260814000000_secure_dashboard_activity_log.sql',
      'utf8',
    );

    expect(apiKeysMigration).toContain('REVOKE ALL PRIVILEGES ON TABLE public.api_keys FROM PUBLIC, anon, authenticated;');
    expect(coreMigration).toContain('CREATE POLICY videos_authenticated_select ON public.videos');
    expect(activityMigration).toContain('CREATE POLICY activity_log_authenticated_select ON public.activity_log');
  });
});
