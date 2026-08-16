-- Slice 3B follow-up: table-level least privilege for private core data.
-- RLS policies are intentionally unchanged. TRUNCATE, REFERENCES, and TRIGGER
-- are table-wide privileges and are not protected by row-level security.

REVOKE ALL PRIVILEGES ON TABLE public.channels, public.videos, public.assets, public.app_settings
  FROM PUBLIC, anon, authenticated;

-- Authenticated renderer access is limited to the DML required by the app;
-- the existing owner-scoped RLS policies remain the row authorization layer.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.channels, public.videos, public.assets, public.app_settings
  TO authenticated;

-- service_role keeps its existing direct server-side privileges. No native
-- credential boundary is changed.
