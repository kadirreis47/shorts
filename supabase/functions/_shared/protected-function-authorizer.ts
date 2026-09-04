export type VerifiedUserResult =
  | { readonly ok: true; readonly userId: string }
  | { readonly error: string; readonly status: number };

export interface ProtectedFunctionPolicy {
  readonly burstMax: number;
  readonly dailyMax: number;
}

export interface ProtectedFunctionAuthorizerDependencies {
  readonly verifyUser: (req: Request) => Promise<VerifiedUserResult>;
  readonly getEnvironment: (name: 'SUPABASE_URL' | 'SUPABASE_SERVICE_ROLE_KEY') => string | undefined;
  readonly createServiceClient: (url: string, serviceRoleKey: string) => {
    rpc(name: 'consume_edge_function_quota', args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: unknown } | null }>;
  };
  readonly policyFor: (functionName: string) => ProtectedFunctionPolicy;
  readonly respond: (body: Record<string, unknown>, status?: number) => Response;
  readonly requestId: (req: Request) => string | null;
  readonly log?: (message: string) => void;
}

export function createProtectedFunctionAuthorizer(dependencies: ProtectedFunctionAuthorizerDependencies) {
  return async (req: Request, functionName: string): Promise<
    { readonly ok: true; readonly userId: string }
    | { readonly ok: false; readonly response: Response }
  > => {
    const verifiedUser = await dependencies.verifyUser(req);
    if ('error' in verifiedUser) {
      return { ok: false, response: dependencies.respond({ error: verifiedUser.error }, verifiedUser.status) };
    }

    const supabaseUrl = dependencies.getEnvironment('SUPABASE_URL');
    const serviceRoleKey = dependencies.getEnvironment('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      return { ok: false, response: dependencies.respond({ error: 'Service is temporarily unavailable.' }, 503) };
    }

    const limit = dependencies.policyFor(functionName);
    try {
      const service = dependencies.createServiceClient(supabaseUrl, serviceRoleKey);
      const sharedVisualFunctionName = functionName === 'analyze-discovery-candidate-semantics'
        || functionName === 'analyze-visual-spatial'
        || functionName === 'analyze-discovery-candidate-spatial'
        ? 'analyze-visual-semantics' : functionName;
      const { data, error } = await service.rpc('consume_edge_function_quota', {
        p_user_id: verifiedUser.userId,
        p_function_name: sharedVisualFunctionName,
        p_burst_window_seconds: 60,
        p_burst_max_requests: limit.burstMax,
        p_daily_max_requests: limit.dailyMax,
      });
      if (error) {
        dependencies.log?.(JSON.stringify({
          event: 'edge-function.quota-error',
          functionName,
          code: typeof error.code === 'string' ? error.code : 'UNKNOWN',
          requestId: dependencies.requestId(req),
        }));
        return { ok: false, response: dependencies.respond({ error: 'Service is temporarily unavailable.' }, 503) };
      }
      if (data !== true) {
        return { ok: false, response: dependencies.respond({ error: 'Request limit reached. Please try again shortly.' }, 429) };
      }
    } catch {
      return { ok: false, response: dependencies.respond({ error: 'Service is temporarily unavailable.' }, 503) };
    }

    return { ok: true, userId: verifiedUser.userId };
  };
}
