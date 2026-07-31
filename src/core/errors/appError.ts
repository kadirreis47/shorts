import { isTimeoutError } from '@/lib/async';

export type AppErrorCode =
  | 'CONFIGURATION_ERROR'
  | 'NETWORK_ERROR'
  | 'NOT_FOUND'
  | 'TIMEOUT'
  | 'VALIDATION_ERROR'
  | 'SERVICE_ERROR'
  | 'UNKNOWN_ERROR';

export interface AppErrorOptions {
  code: AppErrorCode;
  userMessage: string;
  operation?: string;
  retryable?: boolean;
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly userMessage: string;
  readonly operation?: string;
  readonly retryable: boolean;
  readonly cause?: unknown;

  constructor(message: string, options: AppErrorOptions) {
    super(message);
    this.name = 'AppError';
    this.code = options.code;
    this.userMessage = options.userMessage;
    this.operation = options.operation;
    this.retryable = options.retryable ?? false;
    this.cause = options.cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function readMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Beklenmeyen bir hata oluştu.';
}

function looksLikeNetworkError(message: string) {
  const normalized = message.toLocaleLowerCase('tr-TR');
  return (
    normalized.includes('fetch') ||
    normalized.includes('network') ||
    normalized.includes('bağlantı') ||
    normalized.includes('failed to fetch')
  );
}

export interface NormalizeErrorOptions {
  operation: string;
  fallbackMessage: string;
}

export function normalizeAppError(
  error: unknown,
  options: NormalizeErrorOptions,
): AppError {
  if (error instanceof AppError) return error;

  const message = readMessage(error);

  if (isTimeoutError(error)) {
    return new AppError(message, {
      code: 'TIMEOUT',
      userMessage: options.fallbackMessage,
      operation: options.operation,
      retryable: true,
      cause: error,
    });
  }

  if (looksLikeNetworkError(message)) {
    return new AppError(message, {
      code: 'NETWORK_ERROR',
      userMessage: 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.',
      operation: options.operation,
      retryable: true,
      cause: error,
    });
  }

  return new AppError(message, {
    code: 'SERVICE_ERROR',
    userMessage: options.fallbackMessage,
    operation: options.operation,
    retryable: false,
    cause: error,
  });
}

export function getUserErrorMessage(error: unknown, fallback: string) {
  if (error instanceof AppError) return error.userMessage;
  return error instanceof Error ? error.message : fallback;
}
