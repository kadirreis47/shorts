-- Slice 3A: additive ownership foundation only.
-- Legacy rows intentionally remain unclaimed (user_id IS NULL) until an
-- explicit ownership migration and final RLS cutover are separately approved.

ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS user_id uuid;

-- Authenticated renderer inserts receive their current Supabase identity.
-- service_role has no caller JWT, so auth.uid() is NULL rather than assigning
-- ambiguous ownership to server-originated rows.
ALTER TABLE public.channels ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.videos ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.assets ALTER COLUMN user_id SET DEFAULT auth.uid();
-- app_settings deliberately has no default yet: its legacy global key primary
-- key prevents safe per-user inserts until Slice 3B replaces that identity.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'channels_user_id_fkey') THEN
    ALTER TABLE public.channels
      ADD CONSTRAINT channels_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'videos_user_id_fkey') THEN
    ALTER TABLE public.videos
      ADD CONSTRAINT videos_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assets_user_id_fkey') THEN
    ALTER TABLE public.assets
      ADD CONSTRAINT assets_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_settings_user_id_fkey') THEN
    ALTER TABLE public.app_settings
      ADD CONSTRAINT app_settings_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
  END IF;

  -- These candidate keys support same-owner relationships while preserving
  -- nullable legacy ownership. The existing primary keys remain unchanged.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'channels_id_user_id_key') THEN
    ALTER TABLE public.channels
      ADD CONSTRAINT channels_id_user_id_key UNIQUE (id, user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'videos_channel_user_id_fkey') THEN
    ALTER TABLE public.videos
      ADD CONSTRAINT videos_channel_user_id_fkey
      FOREIGN KEY (channel_id, user_id)
      REFERENCES public.channels(id, user_id)
      ON DELETE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assets_channel_user_id_fkey') THEN
    ALTER TABLE public.assets
      ADD CONSTRAINT assets_channel_user_id_fkey
      FOREIGN KEY (channel_id, user_id)
      REFERENCES public.channels(id, user_id)
      ON DELETE SET NULL (channel_id) NOT VALID;
  END IF;

  -- This is additive: the existing global key primary key remains in place.
  -- Slice 3B will safely migrate settings identity to (user_id, key).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_settings_user_id_key_key') THEN
    ALTER TABLE public.app_settings
      ADD CONSTRAINT app_settings_user_id_key_key UNIQUE (user_id, key);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_channels_user_id ON public.channels (user_id);
CREATE INDEX IF NOT EXISTS idx_videos_user_id ON public.videos (user_id);
CREATE INDEX IF NOT EXISTS idx_videos_user_id_channel_id ON public.videos (user_id, channel_id);
CREATE INDEX IF NOT EXISTS idx_assets_user_id ON public.assets (user_id);
-- No RLS policies, grants, storage policies, or legacy rows are changed here.
