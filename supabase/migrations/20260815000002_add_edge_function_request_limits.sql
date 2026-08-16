-- Server-only, atomic request accounting for authenticated V1 Edge Functions.
CREATE TABLE IF NOT EXISTS public.edge_function_request_windows (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  function_name text NOT NULL CHECK (function_name ~ '^[a-z0-9-]{1,64}$'),
  window_kind text NOT NULL CHECK (window_kind IN ('burst', 'daily')),
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  PRIMARY KEY (user_id, function_name, window_kind)
);

ALTER TABLE public.edge_function_request_windows ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.edge_function_request_windows FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.edge_function_request_windows FROM service_role;

CREATE OR REPLACE FUNCTION public.consume_edge_function_quota(
  p_user_id uuid,
  p_function_name text,
  p_burst_window_seconds integer,
  p_burst_max_requests integer,
  p_daily_max_requests integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  current_window timestamptz := now();
  burst_allowed boolean;
  daily_allowed boolean;
BEGIN
  IF p_user_id IS NULL OR p_function_name !~ '^[a-z0-9-]{1,64}$'
     OR p_burst_window_seconds NOT BETWEEN 1 AND 3600
     OR p_burst_max_requests NOT BETWEEN 1 AND 1000
     OR p_daily_max_requests NOT BETWEEN 1 AND 100000 THEN
    RAISE EXCEPTION 'Invalid rate limit request';
  END IF;

  INSERT INTO public.edge_function_request_windows AS quota
    (user_id, function_name, window_kind, window_started_at, request_count)
  VALUES (p_user_id, p_function_name, 'burst', current_window, 1)
  ON CONFLICT (user_id, function_name, window_kind) DO UPDATE
  SET window_started_at = CASE
        WHEN quota.window_started_at + make_interval(secs => p_burst_window_seconds) <= now() THEN current_window
        ELSE quota.window_started_at
      END,
      request_count = CASE
        WHEN quota.window_started_at + make_interval(secs => p_burst_window_seconds) <= now() THEN 1
        ELSE LEAST(quota.request_count + 1, p_burst_max_requests + 1)
      END
  RETURNING request_count <= p_burst_max_requests INTO burst_allowed;

  INSERT INTO public.edge_function_request_windows AS quota
    (user_id, function_name, window_kind, window_started_at, request_count)
  VALUES (p_user_id, p_function_name, 'daily', current_window, 1)
  ON CONFLICT (user_id, function_name, window_kind) DO UPDATE
  SET window_started_at = CASE
        WHEN quota.window_started_at + interval '24 hours' <= now() THEN current_window
        ELSE quota.window_started_at
      END,
      request_count = CASE
        WHEN quota.window_started_at + interval '24 hours' <= now() THEN 1
        ELSE LEAST(quota.request_count + 1, p_daily_max_requests + 1)
      END
  RETURNING request_count <= p_daily_max_requests INTO daily_allowed;

  RETURN burst_allowed AND daily_allowed;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_edge_function_quota(uuid, text, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_edge_function_quota(uuid, text, integer, integer, integer) TO service_role;
