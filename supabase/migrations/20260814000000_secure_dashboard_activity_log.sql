-- Slice 3C: secure the Dashboard activity feed without claiming legacy rows.
-- schedule_queue is no longer a Dashboard dependency; upcoming items are
-- derived from the already owner-scoped videos table.

ALTER TABLE public.activity_log
  ADD COLUMN IF NOT EXISTS user_id uuid DEFAULT auth.uid();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'activity_log_user_id_fkey'
      AND conrelid = 'public.activity_log'::regclass
  ) THEN
    ALTER TABLE public.activity_log
      ADD CONSTRAINT activity_log_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
  END IF;

  -- Preserve existing NULL-owned rows while requiring every new activity row,
  -- including service_role writes, to carry an explicit owner.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'activity_log_user_id_required'
      AND conrelid = 'public.activity_log'::regclass
  ) THEN
    ALTER TABLE public.activity_log
      ADD CONSTRAINT activity_log_user_id_required
      CHECK (user_id IS NOT NULL) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'videos_id_user_id_key'
      AND conrelid = 'public.videos'::regclass
  ) THEN
    ALTER TABLE public.videos
      ADD CONSTRAINT videos_id_user_id_key UNIQUE (id, user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'activity_log_channel_user_id_fkey'
      AND conrelid = 'public.activity_log'::regclass
  ) THEN
    ALTER TABLE public.activity_log
      ADD CONSTRAINT activity_log_channel_user_id_fkey
      FOREIGN KEY (channel_id, user_id)
      REFERENCES public.channels(id, user_id)
      ON DELETE SET NULL (channel_id) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'activity_log_video_user_id_fkey'
      AND conrelid = 'public.activity_log'::regclass
  ) THEN
    ALTER TABLE public.activity_log
      ADD CONSTRAINT activity_log_video_user_id_fkey
      FOREIGN KEY (video_id, user_id)
      REFERENCES public.videos(id, user_id)
      ON DELETE SET NULL (video_id) NOT VALID;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_activity_log_user_created_at
  ON public.activity_log (user_id, created_at DESC);

DROP POLICY IF EXISTS activity_log_select ON public.activity_log;
DROP POLICY IF EXISTS activity_log_insert ON public.activity_log;
DROP POLICY IF EXISTS activity_log_update ON public.activity_log;
DROP POLICY IF EXISTS activity_log_delete ON public.activity_log;
DROP POLICY IF EXISTS activity_log_authenticated_select ON public.activity_log;

REVOKE ALL PRIVILEGES ON TABLE public.activity_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.activity_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.activity_log TO service_role;

CREATE POLICY activity_log_authenticated_select ON public.activity_log
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Existing user_id IS NULL activity remains physically preserved but is not
-- visible to authenticated clients. Server-side writers must supply an
-- explicitly verified user_id; service_role does not receive auth.uid().
