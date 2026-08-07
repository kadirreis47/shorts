# Epic 7.8 — AI Publishing & Scheduling Engine

Publishing is an orchestration boundary over verified Epic 7.7 artifacts. The engine binds each job immutably to a project, variant, artifact fingerprint, platform, account and channel. Unverified, missing, stale or `render-plan://` artifacts are blocked before queueing.

## Lifecycle and recovery

`draft → ready → scheduled/queued → uploading → processing → verifying → published` is enforced by the queue. Terminal cancellation cannot be overwritten by late adapter completion. Persisted uploading, processing and verifying jobs normalize to `interrupted`; restart recovery reconciles remote state before another side effect.

Queue persistence stores only serializable job state, ordering, schedule, attempts, idempotency, remote identifiers, receipts and diagnostics. Credentials are references only; secrets never enter renderer state or persistence.

## Platform capability boundary

YouTube, TikTok and Instagram are represented by typed adapters and capability reports. This repository has no configured official OAuth/upload clients, so adapters report `authentication-required` or `planned-only` and never produce fake production success.

## Scheduling and idempotency

Scheduled timestamps are canonical UTC values with the original display timezone retained. Jobs are not executed before their due time. Idempotency combines artifact fingerprint, platform/account/channel and publish intent. Duplicate enqueue/retry attempts return the existing logical job.

Metadata is validated against versioned capability limits. Rate-limit, authentication, network, validation and remote-processing failures have separate classifications and retry policies. Preview approval must match the artifact, target, metadata and schedule at enqueue time.

The scheduler maintains one runtime-only wake timer for the earliest UTC due job and rechecks wall-clock time when it fires, including after sleep/wake. Hydration rebuilds that timer and bootstrap starts shared-queue recovery automatically. Approval recomputes readiness and a canonical preview fingerprint covering project, variant, verified artifact binding, account/channel, complete metadata, UTC schedule and intent. Publish attempts and reconciliation results are persisted; retry-after and maxAttempts are enforced.

Interrupted jobs always pass through reconciliation before an upload retry. An unresolved remote lookup is persisted with bounded exponential backoff and is never an immediate runnable loop. Account, platform and channel identities must exactly match the authenticated binding. Retry eligibility comes from explicit failure metadata; unknown/non-retryable failures are blocked, while server Retry-After values survive hydration and scheduler wake-up.

Retryable failed jobs become runnable automatically when their persisted Retry-After/cooldown expires. The same eligibility helper drives execution, wake-up calculation and manual retry; exhausted or blocked failures never create timers.

All schedules pass canonical validation before job creation and are persisted as UTC ISO timestamps with explicit timezone intent. Malformed hydrated schedules are quarantined as non-retryable validation failures. Production approval requires a non-null preview approval fingerprint; changing artifact, account, metadata or schedule makes that binding stale.

Retry never creates or refreshes approval: it preserves and revalidates the original approval fingerprint and idempotency identity. Queue execution and reconciliation revalidate the current account/platform/channel binding, authentication and credential reference immediately before adapter side effects; persisted jobs cannot bypass this gate after restart.
