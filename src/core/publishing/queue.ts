import { approvalFingerprint } from './fingerprints';
import { isScheduleDue, isValidPersistedPublishSchedule } from './scheduling';
import { classifyPublishFailure, normalizePublishFailure, calculateRetryAt } from './rateLimit';
import { rebindPublishJobCredential, validateExecutablePublishBinding } from './binding';
import { stableId } from '@/core/editing/utils';
import type { PublishExecutor, PublishJob, PublishQueue, PublishQueueSnapshot, PublishAttempt } from './types';

const terminal = (state: PublishJob['state']) => state === 'published' || state === 'cancelled';
const requiresRemoteDisposition = (job: PublishJob) =>
  ['uploading', 'processing', 'verifying', 'interrupted', 'reconciling'].includes(job.state)
  || job.remotePublishId !== null
  || job.progress.remoteState === 'processing'
  || job.progress.remoteState === 'unknown'
  || job.failure?.code === 'youtube-upload-ambiguous';
export interface PublishJobExecutionEligibility { runnable: boolean; nextEligibleAt?: string; blockedReason?: string; }
export function getPublishJobExecutionEligibility(job: PublishJob, now = new Date()): PublishJobExecutionEligibility {
  if (terminal(job.state)) return { runnable: false, blockedReason: 'terminal' };
  if (job.state === 'interrupted' || job.state === 'reconciling') {
    if (job.nextReconcileAt && Date.parse(job.nextReconcileAt) > now.getTime()) return { runnable: false, nextEligibleAt: job.nextReconcileAt, blockedReason: 'reconciliation-backoff' };
    return { runnable: true };
  }
  if (job.state === 'scheduled' || job.state === 'queued') return isScheduleDue(job.schedule, now) ? { runnable: true } : { runnable: false, nextEligibleAt: job.schedule.scheduledAtUtc ?? undefined, blockedReason: 'scheduled' };
  if (job.state !== 'failed') return { runnable: false, blockedReason: 'state-not-runnable' };
  if (!job.failure?.retryable) return { runnable: false, blockedReason: 'non-retryable' };
  if (job.attempts.length >= job.maxAttempts) return { runnable: false, blockedReason: 'attempts-exhausted' };
  if (job.failure.kind === 'unknown' || job.failure.kind === 'authentication' || job.failure.kind === 'validation') return { runnable: false, blockedReason: 'retry-blocked' };
  if (job.failure.retryAfterUtc && Date.parse(job.failure.retryAfterUtc) > now.getTime()) return { runnable: false, nextEligibleAt: job.failure.retryAfterUtc, blockedReason: 'retry-after' };
  return { runnable: true };
}
const runnable = (job: PublishJob, now: Date) => getPublishJobExecutionEligibility(job, now).runnable;
const laterRetryAt = (provider: string | null | undefined, fallback: string) => provider && Number.isFinite(Date.parse(provider)) && Date.parse(provider) > Date.parse(fallback) ? provider : fallback;
export function canRetryPublishJob(job: PublishJob, now = new Date()): boolean {
  if (job.state !== 'failed') return false;
  if (job.failure?.kind === 'authentication') return job.accountBinding.authenticated && Boolean(job.accountBinding.credentialRef);
  return getPublishJobExecutionEligibility(job, now).runnable;
}
export function normalizePublishQueue(snapshot: PublishQueueSnapshot): PublishQueueSnapshot {
  const seen = new Set<string>();
  const jobs = snapshot.jobs.filter((job) => { if (seen.has(job.id)) return false; seen.add(job.id); return true; }).map((job) => !isValidPersistedPublishSchedule(job.schedule) ? { ...job, state: 'failed' as const, failure: { kind: 'validation' as const, code: 'invalid-schedule', message: 'Persisted publish schedule is invalid and requires correction.', retryable: false, attempt: job.attempts.length, maxAttempts: job.maxAttempts, retryAfterUtc: null, stderrTail: [] }, progress: { ...job.progress, state: 'failed' as const, message: 'Invalid persisted schedule; publishing was blocked.', updatedAt: new Date().toISOString() } } : ['uploading', 'processing', 'verifying'].includes(job.state) ? { ...job, state: 'interrupted' as const, nextReconcileAt: null, progress: { ...job.progress, state: 'interrupted' as const, message: 'Publishing interrupted by application restart.' } } : job);
  return { jobs, activeJobId: null, paused: snapshot.paused };
}

export function createPublishQueue(executor: PublishExecutor, update?: (job: PublishJob) => void): PublishQueue {
  let snapshot: PublishQueueSnapshot = { jobs: [], activeJobId: null, paused: false }; let running = false; let nextWakeAt: number | null = null; let wakeTimer: ReturnType<typeof setTimeout> | null = null; const cancelled = new Set<string>(); const reconcileAfterCancel = new Set<string>();
  const clearWake = () => { if (wakeTimer) clearTimeout(wakeTimer); wakeTimer = null; nextWakeAt = null; };
  const save = (job: PublishJob) => { const index = snapshot.jobs.findIndex((candidate) => candidate.id === job.id); const jobs = index < 0 ? [...snapshot.jobs, job] : snapshot.jobs.map((candidate, i) => i === index ? job : candidate); snapshot = { ...snapshot, jobs }; update?.(job); };
  const schedule = () => {
    if (snapshot.paused || running) return;
    const now = Date.now(); if (snapshot.jobs.some((job) => runnable(job, new Date(now)))) { clearWake(); queueMicrotask(() => { void api.start(new Date()); }); return; }
    const future = snapshot.jobs.map((job) => getPublishJobExecutionEligibility(job, new Date(now)).nextEligibleAt).filter((value): value is string => Boolean(value)).map((value) => Date.parse(value)).filter((value) => Number.isFinite(value) && value > now).sort((a, b) => a - b)[0];
    if (future === undefined) { clearWake(); return; } if (nextWakeAt === future && wakeTimer) return; clearWake(); nextWakeAt = future; wakeTimer = setTimeout(() => { wakeTimer = null; nextWakeAt = null; void api.start(new Date()); }, Math.min(2_147_483_647, Math.max(0, future - now)));
  };
  const process = async (job: PublishJob) => {
    if (cancelled.has(job.id) || terminal(job.state)) return; snapshot = { ...snapshot, activeJobId: job.id };
    const isReconciling = job.state === 'interrupted' || job.state === 'reconciling';
    const attempt: PublishAttempt | null = isReconciling ? null : { id: stableId('publish-attempt', `${job.id}:${job.attempts.length + 1}:${Date.now()}`), attempt: job.attempts.length + 1, startedAt: new Date().toISOString(), endedAt: null, idempotencyKey: job.idempotencyKey, remotePublishId: job.remotePublishId };
    const current: PublishJob = { ...job, state: isReconciling ? 'reconciling' : 'uploading', attempts: attempt ? [...job.attempts, attempt] : job.attempts, updatedAt: new Date().toISOString() }; save(current);
    try {
      if (isReconciling) {
        if (!current.approvalFingerprint || approvalFingerprint(current) !== current.approvalFingerprint) throw Object.assign(new Error('Publish job changed after approval. Generate a new preview and approve again.'), { retryable: false, status: 400 });
        const reconciliationBindingIssues = validateExecutablePublishBinding(current.target, current.accountBinding); if (reconciliationBindingIssues.length) throw Object.assign(new Error(reconciliationBindingIssues.join(' ')), { retryable: false, status: 401 });
        const before = current; const result = await executor.reconcile(current, (progress) => save({ ...current, progress }));
        if (terminal(result.state)) { if (!cancelled.has(job.id)) save(result); return; }
        if (result.state === 'reconciling' || result.state === 'interrupted' || result === before) {
          if (result.progress.remoteState === 'processing') {
            save({ ...result, state: 'reconciling', nextReconcileAt: result.nextReconcileAt ?? calculateRetryAt(1, 30_000, 300_000, 1_000), progress: { ...result.progress, state: 'reconciling', message: 'YouTube is processing the uploaded video; verification will retry.', updatedAt: new Date().toISOString() }, updatedAt: new Date().toISOString() }); return;
          }
          const attempts = (result.reconciliationAttempts ?? 0) + 1;
          save({ ...result, state: 'reconciling', reconciliationAttempts: attempts, nextReconcileAt: result.nextReconcileAt ?? calculateRetryAt(attempts, 30_000, 300_000, 1_000), progress: { ...result.progress, state: 'reconciling', message: 'Remote state unresolved; reconciliation is backed off.', updatedAt: new Date().toISOString() }, updatedAt: new Date().toISOString() }); return;
        }
        save(result); return;
      }
      if (!current.approvalFingerprint || approvalFingerprint(current) !== current.approvalFingerprint) throw Object.assign(new Error('Publish job changed after approval. Generate a new preview and approve again.'), { code: 'publish-approval-stale', retryable: false, status: 400 });
      if (!current.readiness.ready || current.readiness.issues.length) throw Object.assign(new Error('Publishing readiness is no longer valid.'), { code: 'publish-readiness-invalid', retryable: false, status: 400 });
      const bindingIssues = validateExecutablePublishBinding(current.target, current.accountBinding); if (bindingIssues.length) throw Object.assign(new Error(bindingIssues.join(' ')), { retryable: false, status: 401 });
      const receipt = await executor.run(current, (progress) => save({ ...current, progress }));
      if (!receipt.verification.valid || receipt.verification.remoteState !== 'published') {
        if (receipt.verification.remoteState === 'processing' || receipt.verification.remoteState === 'unknown') {
          if (!cancelled.has(job.id)) { const fallback = calculateRetryAt(1, 30_000, 300_000, 1_000); save({ ...current, state: 'reconciling', receipt: null, remotePublishId: receipt.remotePublishId, nextReconcileAt: laterRetryAt(receipt.verification.retryAfterUtc, fallback), progress: { ...current.progress, state: 'reconciling', remoteState: receipt.verification.remoteState, message: 'Upload accepted; awaiting YouTube processing verification.', updatedAt: new Date().toISOString() }, updatedAt: new Date().toISOString() }); }
          return;
        }
        if (receipt.verification.remoteState === 'failed') {
          if (!cancelled.has(job.id)) save({ ...current, state: 'failed', receipt: null, remotePublishId: receipt.remotePublishId, failure: { kind: 'remote-processing', code: 'youtube-processing-failed', message: 'YouTube rejected or failed while processing the uploaded video.', retryable: false, attempt: current.attempts.length, maxAttempts: current.maxAttempts, retryAfterUtc: null, stderrTail: [] }, progress: { ...current.progress, state: 'failed', remoteState: 'failed', message: 'YouTube video processing failed.', updatedAt: new Date().toISOString() }, updatedAt: new Date().toISOString() });
          return;
        }
        throw new Error('Remote publication was not verified as published.');
      }
      if (!cancelled.has(job.id)) save({ ...current, state: 'published', receipt, remotePublishId: receipt.remotePublishId, progress: { ...current.progress, state: 'published', percent: 100, message: 'Published and verified.', updatedAt: new Date().toISOString() }, updatedAt: new Date().toISOString() });
    } catch (error) {
      if (!cancelled.has(job.id)) {
        const failure = normalizePublishFailure(error, current.attempts.length, current.maxAttempts);
        if (reconcileAfterCancel.has(job.id) || failure.code === 'youtube-upload-ambiguous' || (isReconciling && failure.retryable)) {
          const latest = snapshot.jobs.find((candidate) => candidate.id === job.id) ?? current; const reconciliationAttempts = (latest.reconciliationAttempts ?? 0) + 1;
          save({ ...latest, state: 'reconciling', receipt: null, failure: null, reconciliationAttempts, nextReconcileAt: failure.retryAfterUtc ?? calculateRetryAt(reconciliationAttempts, 30_000, 300_000, 1_000), progress: { ...latest.progress, state: 'reconciling', remoteState: failure.code === 'youtube-upload-ambiguous' ? 'unknown' : latest.progress.remoteState, message: reconcileAfterCancel.has(job.id) ? 'Local upload stopped; remote disposition requires reconciliation.' : failure.message, updatedAt: new Date().toISOString() }, updatedAt: new Date().toISOString() });
        } else save({ ...current, state: 'failed', failure, updatedAt: new Date().toISOString() });
      }
    }
    finally { reconcileAfterCancel.delete(job.id); if (snapshot.activeJobId === job.id) snapshot = { ...snapshot, activeJobId: null }; schedule(); }
  };
  const api: PublishQueue = { enqueue(job) { if (snapshot.jobs.some((candidate) => candidate.id === job.id || candidate.idempotencyKey === job.idempotencyKey)) return snapshot.jobs.find((candidate) => candidate.idempotencyKey === job.idempotencyKey || candidate.id === job.id)!; save(job); schedule(); return job; }, hydrate(next) { clearWake(); snapshot = normalizePublishQueue(next); schedule(); }, rebindAccountCredential(account, previousCredentialRef, excludeJobId = null) { let count = 0; for (const job of snapshot.jobs) { if (job.id === excludeJobId) continue; const rebound = rebindPublishJobCredential(job, account, previousCredentialRef); if (rebound !== job) { count += 1; save(rebound); } } return count; }, async start(now = new Date()) { if (running || snapshot.paused) return; running = true; try { for (const job of [...snapshot.jobs].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) if (!snapshot.activeJobId && runnable(job, now)) { const due = job.state === 'scheduled' || job.state === 'failed' ? { ...job, state: 'queued' as const, failure: job.state === 'failed' ? null : job.failure, updatedAt: new Date().toISOString() } : job; save(due); await process(due); } } finally { running = false; schedule(); } }, pause() { snapshot = { ...snapshot, paused: true }; clearWake(); }, resume() { snapshot = { ...snapshot, paused: false }; schedule(); }, async cancel(jobId) { const job = snapshot.jobs.find((candidate) => candidate.id === jobId); if (!job || terminal(job.state)) return false; if (requiresRemoteDisposition(job)) { const activeRemoteWork = snapshot.activeJobId === jobId; if (activeRemoteWork) reconcileAfterCancel.add(jobId); try { await executor.cancel(jobId); } catch { /* Local cancellation failure cannot prove remote absence. */ } const latest = snapshot.jobs.find((candidate) => candidate.id === jobId) ?? job; if (latest.state !== 'published' && !(latest.state === 'failed' && latest.progress.remoteState === 'failed')) save({ ...latest, state: 'reconciling', receipt: null, failure: null, nextReconcileAt: latest.nextReconcileAt ?? calculateRetryAt(1, 30_000, 300_000, 1_000), progress: { ...latest.progress, state: 'reconciling', message: 'Remote upload may exist; cancellation requires remote reconciliation.', updatedAt: new Date().toISOString() }, updatedAt: new Date().toISOString() }); if (!activeRemoteWork || snapshot.activeJobId !== jobId) reconcileAfterCancel.delete(jobId); schedule(); return false; } cancelled.add(jobId); save({ ...job, state: 'cancelled', progress: { ...job.progress, state: 'cancelled', message: 'Publishing cancelled.', updatedAt: new Date().toISOString() }, updatedAt: new Date().toISOString() }); await executor.cancel(jobId); schedule(); return true; }, async retry(jobId) { const job = snapshot.jobs.find((candidate) => candidate.id === jobId); if (!job || !job.approvalFingerprint) return null; if (approvalFingerprint(job) !== job.approvalFingerprint) throw new Error('Publish job changed after approval. Generate a new preview and approve again.'); if (job.state === 'interrupted' || job.state === 'reconciling' || (job.state === 'failed' && requiresRemoteDisposition(job) && canRetryPublishJob(job))) { await api.reconcile(jobId); return api.get(jobId); } if (!canRetryPublishJob(job)) return null; cancelled.delete(jobId); const next = { ...job, state: 'queued' as const, failure: null, updatedAt: new Date().toISOString() }; save(next); schedule(); return next; }, async reconcile(jobId) { const job = snapshot.jobs.find((candidate) => candidate.id === jobId); if (!job || terminal(job.state)) return job ?? null; if (!job.approvalFingerprint || approvalFingerprint(job) !== job.approvalFingerprint) throw new Error('Publish job changed after approval. Generate a new preview and approve again.'); const bindingIssues = validateExecutablePublishBinding(job.target, job.accountBinding); if (bindingIssues.length) { const blocked = { ...job, state: 'failed' as const, failure: { kind: 'authentication' as const, code: 'authentication-required', message: bindingIssues.join(' '), retryable: false, attempt: job.attempts.length, maxAttempts: job.maxAttempts, retryAfterUtc: null, stderrTail: [] } }; save(blocked); return blocked; } const result = await executor.reconcile({ ...job, state: 'reconciling' }, (progress) => save({ ...job, state: 'reconciling', progress })); if ((result.state === 'reconciling' || result.state === 'interrupted') && !result.nextReconcileAt) save({ ...result, nextReconcileAt: calculateRetryAt((result.reconciliationAttempts ?? 0) + 1, 30_000, 300_000, 1_000) }); else save(result); schedule(); return result; }, get(jobId) { return snapshot.jobs.find((job) => job.id === jobId) ?? null; }, list() { return snapshot.jobs; }, snapshot() { return snapshot; } };
  return api;
}
