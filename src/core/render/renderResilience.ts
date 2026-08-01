export type RenderFailureKind =
  | 'cancelled'
  | 'configuration'
  | 'resource'
  | 'temporary'
  | 'hardware'
  | 'unknown';

export interface RenderRetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryTemporaryErrors: boolean;
  retryResourceErrors: boolean;
  retryHardwareErrors: boolean;
}

export interface RenderRetryDecision {
  retry: boolean;
  kind: RenderFailureKind;
  reason: string;
  delayMs: number;
}

export interface RenderCircuitBreakerOptions {
  failureThreshold: number;
  cooldownMs: number;
}

export interface RenderCircuitBreakerSnapshot {
  adapterId: string;
  state: 'closed' | 'open' | 'half-open';
  consecutiveFailures: number;
  openedAt: string | null;
  retryAfterMs: number;
}

export interface RenderCircuitBreaker {
  canExecute(adapterId: string): boolean;
  recordSuccess(adapterId: string): void;
  recordFailure(adapterId: string): RenderCircuitBreakerSnapshot;
  snapshot(adapterId: string): RenderCircuitBreakerSnapshot;
  reset(adapterId?: string): void;
}

export const DEFAULT_RENDER_RETRY_POLICY: RenderRetryPolicy = {
  maxAttempts: 2,
  baseDelayMs: 1_000,
  maxDelayMs: 8_000,
  retryTemporaryErrors: true,
  retryResourceErrors: true,
  retryHardwareErrors: false,
};

export function classifyRenderFailure(error: unknown): RenderFailureKind {
  if (isAbortError(error)) return 'cancelled';

  const message =
    error instanceof Error
      ? `${error.name} ${error.message}`.toLowerCase()
      : String(error).toLowerCase();

  if (
    message.includes('manifest') ||
    message.includes('validation') ||
    message.includes('adapter bulunamadı') ||
    message.includes('ffmpeg bulunamadı')
  ) {
    return 'configuration';
  }

  if (
    message.includes('nvenc') ||
    message.includes('cuda') ||
    message.includes('gpu') ||
    message.includes('encoder')
  ) {
    return 'hardware';
  }

  if (
    message.includes('enospc') ||
    message.includes('disk') ||
    message.includes('memory') ||
    message.includes('resource temporarily unavailable') ||
    message.includes('too many open files')
  ) {
    return 'resource';
  }

  if (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('ebusy') ||
    message.includes('eagain') ||
    message.includes('locked') ||
    message.includes('temporarily')
  ) {
    return 'temporary';
  }

  return 'unknown';
}

export function decideRenderRetry(input: {
  error: unknown;
  attempt: number;
  policy?: Partial<RenderRetryPolicy>;
}): RenderRetryDecision {
  const policy = {
    ...DEFAULT_RENDER_RETRY_POLICY,
    ...(input.policy ?? {}),
  };
  const kind = classifyRenderFailure(input.error);

  if (kind === 'cancelled') {
    return {
      retry: false,
      kind,
      reason: 'Render kullanıcı veya sistem tarafından iptal edildi',
      delayMs: 0,
    };
  }

  if (input.attempt >= policy.maxAttempts) {
    return {
      retry: false,
      kind,
      reason: 'Maksimum render deneme sayısına ulaşıldı',
      delayMs: 0,
    };
  }

  const allowed =
    (kind === 'temporary' && policy.retryTemporaryErrors) ||
    (kind === 'resource' && policy.retryResourceErrors) ||
    (kind === 'hardware' && policy.retryHardwareErrors);

  if (!allowed) {
    return {
      retry: false,
      kind,
      reason: `Bu hata türü tekrar denenmeye uygun değil: ${kind}`,
      delayMs: 0,
    };
  }

  const delayMs = Math.min(
    policy.maxDelayMs,
    policy.baseDelayMs * 2 ** Math.max(0, input.attempt - 1),
  );

  return {
    retry: true,
    kind,
    reason: `${kind} hatası için kontrollü yeniden deneme`,
    delayMs,
  };
}

export function createRenderCircuitBreaker(
  options: Partial<RenderCircuitBreakerOptions> = {},
): RenderCircuitBreaker {
  const config: RenderCircuitBreakerOptions = {
    failureThreshold: Math.max(1, options.failureThreshold ?? 3),
    cooldownMs: Math.max(1_000, options.cooldownMs ?? 30_000),
  };
  const entries = new Map<
    string,
    {
      failures: number;
      openedAt: number | null;
      halfOpenProbe: boolean;
    }
  >();

  return {
    canExecute(adapterId) {
      const entry = getEntry(adapterId);
      if (entry.openedAt === null) return true;

      const elapsed = Date.now() - entry.openedAt;
      if (elapsed < config.cooldownMs) return false;

      if (!entry.halfOpenProbe) {
        entry.halfOpenProbe = true;
        return true;
      }

      return false;
    },

    recordSuccess(adapterId) {
      entries.set(adapterId, {
        failures: 0,
        openedAt: null,
        halfOpenProbe: false,
      });
    },

    recordFailure(adapterId) {
      const entry = getEntry(adapterId);
      entry.failures += 1;
      entry.halfOpenProbe = false;

      if (entry.failures >= config.failureThreshold) {
        entry.openedAt = Date.now();
      }

      return snapshot(adapterId);
    },

    snapshot,

    reset(adapterId) {
      if (adapterId) entries.delete(adapterId);
      else entries.clear();
    },
  };

  function getEntry(adapterId: string) {
    let entry = entries.get(adapterId);
    if (!entry) {
      entry = {
        failures: 0,
        openedAt: null,
        halfOpenProbe: false,
      };
      entries.set(adapterId, entry);
    }
    return entry;
  }

  function snapshot(adapterId: string): RenderCircuitBreakerSnapshot {
    const entry = getEntry(adapterId);
    const elapsed =
      entry.openedAt === null ? 0 : Date.now() - entry.openedAt;
    const retryAfterMs =
      entry.openedAt === null
        ? 0
        : Math.max(0, config.cooldownMs - elapsed);

    return {
      adapterId,
      state:
        entry.openedAt === null
          ? 'closed'
          : retryAfterMs > 0
            ? 'open'
            : 'half-open',
      consecutiveFailures: entry.failures,
      openedAt:
        entry.openedAt === null
          ? null
          : new Date(entry.openedAt).toISOString(),
      retryAfterMs,
    };
  }
}

export function waitForRenderRetry(
  delayMs: number,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(abortError());
  }

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, Math.max(0, delayMs));

    const abort = () => {
      clearTimeout(timeoutId);
      reject(abortError());
    };

    signal.addEventListener('abort', abort, { once: true });
  });
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

function abortError(): Error {
  const error = new Error('Render yeniden denemesi iptal edildi.');
  error.name = 'AbortError';
  return error;
}
