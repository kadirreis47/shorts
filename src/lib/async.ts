export class TimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(
    message = 'İşlem zaman aşımına uğradı',
    timeoutMs = 0,
  ) {
    super(message);

    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export async function withTimeout<T>(
  operation: PromiseLike<T>,
  timeoutMs: number,
  message = 'İşlem zaman aşımına uğradı',
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError('timeoutMs sıfırdan büyük, geçerli bir sayı olmalıdır.');
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(message, timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      Promise.resolve(operation),
      timeoutPromise,
    ]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

export function isTimeoutError(error: unknown): error is TimeoutError {
  return error instanceof TimeoutError;
}