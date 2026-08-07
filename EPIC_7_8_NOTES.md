# Epic 7.8 Notes

- Added typed publishing domain, lifecycle state machine, persistence normalization and deterministic FIFO queue.
- Added verified-artifact gate, immutable account/target binding, metadata validation, UTC scheduling and idempotency keys.
- Added reconciliation and retry boundaries; interrupted remote work is reconciled before retry.
- Platform adapters are deliberately `authentication-required`/`planned-only` until official credential integrations exist. No fake upload success is emitted.
- Credential references are persisted without token material. Publishing is an explicit approval action.
- Scheduler wake-ups are runtime-only and rebuilt from canonical UTC schedules after restart; bootstrap starts the shared queue and recovery automatically.
- Approval always recomputes readiness and validates an exact canonical preview fingerprint.
- PublishAttempt records and reconciliation results are persisted; retry-after and maxAttempts are enforced.
- Interrupted jobs cannot bypass reconciliation; unresolved recovery uses bounded backoff instead of a busy loop.
- Account binding requires exact account, platform and channel identity. Retryability is explicit and rate-limit Retry-After survives restart.
- Retryable failures automatically resume after cooldown using the shared eligibility policy; exhausted/non-retryable failures remain idle without wake timers.
- Schedule inputs are validated/canonicalized to UTC before job creation; malformed hydrated schedules are blocked. Approval requires a current non-null preview fingerprint and cannot be bypassed by direct controller calls.
- Retry preserves the original approval fingerprint and never silently re-approves mutated payloads. Queue execution/reconciliation require current authenticated credentials and exact target binding.
