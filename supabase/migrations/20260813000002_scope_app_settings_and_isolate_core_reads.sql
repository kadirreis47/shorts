-- Slice 3B: per-user settings identity and core authenticated read isolation.
-- Apply after 20260813000000 and 20260813000001 in the same release.

-- app_settings used a global text key primary key. Add a surrogate key so
-- owned rows with the same setting key can coexist while NULL-owned legacy
-- rows remain preserved and unclaimed.
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE contype = 'f'
      AND confrelid = 'public.app_settings'::regclass
  ) THEN
    RAISE EXCEPTION 'Cannot replace app_settings key primary key while foreign keys reference public.app_settings.';
  END IF;
END;
$$;

ALTER TABLE public.app_settings ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.app_settings DROP CONSTRAINT IF EXISTS app_settings_pkey;
ALTER TABLE public.app_settings ADD CONSTRAINT app_settings_pkey PRIMARY KEY (id);
ALTER TABLE public.app_settings ALTER COLUMN user_id SET DEFAULT auth.uid();

-- Replace the remaining permissive core SELECT policies. Existing owner-bound
-- write policies for channels, videos, and assets remain from Slice 3A.1.
DROP POLICY IF EXISTS channels_select ON public.channels;
DROP POLICY IF EXISTS videos_select ON public.videos;
DROP POLICY IF EXISTS assets_select ON public.assets;
DROP POLICY IF EXISTS app_settings_select ON public.app_settings;
DROP POLICY IF EXISTS app_settings_authenticated_select ON public.app_settings;
DROP POLICY IF EXISTS app_settings_authenticated_insert ON public.app_settings;
DROP POLICY IF EXISTS app_settings_authenticated_update ON public.app_settings;
DROP POLICY IF EXISTS app_settings_authenticated_delete ON public.app_settings;

REVOKE SELECT ON TABLE public.channels, public.videos, public.assets, public.app_settings FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.channels, public.videos, public.assets, public.app_settings TO authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.app_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.channels, public.videos, public.assets, public.app_settings TO service_role;

CREATE POLICY channels_authenticated_select ON public.channels
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY videos_authenticated_select ON public.videos
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY assets_authenticated_select ON public.assets
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY app_settings_authenticated_select ON public.app_settings
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY app_settings_authenticated_insert ON public.app_settings
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY app_settings_authenticated_update ON public.app_settings
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY app_settings_authenticated_delete ON public.app_settings
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Legacy NULL-owned rows remain in place but are invisible and immutable to
-- authenticated clients. No ownership is inferred in this migration.
