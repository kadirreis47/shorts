import { supabase } from '@/lib/supabase';

const FUNCTION_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRY_COUNT = 2;
const RETRY_DELAY_MS = 500;

export type ApiErrorCode =
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'INVALID_RESPONSE'
  | 'REQUEST_FAILED';

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status?: number;
  readonly details?: unknown;
  readonly cause?: unknown;

  constructor(
    message: string,
    options: {
      code?: ApiErrorCode;
      status?: number;
      details?: unknown;
      cause?: unknown;
    } = {},
  ) {
    super(message);

    this.name = 'ApiError';
    this.code = options.code ?? 'REQUEST_FAILED';
    this.status = options.status;
    this.details = options.details;
    this.cause = options.cause;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  timeoutMs?: number;
  retryCount?: number;
}

interface ErrorPayload {
  error?: string;
  message?: string;
  details?: unknown;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function statusToErrorCode(status: number): ApiErrorCode {
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 408) return 'TIMEOUT';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'SERVER_ERROR';

  return 'REQUEST_FAILED';
}

function shouldRetry(status?: number): boolean {
  if (status === undefined) return true;

  return status === 408 || status === 429 || status >= 500;
}

async function getAuthorizationHeader(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const token =
    session?.access_token ??
    import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

  if (!token) {
    throw new ApiError('Supabase yetkilendirme anahtarı bulunamadı.', {
      code: 'UNAUTHORIZED',
    });
  }

  return `Bearer ${token}`;
}

async function parseErrorResponse(response: Response): Promise<ErrorPayload> {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    return response.json().catch(() => ({}));
  }

  const text = await response.text().catch(() => '');

  return {
    message: text || response.statusText,
  };
}

async function parseSuccessResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    try {
      return (await response.json()) as T;
    } catch (error) {
      throw new ApiError('Sunucudan geçersiz JSON yanıtı alındı.', {
        code: 'INVALID_RESPONSE',
        status: response.status,
        cause: error,
      });
    }
  }

  return (await response.text()) as T;
}

async function executeRequest<T>(
  endpoint: string,
  options: ApiRequestOptions,
): Promise<T> {
  const {
    body,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retryCount = DEFAULT_RETRY_COUNT,
    headers,
    signal,
    ...requestInit
  } = options;

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError('timeoutMs sıfırdan büyük olmalıdır.');
  }

  if (!Number.isInteger(retryCount) || retryCount < 0) {
    throw new RangeError(
      'retryCount sıfır veya daha büyük bir tam sayı olmalıdır.',
    );
  }

  const authorization = await getAuthorizationHeader();

  let lastError: unknown;

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    const controller = new AbortController();

    const abortFromExternalSignal = () => {
      controller.abort();
    };

    if (signal) {
      if (signal.aborted) {
        controller.abort();
      } else {
        signal.addEventListener('abort', abortFromExternalSignal, {
          once: true,
        });
      }
    }

    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    const startedAt = performance.now();

    try {
      const response = await fetch(`${FUNCTION_BASE}/${endpoint}`, {
        ...requestInit,
        headers: {
          Authorization: authorization,
          'Content-Type': 'application/json',
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const payload = await parseErrorResponse(response);

        throw new ApiError(
          payload.error ??
            payload.message ??
            `İstek başarısız oldu (${response.status}).`,
          {
            code: statusToErrorCode(response.status),
            status: response.status,
            details: payload.details,
          },
        );
      }

      if (import.meta.env.DEV) {
        const duration = Math.round(performance.now() - startedAt);

        console.debug(
          `[API] ${requestInit.method ?? 'GET'} ${endpoint} ${duration}ms`,
        );
      }

      return await parseSuccessResponse<T>(response);
    } catch (error) {
      const timedOut = controller.signal.aborted && !signal?.aborted;

      if (timedOut) {
        lastError = new ApiError(
          `İşlem ${timeoutMs} ms içinde tamamlanamadı.`,
          {
            code: 'TIMEOUT',
            cause: error,
          },
        );
      } else if (error instanceof ApiError) {
        lastError = error;
      } else if (signal?.aborted) {
        throw error;
      } else {
        lastError = new ApiError(
          'Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edin.',
          {
            code: 'NETWORK_ERROR',
            cause: error,
          },
        );
      }

      const status =
        lastError instanceof ApiError ? lastError.status : undefined;

      const canRetry = attempt < retryCount && shouldRetry(status);

      if (!canRetry) {
        throw lastError;
      }

      await sleep(RETRY_DELAY_MS * 2 ** attempt);
    } finally {
      clearTimeout(timeoutId);

      signal?.removeEventListener('abort', abortFromExternalSignal);
    }
  }

  throw lastError;
}

export const apiClient = {
  get<T>(
    endpoint: string,
    options: Omit<ApiRequestOptions, 'method' | 'body'> = {},
  ): Promise<T> {
    return executeRequest<T>(endpoint, {
      ...options,
      method: 'GET',
    });
  },

  post<T>(
    endpoint: string,
    body?: unknown,
    options: Omit<ApiRequestOptions, 'method' | 'body'> = {},
  ): Promise<T> {
    return executeRequest<T>(endpoint, {
      ...options,
      method: 'POST',
      body,
    });
  },

  put<T>(
    endpoint: string,
    body?: unknown,
    options: Omit<ApiRequestOptions, 'method' | 'body'> = {},
  ): Promise<T> {
    return executeRequest<T>(endpoint, {
      ...options,
      method: 'PUT',
      body,
    });
  },

  patch<T>(
    endpoint: string,
    body?: unknown,
    options: Omit<ApiRequestOptions, 'method' | 'body'> = {},
  ): Promise<T> {
    return executeRequest<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body,
    });
  },

  delete<T>(
    endpoint: string,
    options: Omit<ApiRequestOptions, 'method' | 'body'> = {},
  ): Promise<T> {
    return executeRequest<T>(endpoint, {
      ...options,
      method: 'DELETE',
    });
  },
};

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}