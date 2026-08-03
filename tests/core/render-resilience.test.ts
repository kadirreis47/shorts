import { afterEach, describe, expect, it, vi } from 'vitest';
import { classifyRenderFailure, createRenderCircuitBreaker, decideRenderRetry } from '@/core/render/renderResilience';

describe('render resilience', () => {
  afterEach(() => vi.useRealTimers());

  it('hataları davranışlarına göre sınıflandırır', () => {
    const abort = new Error('cancel'); abort.name = 'AbortError';
    expect(classifyRenderFailure(abort)).toBe('cancelled');
    expect(classifyRenderFailure(new Error('manifest validation failed'))).toBe('configuration');
    expect(classifyRenderFailure(new Error('NVENC GPU encoder failed'))).toBe('hardware');
    expect(classifyRenderFailure(new Error('ENOSPC disk full'))).toBe('resource');
    expect(classifyRenderFailure(new Error('operation timeout'))).toBe('temporary');
  });

  it('exponential backoff uygular ve üst sınıra sabitler', () => {
    const policy = { baseDelayMs: 100, maxDelayMs: 250, maxAttempts: 5 };
    expect(decideRenderRetry({ error: new Error('timeout'), attempt: 1, policy }).delayMs).toBe(100);
    expect(decideRenderRetry({ error: new Error('timeout'), attempt: 2, policy }).delayMs).toBe(200);
    expect(decideRenderRetry({ error: new Error('timeout'), attempt: 3, policy }).delayMs).toBe(250);
  });

  it('cancelled/configuration hatalarını ve limit sonrası retryı reddeder', () => {
    const abort = new Error(); abort.name = 'AbortError';
    expect(decideRenderRetry({ error: abort, attempt: 1 }).retry).toBe(false);
    expect(decideRenderRetry({ error: new Error('manifest invalid'), attempt: 1 }).retry).toBe(false);
    expect(decideRenderRetry({ error: new Error('timeout'), attempt: 2 }).retry).toBe(false);
  });

  it('circuit breaker closed/open/half-open/success/reset akışını uygular', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const breaker = createRenderCircuitBreaker({ failureThreshold: 2, cooldownMs: 1_000 });
    expect(breaker.snapshot('fake').state).toBe('closed');
    breaker.recordFailure('fake');
    breaker.recordFailure('fake');
    expect(breaker.canExecute('fake')).toBe(false);
    expect(breaker.snapshot('fake').state).toBe('open');
    vi.advanceTimersByTime(1_000);
    expect(breaker.snapshot('fake').state).toBe('half-open');
    expect(breaker.canExecute('fake')).toBe(true);
    expect(breaker.canExecute('fake')).toBe(false);
    breaker.recordSuccess('fake');
    expect(breaker.snapshot('fake').state).toBe('closed');
    breaker.recordFailure('fake');
    breaker.reset('fake');
    expect(breaker.snapshot('fake').consecutiveFailures).toBe(0);
  });
});
