import { extractBearerToken } from './auth-header.ts';

export type VerifiedUserResult =
  | { ok: true; userId: string }
  | { ok: false; status: 401 | 503; error: string };

export function createVerifiedUserVerifier(dependencies: {
  readonly getEnvironment: (name: 'SUPABASE_URL' | 'SUPABASE_ANON_KEY') => string | undefined;
  readonly createAuthClient: (url: string, anonKey: string) => {
    auth: { getUser(token: string): Promise<{ data: { user?: { id?: string } | null }; error: { status?: number } | null }> };
  };
}) {
  return async (req: Request): Promise<VerifiedUserResult> => {
    const token = extractBearerToken(req.headers.get('Authorization'));
    if (!token) return { ok: false, status: 401, error: 'Authentication is required.' };

    const supabaseUrl = dependencies.getEnvironment('SUPABASE_URL');
    const anonKey = dependencies.getEnvironment('SUPABASE_ANON_KEY');
    if (!supabaseUrl || !anonKey) {
      return { ok: false, status: 503, error: 'Authentication validation is unavailable.' };
    }

    try {
      const { data, error } = await dependencies.createAuthClient(supabaseUrl, anonKey).auth.getUser(token);
      if (error) {
        const status = error.status === 401 || error.status === 403 ? 401 : 503;
        return {
          ok: false,
          status,
          error: status === 401 ? 'Authentication is required.' : 'Authentication validation is unavailable.',
        };
      }
      if (!data.user?.id) return { ok: false, status: 401, error: 'Authentication is required.' };
      return { ok: true, userId: data.user.id };
    } catch {
      return { ok: false, status: 503, error: 'Authentication validation is unavailable.' };
    }
  };
}
