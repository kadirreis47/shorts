-- ShortsFlow V1 exposes only the proven production workflow. Preserve deferred
-- feature data while removing every ordinary and server-role table capability
-- until those features receive a dedicated ownership and authorization design.
DO $$
DECLARE
  target_table text;
  existing_policy record;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'ab_tests',
    'analytics_snapshots',
    'audience_personas',
    'auto_clip_jobs',
    'auto_replies',
    'automation_rules',
    'avatar_presets',
    'brand_kits',
    'broll_suggestions',
    'bulk_jobs',
    'bulk_thumbnail_jobs',
    'collaboration_notes',
    'comment_sentiment',
    'comments',
    'competitor_channels',
    'content_gaps',
    'content_ideas',
    'content_pillars',
    'content_series',
    'cross_platform_posts',
    'cross_platform_schedules',
    'dub_jobs',
    'faceless_projects',
    'hashtag_strategies',
    'hook_tests',
    'intro_outro_designs',
    'monetization_snapshots',
    'multi_aspect_renders',
    'music_match_suggestions',
    'niche_trends',
    'optimal_times',
    'predictive_scores',
    'prompt_templates',
    'repurposing_jobs',
    'retention_replays',
    'revenue_forecasts',
    'schedule_queue',
    'script_analyses',
    'script_template_library',
    'series',
    'series_videos',
    'silence_removal_jobs',
    'storyboards',
    'subscriber_growth',
    'team_members',
    'templates',
    'thumbnail_heatmaps',
    'thumbnails',
    'title_optimizations',
    'trend_alerts',
    'trend_topics',
    'video_chapters',
    'video_seo',
    'video_templates',
    'viral_formulas',
    'voice_clones',
    'workflow_automations'
  ]
  LOOP
    IF to_regclass(format('public.%I', target_table)) IS NULL THEN
      RAISE EXCEPTION 'Expected deferred V1 table public.% is missing', target_table;
    END IF;

    FOR existing_policy IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = target_table
    LOOP
      EXECUTE format(
        'DROP POLICY IF EXISTS %I ON public.%I',
        existing_policy.policyname,
        target_table
      );
    END LOOP;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target_table);
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role',
      target_table
    );
  END LOOP;
END
$$;

-- visual_styles is seeded, non-secret Studio reference data. It is the only
-- long-tail global table retained for V1 and is authenticated read-only.
DO $$
DECLARE
  existing_policy record;
BEGIN
  FOR existing_policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'visual_styles'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.visual_styles',
      existing_policy.policyname
    );
  END LOOP;
END
$$;

ALTER TABLE public.visual_styles ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.visual_styles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.visual_styles TO authenticated;

CREATE POLICY visual_styles_authenticated_select
  ON public.visual_styles
  FOR SELECT
  TO authenticated
  USING (true);

-- character_profiles remains an active private Studio dependency. It is not
-- part of this quarantine and requires the next dedicated ownership slice.
