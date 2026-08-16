-- Active Studio character profiles are private user records. This is an
-- additive, fail-closed transition: legacy profiles remain physically intact
-- with user_id NULL and are not inferred or claimed by this migration.

ALTER TABLE public.character_profiles
  ADD COLUMN IF NOT EXISTS user_id uuid;

ALTER TABLE public.character_profiles
  ALTER COLUMN user_id SET DEFAULT auth.uid();

DO $$
DECLARE
  existing_policy record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'character_profiles_user_id_fkey') THEN
    ALTER TABLE public.character_profiles
      ADD CONSTRAINT character_profiles_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
  END IF;

  -- Existing NULL-owned rows are intentionally exempt, while all new or
  -- updated rows must have an explicit authenticated owner.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'character_profiles_owner_required') THEN
    ALTER TABLE public.character_profiles
      ADD CONSTRAINT character_profiles_owner_required
      CHECK (user_id IS NOT NULL) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'character_profiles_id_user_id_key') THEN
    ALTER TABLE public.character_profiles
      ADD CONSTRAINT character_profiles_id_user_id_key UNIQUE (id, user_id);
  END IF;

  -- New video writes must bind a profile owned by the same user. MATCH SIMPLE
  -- preserves native/legacy NULL character_profile_id or user_id transitions;
  -- NOT VALID preserves existing rows without claiming or rewriting them.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'videos_character_profile_user_id_fkey') THEN
    ALTER TABLE public.videos
      ADD CONSTRAINT videos_character_profile_user_id_fkey
      FOREIGN KEY (character_profile_id, user_id)
      REFERENCES public.character_profiles(id, user_id)
      ON DELETE SET NULL (character_profile_id) NOT VALID;
  END IF;

  FOR existing_policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'character_profiles'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.character_profiles',
      existing_policy.policyname
    );
  END LOOP;
END
$$;

ALTER TABLE public.character_profiles ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.character_profiles
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.character_profiles TO authenticated;

CREATE POLICY character_profiles_authenticated_select
  ON public.character_profiles
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY character_profiles_authenticated_insert
  ON public.character_profiles
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY character_profiles_authenticated_update
  ON public.character_profiles
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY character_profiles_authenticated_delete
  ON public.character_profiles
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE INDEX IF NOT EXISTS idx_character_profiles_user_id
  ON public.character_profiles (user_id);
