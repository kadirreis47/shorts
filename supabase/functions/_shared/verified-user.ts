import { createClient } from "npm:@supabase/supabase-js@2";
import { createVerifiedUserVerifier } from "./verified-user-verifier.ts";
export type { VerifiedUserResult } from "./verified-user-verifier.ts";

export const getVerifiedUser = createVerifiedUserVerifier({
  getEnvironment: (name) => Deno.env.get(name),
  createAuthClient: (url, anonKey) => createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
});
