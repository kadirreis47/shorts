-- Slice 3A.1: secure core writes while legacy reads remain transitional.
-- Apply immediately after 20260813000000_add_core_user_ownership_foundation.sql.

-- Remove the original permissive write policies. SELECT policies intentionally
-- remain untouched until legacy ownership has an explicit migration path.
DROP POLICY IF EXISTS channels_insert ON public.channels;
DROP POLICY IF EXISTS channels_update ON public.channels;
DROP POLICY IF EXISTS channels_delete ON public.channels;
DROP POLICY IF EXISTS videos_insert ON public.videos;
DROP POLICY IF EXISTS videos_update ON public.videos;
DROP POLICY IF EXISTS videos_delete ON public.videos;
DROP POLICY IF EXISTS assets_insert ON public.assets;
DROP POLICY IF EXISTS assets_update ON public.assets;
DROP POLICY IF EXISTS assets_delete ON public.assets;
DROP POLICY IF EXISTS app_settings_insert ON public.app_settings;
DROP POLICY IF EXISTS app_settings_update ON public.app_settings;
DROP POLICY IF EXISTS app_settings_delete ON public.app_settings;

-- Remove inherited public/anon write access. Re-grant only the authenticated
-- operations protected below and trusted service_role server operations.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.channels, public.videos, public.assets, public.app_settings FROM PUBLIC, anon;
GRANT INSERT, UPDATE, DELETE ON TABLE public.channels, public.videos, public.assets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.channels, public.videos, public.assets, public.app_settings TO service_role;

CREATE POLICY channels_authenticated_insert ON public.channels
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY channels_authenticated_update ON public.channels
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY channels_authenticated_delete ON public.channels
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY videos_authenticated_insert ON public.videos
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY videos_authenticated_update ON public.videos
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY videos_authenticated_delete ON public.videos
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY assets_authenticated_insert ON public.assets
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY assets_authenticated_update ON public.assets
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY assets_authenticated_delete ON public.assets
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- app_settings retains a global key primary key in Slice 3A. Its writes are
-- intentionally unavailable until Slice 3B establishes per-user key identity.
-- Broad SELECT remains temporarily for legacy compatibility.
