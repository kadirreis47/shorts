# Sprint 6.7.2 — AI Pipeline Resilience

## Added
- Per-step retry policies.
- Exponential backoff with configurable limits.
- Retry filtering by normalized application error code.
- Abort-aware retry waiting.
- Typed retry lifecycle event.
- Active run snapshots for future UI progress and cancellation controls.
- Three-attempt resilience policy for Studio AI provider requests.

## Behavior
Validation failures are not retried. Network, timeout, and transient service errors may be retried. Cancelling a run immediately prevents further attempts.
