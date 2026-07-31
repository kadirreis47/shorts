import { AppError, normalizeAppError } from '@/core/errors';
import type { ApplicationEventMap, EventBus } from '@/core/events';
import { withTimeout } from '@/lib/async';

export interface ServiceExecutionOptions {
  operation: string;
  timeoutMs?: number;
  timeoutMessage?: string;
  fallbackMessage: string;
}

export interface ServiceExecutor {
  execute<T>(
    task: () => PromiseLike<T>,
    options: ServiceExecutionOptions,
  ): Promise<T>;
}

const DEFAULT_TIMEOUT_MS = 8000;

export function createServiceExecutor(
  eventBus?: EventBus<ApplicationEventMap>,
): ServiceExecutor {
  return {
    async execute<T>(task: () => PromiseLike<T>, options: ServiceExecutionOptions) {
      const startedAt = Date.now();

      try {
        const result = await withTimeout(
          Promise.resolve().then(task),
          options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
          options.timeoutMessage ?? options.fallbackMessage,
        );

        await eventBus?.emit('service:operation-succeeded', {
          operation: options.operation,
          durationMs: Date.now() - startedAt,
          completedAt: new Date().toISOString(),
        });

        return result;
      } catch (error) {
        const appError = normalizeAppError(error, {
          operation: options.operation,
          fallbackMessage: options.fallbackMessage,
        });

        await eventBus?.emit('service:operation-failed', {
          operation: options.operation,
          code: appError.code,
          message: appError.userMessage,
          retryable: appError.retryable,
          durationMs: Date.now() - startedAt,
          failedAt: new Date().toISOString(),
        });

        throw appError;
      }
    },
  };
}

export function configurationError(operation: string, message: string) {
  return new AppError(message, {
    code: 'CONFIGURATION_ERROR',
    userMessage: message,
    operation,
    retryable: false,
  });
}
