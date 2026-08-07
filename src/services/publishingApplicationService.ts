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

export interface PublishingApplicationService {
  capabilities: ReturnType<typeof createPublishAdapterRegistry>['list'];
  createJob(input: { projectId: string; variantId?: string | null; account: PublishAccount; target: PublishTarget; artifact: ExportArtifact; sourceManifestFingerprint: string; metadata: PublishMetadata; schedule?: PublishSchedule; approval?: boolean }): PublishJob;
  readiness(job: PublishJob): PublishReadiness;
  createQueue(executor?: PublishExecutor, update?: (job: PublishJob) => void): PublishQueue;
}

export function createPublishingApplicationService(eventBus?: EventBus<ApplicationEventMap>): PublishingApplicationService {
  const registry = createPublishAdapterRegistry();
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
      return evaluatePublishReadiness({ artifact: { path: job.artifact.artifactPath, sizeBytes: job.artifact.sizeBytes, durationMs: job.artifact.durationMs, verified: job.artifact.verified, diagnostics: job.artifact.diagnostics, createdAt: job.createdAt }, target: job.target, metadata: job.metadata, projectId: job.projectId, sourceManifestFingerprint: job.artifact.sourceManifestFingerprint });
    },
    createQueue(executor, update) {
      if (!executor) {
        executor = {
          async run(job) {
            const adapter = registry.get(job.target.platform);
            const result = await adapter.publish({ job, signal: new AbortController().signal, report: () => undefined });
            return { jobId: job.id, remotePublishId: result.remotePublishId, platform: job.target.platform, accountRef: job.accountBinding.accountRef, publishedAt: new Date().toISOString(), artifactFingerprint: job.artifact.artifactFingerprint, metadataFingerprint: metadataFingerprint(job.metadata), scheduleIntent: job.schedule, remoteUrl: result.remoteUrl ?? null, verification: { valid: false, remotePublishId: result.remotePublishId, remoteState: result.state, checkedAt: new Date().toISOString(), issues: ['Remote verification is not implemented.'] } };
          },
          async reconcile(job) { return { ...job, state: 'reconciling', nextReconcileAt: new Date(Date.now() + 30_000).toISOString(), reconciliationAttempts: (job.reconciliationAttempts ?? 0) + 1, progress: { ...job.progress, state: 'reconciling', message: 'Remote publication state is unresolved; awaiting reconciliation retry.', updatedAt: new Date().toISOString() } }; },
          async cancel() { return false; },
        };
      }
      return createPublishQueue(executor, update);
    },
  };
}
