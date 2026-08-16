import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { V1_EDGE_FUNCTIONS } from '@/app/v1Features';

const migrationPath =
  'supabase/migrations/20260815000000_enforce_v1_feature_table_allowlist.sql';
const migration = readFileSync(migrationPath, 'utf8');
const tableArray = migration.match(/FOREACH target_table IN ARRAY ARRAY\[([\s\S]*?)\]\s+LOOP/)?.[1] ?? '';
const lockedTables = [...tableArray.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);

const expectedLockedTables = [
  'ab_tests', 'analytics_snapshots', 'audience_personas', 'auto_clip_jobs',
  'auto_replies', 'automation_rules', 'avatar_presets', 'brand_kits',
  'broll_suggestions', 'bulk_jobs', 'bulk_thumbnail_jobs', 'collaboration_notes',
  'comment_sentiment', 'comments', 'competitor_channels', 'content_gaps',
  'content_ideas', 'content_pillars', 'content_series', 'cross_platform_posts',
  'cross_platform_schedules', 'dub_jobs', 'faceless_projects', 'hashtag_strategies',
  'hook_tests', 'intro_outro_designs', 'monetization_snapshots', 'multi_aspect_renders',
  'music_match_suggestions', 'niche_trends', 'optimal_times', 'predictive_scores',
  'prompt_templates', 'repurposing_jobs', 'retention_replays', 'revenue_forecasts',
  'schedule_queue', 'script_analyses', 'script_template_library', 'series',
  'series_videos', 'silence_removal_jobs', 'storyboards', 'subscriber_growth',
  'team_members', 'templates', 'thumbnail_heatmaps', 'thumbnails',
  'title_optimizations', 'trend_alerts', 'trend_topics', 'video_chapters',
  'video_seo', 'video_templates', 'viral_formulas', 'voice_clones',
  'workflow_automations',
];

describe('V1 deferred feature table quarantine', () => {
  it('uses an explicit, complete deferred table list', () => {
    expect(lockedTables).toEqual(expectedLockedTables);
    expect(new Set(lockedTables).size).toBe(lockedTables.length);
  });

  it('removes every policy and every role privilege without modifying rows', () => {
    expect(migration).toContain("WHERE schemaname = 'public'\n        AND tablename = target_table");
    expect(migration).toContain("'DROP POLICY IF EXISTS %I ON public.%I'");
    expect(migration).toContain("'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role'");
    expect(migration).not.toMatch(/\b(?:DELETE FROM|TRUNCATE|UPDATE|INSERT INTO)\s+public\./i);
  });

  it('does not touch hardened core, secret, activity, or private media boundaries', () => {
    for (const protectedTable of [
      'channels', 'videos', 'assets', 'app_settings', 'activity_log', 'api_keys',
      'youtube_tokens', 'character_profiles',
    ]) {
      expect(lockedTables).not.toContain(protectedTable);
    }

    expect(migration).not.toContain('storage.objects');
    expect(migration).not.toContain("bucket_id = 'media'");
  });

  it('keeps Studio visual presets authenticated read-only', () => {
    expect(migration).toContain('REVOKE ALL PRIVILEGES ON TABLE public.visual_styles FROM PUBLIC, anon, authenticated;');
    expect(migration).toContain('GRANT SELECT ON TABLE public.visual_styles TO authenticated;');
    expect(migration).toContain('CREATE POLICY visual_styles_authenticated_select');
    expect(migration).not.toMatch(/GRANT\s+(?:INSERT|UPDATE|DELETE|ALL)[^;]*visual_styles/i);
  });

  it('preserves independent security migrations unchanged by contract', () => {
    const apiKeys = readFileSync('supabase/migrations/20260812000002_restrict_api_keys_to_service_role.sql', 'utf8');
    const core = readFileSync('supabase/migrations/20260813000002_scope_app_settings_and_isolate_core_reads.sql', 'utf8');
    const activity = readFileSync('supabase/migrations/20260814000000_secure_dashboard_activity_log.sql', 'utf8');
    const youtube = readFileSync('supabase/migrations/20260814000001_quarantine_legacy_youtube_tokens.sql', 'utf8');
    const media = readFileSync('supabase/migrations/20260814000002_secure_private_owner_media_storage.sql', 'utf8');

    expect(apiKeys).toContain('GRANT SELECT ON TABLE public.api_keys TO service_role;');
    expect(core).toContain('CREATE POLICY videos_authenticated_select ON public.videos');
    expect(activity).toContain('CREATE POLICY activity_log_authenticated_select ON public.activity_log');
    expect(youtube).toContain('REVOKE ALL PRIVILEGES ON TABLE public.youtube_tokens');
    expect(media).toContain("bucket_id = 'media'");
  });
});

describe('V1 Edge Function deployment contract', () => {
  it('matches the renderer allowlist and retains retired YouTube endpoints only as fail-closed deployments', () => {
    const manifest = JSON.parse(
      readFileSync('supabase/functions/v1-function-allowlist.json', 'utf8'),
    ) as { active: string[]; retiredFailClosed: string[] };

    expect(manifest.active).toEqual([...V1_EDGE_FUNCTIONS]);
    expect(manifest.retiredFailClosed).toEqual(['youtube-auth', 'youtube-publish']);
  });

  it('keeps every approved function present and treats all other function directories as deferred', () => {
    const directories = readdirSync('supabase/functions', { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
      .map((entry) => entry.name);
    const approvedOrRetired = new Set([...V1_EDGE_FUNCTIONS, 'youtube-auth', 'youtube-publish']);
    const deferred = directories.filter((name) => !approvedOrRetired.has(name as never));

    for (const active of V1_EDGE_FUNCTIONS) expect(directories).toContain(active);
    expect(deferred).toEqual(expect.arrayContaining([
      'auto-clip', 'clone-voice', 'cross-platform-adapt', 'generate-avatar',
      'revenue-forecast', 'trend-research',
    ]));
  });

  it('enforces the function allowlist in the shared renderer client', () => {
    const client = readFileSync('src/lib/api/client.ts', 'utf8');
    expect(client).toContain('if (!isV1EdgeFunction(endpoint))');
    expect(client).toContain('This feature is not available in ShortsFlow V1.');
  });
});
