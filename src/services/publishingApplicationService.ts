import type { EventBus, ApplicationEventMap } from '@/core/events';
import type { ExportArtifact } from '@/core/export-intelligence';
import {
  bindPublishArtifact,
  createPublishAdapterRegistry,
  createPublishQueue,
  evaluatePublishReadiness,
  idempotencyKey,
  metadataFingerprint,
  type PublishAccount,
  type PublishExecutor,
  type PublishJob,
  type PublishMetadata,
  type PublishQueue,
  type PublishReadiness,
  type PublishSchedule,
  type PublishTarget,
  validatePublishAccountBinding,
  createPublishSchedule,
} from '@/core/publishing';
import { revalidatePublishArtifact, type RevalidatedPublishArtifact } from './publishArtifactIntegrity';

export interface PublishingApplicationServiceOptions {
  registry?: ReturnType<typeof createPublishAdapterRegistry>;
  revalidateArtifact?: (artifact: PublishJob['artifact']) => Promise<RevalidatedPublishArtifact>;
}

export interface PublishingApplicationService {
  capabilities: ReturnType<typeof createPublishAdapterRegistry>['list'];
  createJob(input: { projectId: string; variantId?: string | null; account: PublishAccount; target: PublishTarget; artifact: ExportArtifact; sourceManifestFingerprint: string; metadata: PublishMetadata; schedule?: PublishSchedule; approval?: boolean }): PublishJob;
  readiness(job: PublishJob): PublishReadiness;
  createQueue(executor?: PublishExecutor, update?: (job: PublishJob) => void): PublishQueue;
}

export function createPublishingApplicationService(eventBus?: EventBus<ApplicationEventMap>, options: PublishingApplicationServiceOptions = {}): PublishingApplicationService {
  const youtube = typeof window !== 'undefined' ? window.electronAPI?.youtube : undefined;
  const youtubeClient = youtube?.publish && youtube.reconcilePublish && youtube.cancelPublish && youtube.acknowledgeReceipt ? youtube as Required<Pick<typeof youtube, 'publish'|'reconcilePublish'|'cancelPublish'|'acknowledgeReceipt'>> : undefined;
  const registry = options.registry ?? createPublishAdapterRegistry(youtubeClient);
  const revalidateArtifact = options.revalidateArtifact ?? revalidatePublishArtifact;
  return {
    capabilities: () => registry.list(),
    createJob(input) {
      const now = new Date().toISOString();
      const rawSchedule = input.schedule ?? { mode: 'now', scheduledAtUtc: null, timezone: 'UTC' };
      const schedule = createPublishSchedule(rawSchedule.mode, rawSchedule.scheduledAtUtc, rawSchedule.timezone);
      const target = { ...input.target };
      const artifact = bindPublishArtifact(input.artifact, input.projectId, input.sourceManifestFingerprint, input.variantId ?? null, null);
      const key = idempotencyKey({ artifactFingerprint: artifact.artifactFingerprint, target, intent: `${input.projectId}:${input.variantId ?? ''}` });
      const readiness = evaluatePublishReadiness({ artifact: input.artifact, target, metadata: input.metadata, projectId: input.projectId, sourceManifestFingerprint: input.sourceManifestFingerprint });
      const job: PublishJob = {
        id: `publish-${key}`, projectId: input.projectId, variantId: input.variantId ?? null, target,
        accountBinding: { ...input.account, credentialRef: input.account.credentialRef ?? null }, artifact,
        metadata: { ...input.metadata, hashtags: [...input.metadata.hashtags], audienceFlags: { ...input.metadata.audienceFlags } }, schedule,
        state: readiness.ready && input.approval === true ? schedule.mode === 'scheduled' ? 'scheduled' : 'ready' : 'draft',
        progress: { state: 'draft', percent: 0, message: 'Awaiting explicit publish approval.', remoteState: null, updatedAt: now }, readiness,
        idempotencyKey: key, approvalFingerprint: null, approvedAt: input.approval ? now : null, attempts: [], maxAttempts: 3,
        failure: null, receipt: null, remotePublishId: null, createdAt: now, updatedAt: now,
      };
      void eventBus?.emit('publish:created', { jobId: job.id, platform: target.platform, accountRef: input.account.accountRef, createdAt: now });
      return job;
    },
    readiness(job) {
      const bindingIssues = validatePublishAccountBinding(job.target, job.accountBinding);
      if (bindingIssues.length) return { ready: false, status: 'blocked', issues: bindingIssues, warnings: [], diagnostics: bindingIssues.map((message) => ({ code: 'account-target-mismatch', message, severity: 'error' as const })) };
      if (job.artifact.projectId !== job.projectId || job.artifact.variantId !== job.variantId) {
        return { ready: false, status: 'blocked', issues: ['Publish artifact binding does not match the target project or variant.'], warnings: [], diagnostics: [{ code: 'artifact-binding-mismatch', message: 'Artifact binding mismatch.', severity: 'error' as const }] };
      }
      return evaluatePublishReadiness({ artifact: { path: job.artifact.artifactPath, sizeBytes: job.artifact.sizeBytes, durationMs: job.artifact.durationMs, contentDigest: job.artifact.contentDigest ?? null, verified: job.artifact.verified, diagnostics: job.artifact.diagnostics, createdAt: job.createdAt }, target: job.target, metadata: job.metadata, projectId: job.projectId, sourceManifestFingerprint: job.artifact.sourceManifestFingerprint });
    },
    createQueue(executor, update) {
      if (!executor) {
        const active = new Map<string, { adapter: ReturnType<typeof registry.get>; context: Parameters<ReturnType<typeof registry.get>['publish']>[0]; controller: AbortController }>();
        executor = {
          async run(job) {
            const adapter = registry.get(job.target.platform);
            if (!adapter.trustedArtifactRevalidation) await revalidateArtifact(job.artifact);
            const controller = new AbortController(); const context = { job, signal: controller.signal, report: () => undefined }; active.set(job.id, { adapter, context, controller });
            try { const result = await adapter.publish(context); return { jobId: job.id, remotePublishId: result.remotePublishId, platform: job.target.platform, accountRef: job.accountBinding.accountRef, publishedAt: new Date().toISOString(), artifactFingerprint: job.artifact.artifactFingerprint, metadataFingerprint: metadataFingerprint(job.metadata), scheduleIntent: job.schedule, remoteUrl: result.remoteUrl ?? null, verification: { valid: result.state === 'published', remotePublishId: result.remotePublishId, remoteState: result.state, checkedAt: new Date().toISOString(), issues: result.state === 'published' ? [] : [result.state === 'failed' ? 'Remote video processing failed.' : 'Remote publication is awaiting processing verification.'], retryAfterUtc: result.retryAfterUtc ?? null } }; }
            finally { active.delete(job.id); }
          },
          async reconcile(job) {
            const adapter = registry.get(job.target.platform);
            const result = await adapter.reconcile({ job, signal: new AbortController().signal, report: () => undefined });
            if (result.restartRequired && !result.remotePublishId && !job.remotePublishId) {
              return { ...job, state: 'failed', receipt: null, remotePublishId: null, nextReconcileAt: null, failure: { kind: 'retryable', code: 'youtube-upload-session-expired', message: 'The expired YouTube upload session was cleared and can be restarted safely.', retryable: true, attempt: job.attempts.length, maxAttempts: job.maxAttempts, retryAfterUtc: null, stderrTail: [] }, progress: { ...job.progress, state: 'failed', remoteState: null, message: 'The expired upload session was cleared; a fresh upload may be attempted.', updatedAt: new Date().toISOString() }, updatedAt: new Date().toISOString() };
            }
            if (result.approvalMismatch) {
              const remoteState = result.state ?? 'unknown';
              const remotePublishId = result.remotePublishId ?? job.remotePublishId;
              if (remoteState === 'published' && remotePublishId) {
                return { ...job, state: 'failed', receipt: null, remotePublishId, nextReconcileAt: null, failure: { kind: 'validation', code: 'youtube-upload-approval-mismatch', message: 'The existing YouTube upload belongs to a previous approval and cannot authorize the current metadata.', retryable: false, attempt: job.attempts.length, maxAttempts: job.maxAttempts, retryAfterUtc: null, stderrTail: [] }, progress: { ...job.progress, state: 'failed', remoteState: 'published', message: 'A prior approved upload exists and requires user review before publishing again.', updatedAt: new Date().toISOString() }, updatedAt: new Date().toISOString() };
              }
              const localRetryAt = new Date(Date.now() + 30_000).toISOString();
              const providerRetryAt = result.retryAfterUtc && Number.isFinite(Date.parse(result.retryAfterUtc)) ? result.retryAfterUtc : null;
              const nextReconcileAt = providerRetryAt && Date.parse(providerRetryAt) > Date.parse(localRetryAt) ? providerRetryAt : localRetryAt;
              return { ...job, state: 'reconciling', receipt: null, remotePublishId, nextReconcileAt, progress: { ...job.progress, state: 'reconciling', remoteState, message: 'A YouTube upload from the previous approval still requires remote disposition.', updatedAt: new Date().toISOString() }, updatedAt: new Date().toISOString() };
            }
            if (result.found && result.remotePublishId && result.state === 'published') {
              const receipt = { jobId: job.id, remotePublishId: result.remotePublishId, platform: job.target.platform, accountRef: job.accountBinding.accountRef, publishedAt: new Date().toISOString(), artifactFingerprint: job.artifact.artifactFingerprint, metadataFingerprint: metadataFingerprint(job.metadata), scheduleIntent: job.schedule, remoteUrl: result.remoteUrl ?? null, verification: { valid: true, remotePublishId: result.remotePublishId, remoteState: 'published' as const, checkedAt: new Date().toISOString(), issues: [] } };
              return { ...job, state: 'published', receipt, remotePublishId: result.remotePublishId, nextReconcileAt: null, progress: { ...job.progress, state: 'published', percent: 100, remoteState: 'published', message: 'Recovered completed YouTube publication.', updatedAt: new Date().toISOString() }, updatedAt: new Date().toISOString() };
            }
            if (result.remotePublishId && result.state === 'failed') {
              return { ...job, state: 'failed', receipt: null, remotePublishId: result.remotePublishId, nextReconcileAt: null, failure: { kind: 'remote-processing', code: 'youtube-processing-failed', message: 'YouTube rejected or failed while processing the uploaded video.', retryable: false, attempt: job.attempts.length, maxAttempts: job.maxAttempts, retryAfterUtc: null, stderrTail: [] }, progress: { ...job.progress, state: 'failed', remoteState: 'failed', message: 'YouTube video processing failed.', updatedAt: new Date().toISOString() }, updatedAt: new Date().toISOString() };
            }
            const remoteState = result.state ?? 'unknown';
            const localRetryAt = new Date(Date.now() + 30_000).toISOString();
            const providerRetryAt = result.retryAfterUtc && Number.isFinite(Date.parse(result.retryAfterUtc)) ? result.retryAfterUtc : null;
            const nextReconcileAt = providerRetryAt && Date.parse(providerRetryAt) > Date.parse(localRetryAt) ? providerRetryAt : localRetryAt;
            return { ...job, state: 'reconciling', receipt: null, remotePublishId: result.remotePublishId ?? job.remotePublishId, nextReconcileAt, progress: { ...job.progress, state: 'reconciling', remoteState, message: remoteState === 'processing' ? 'YouTube is processing the uploaded video.' : 'Remote publication state is unresolved; awaiting reconciliation retry.', updatedAt: new Date().toISOString() }, updatedAt: new Date().toISOString() };
          },
          async cancel(jobId) { const current = active.get(jobId); if (!current) return false; current.controller.abort(); return current.adapter.cancel ? current.adapter.cancel(current.context) : false; },
        };
      }
      return createPublishQueue(executor, update);
    },
  };
}
