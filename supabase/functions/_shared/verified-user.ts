import { createClient } from "npm:@supabase/supabase-js@2";
import { extractBearerToken } from "./auth-header.ts";

export type VerifiedUserResult =
  | { ok: true; userId: string }
  | { ok: false; status: 401 | 503; error: string };

export async function getVerifiedUser(req: Request): Promise<VerifiedUserResult> {
  const token = extractBearerToken(req.headers.get("Authorization"));
  if (!token) return { ok: false, status: 401, error: "Authentication is required." };

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    return { ok: false, status: 503, error: "Authentication validation is unavailable." };
  }

  try {
    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await authClient.auth.getUser(token);
    if (error) {
      const status = error.status === 401 || error.status === 403 ? 401 : 503;
      return {
        ok: false,
        status,
        error: status === 401 ? "Authentication is required." : "Authentication validation is unavailable.",
      };
    }
    if (!data.user?.id) return { ok: false, status: 401, error: "Authentication is required." };
    return { ok: true, userId: data.user.id };
  } catch {
    return { ok: false, status: 503, error: "Authentication validation is unavailable." };
  }
}
