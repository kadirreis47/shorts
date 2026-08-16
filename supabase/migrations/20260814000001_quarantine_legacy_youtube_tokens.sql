/*
 * Quarantine the retired database-backed YouTube OAuth path.
 *
 * Supported V1 YouTube OAuth and publishing use the Electron encrypted
 * credential vault. Existing rows are deliberately preserved but no runtime
 * role receives access to this legacy secret table.
 */
BEGIN;

ALTER TABLE public.youtube_tokens ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  legacy_policy record;
BEGIN
  FOR legacy_policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'youtube_tokens'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.youtube_tokens',
      legacy_policy.policyname
    );
  END LOOP;
END;
$$;

-- No application role, including service_role, may use the retired token path.
-- Database owners retain emergency/manual recovery authority outside this API.
REVOKE ALL PRIVILEGES ON TABLE public.youtube_tokens
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
