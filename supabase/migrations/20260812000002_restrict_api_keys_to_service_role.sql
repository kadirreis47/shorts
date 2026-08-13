-- Provider credentials are server-only. Edge Functions only read them via service_role.
REVOKE ALL PRIVILEGES ON TABLE public.api_keys FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.api_keys TO service_role;

-- Remove legacy client-facing RLS policies; table privileges above prevent client access.
DROP POLICY IF EXISTS "api_keys_select" ON public.api_keys;
DROP POLICY IF EXISTS "api_keys_insert" ON public.api_keys;
DROP POLICY IF EXISTS "api_keys_update" ON public.api_keys;
DROP POLICY IF EXISTS "api_keys_delete" ON public.api_keys;
