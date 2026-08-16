import { applicationContainer, dependencyTokens } from '@/core/di';
import { approvalFingerprint, isTerminalPublishJob, youtubePublishRequest, type PublishAccount, type PublishJob, type PublishMetadata, type PublishSchedule, type PublishTarget } from '@/core/publishing';
import type { ExportArtifact } from '@/core/export-intelligence';
import { usePublishingStore } from '@/store/publishingStore';
import { getValidatedOwnerGeneration, getValidatedOwnerId, isCurrentValidatedOwnerContext } from '@/auth/identity';
import type { PublishingApplicationService } from './publishingApplicationService';
function service(): PublishingApplicationService { return applicationContainer.resolve(dependencyTokens.publishingApplicationService); }
export type CreatePublishJobInput = { projectId: string; variantId?: string | null; account: PublishAccount; target: PublishTarget; artifact: ExportArtifact; sourceManifestFingerprint: string; metadata: PublishMetadata; schedule?: PublishSchedule; };
let sharedQueue: ReturnType<PublishingApplicationService['createQueue']> | null = null;
let queueOwnerId: string | null = null;
type OwnerContext = { ownerId: string; generation: number };
type PendingCredentialCleanup = OwnerContext & { account: PublishAccount; previousCredentialRef: string };

const pendingCredentialCleanups = new Map<string, PendingCredentialCleanup>();
let credentialCleanupFlush: Promise<void> | null = null;
let credentialCleanupContext: OwnerContext | null = null;

function currentOwnerContext(): OwnerContext | null {
  const ownerId = getValidatedOwnerId();
  return ownerId ? { ownerId, generation: getValidatedOwnerGeneration() } : null;
}

function isCurrentOwnerContext(context: OwnerContext) {
  return isCurrentValidatedOwnerContext(context.ownerId, context.generation);
}
export async function createPublishJob(input: CreatePublishJobInput): Promise<PublishJob> { const job = service().createJob(input); usePublishingStore.getState().updateJob(job); return job; }
export function buildPublishJob(input: CreatePublishJobInput): PublishJob { return service().createJob(input); }
export async function previewPublishJob(job: PublishJob): Promise<PublishJob> { const readiness = service().readiness(job); if (!readiness.ready) throw new Error(readiness.issues.join(' ')); return { ...job, readiness, approvalFingerprint: approvalFingerprint(job), approvedAt: null, updatedAt: new Date().toISOString() }; }
export async function approveAndEnqueuePublish(job: PublishJob): Promise<PublishJob> { if (!job.approvalFingerprint) throw new Error('Publish preview required before approval.'); const freshReadiness = service().readiness(job); if (!freshReadiness.ready) throw new Error(freshReadiness.issues.join(' ')); if (!job.accountBinding.authenticated) throw new Error('Publishing account authentication is required.'); const fingerprint = approvalFingerprint(job); if (job.approvalFingerprint !== fingerprint) throw new Error('Publish preview is stale; please preview again before approval.'); const queue = await ensureQueue(); const approved = { ...job, readiness: freshReadiness, state: job.schedule.mode === 'scheduled' ? 'scheduled' as const : 'queued' as const, approvedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; queue.enqueue(approved); usePublishingStore.getState().updateJob(approved); void queue.start(); return approved; }
export async function retryPublishJob(jobId: string): Promise<PublishJob | null> { const queue = await ensureQueue(); const job = await queue.retry(jobId); return job; }
export async function reconcilePublishJob(jobId: string): Promise<PublishJob | null> { const queue = await ensureQueue(); return queue.reconcile(jobId); }
function hasNonterminalCredentialReference(credentialRef: string) { return usePublishingStore.getState().queue.jobs.some((job) => !isTerminalPublishJob(job) && job.accountBinding.credentialRef === credentialRef) || Boolean(sharedQueue?.list().some((job) => !isTerminalPublishJob(job) && job.accountBinding.credentialRef === credentialRef)); }
function restoreDeferredCredentialCleanups() {
  const context = currentOwnerContext();
  if (!context) return;
  const state = usePublishingStore.getState();
  for (const job of state.queue.jobs) {
    if (isTerminalPublishJob(job) || !job.accountBinding.credentialRef) continue;
    const replacement = state.accounts.find((account) => account.authenticated
      && account.credentialRef
      && account.credentialRef !== job.accountBinding.credentialRef
      && account.id === job.accountBinding.id
      && account.platform === job.accountBinding.platform
      && account.accountRef === job.accountBinding.accountRef
      && account.channelRef === job.accountBinding.channelRef);
    if (replacement) pendingCredentialCleanups.set(job.accountBinding.credentialRef, { ...context, account: replacement, previousCredentialRef: job.accountBinding.credentialRef });
  }
}
async function performPendingCredentialCleanups(context: OwnerContext) {
  if (!isCurrentOwnerContext(context)) return;
  for (const [credentialRef, pending] of [...pendingCredentialCleanups]) {
    if (!isCurrentOwnerContext(context) || pending.ownerId !== context.ownerId || pending.generation !== context.generation) return;
    const activeJobId = sharedQueue?.snapshot().activeJobId;
    if (activeJobId && sharedQueue?.get(activeJobId)?.accountBinding.credentialRef === credentialRef) continue;
    if (!isCurrentOwnerContext(context)) return;
    await usePublishingStore.getState().rebindAccountCredential(pending.account, credentialRef);
    if (!isCurrentOwnerContext(context)) return;
    sharedQueue?.rebindAccountCredential(pending.account, credentialRef);
    if (!isCurrentOwnerContext(context)) return;
    if (hasNonterminalCredentialReference(credentialRef)) continue;
    try {
      if (!isCurrentOwnerContext(context)) return;
      await window.electronAPI?.youtube.disconnect(credentialRef);
      if (!isCurrentOwnerContext(context)) return;
      pendingCredentialCleanups.delete(credentialRef);
    } catch {
      if (!isCurrentOwnerContext(context)) return;
      // Keep the reference queued for the next same-owner publishing state transition.
    }
  }
}
function flushPendingCredentialCleanups() {
  const context = currentOwnerContext();
  if (!context) return Promise.resolve();
  if (!credentialCleanupFlush || !credentialCleanupContext || credentialCleanupContext.ownerId !== context.ownerId || credentialCleanupContext.generation !== context.generation) {
    const flush = performPendingCredentialCleanups(context).finally(() => {
      if (credentialCleanupFlush === flush) {
        credentialCleanupFlush = null;
        credentialCleanupContext = null;
      }
    });
    credentialCleanupFlush = flush;
    credentialCleanupContext = context;
  }
  return credentialCleanupFlush;
}
function schedulePendingCredentialCleanup() {
  const context = currentOwnerContext();
  if (!context) return;
  queueMicrotask(() => {
    if (isCurrentOwnerContext(context)) void flushPendingCredentialCleanups();
  });
}
export async function rebindPublishingAccountCredential(account: PublishAccount, previousCredentialRef: string): Promise<boolean> {
  const context = currentOwnerContext();
  if (!context) throw new Error('A validated user is required for publishing credential changes.');
  const activeJobId = sharedQueue?.snapshot().activeJobId;
  const activeUsesPreviousCredential = Boolean(activeJobId && sharedQueue?.get(activeJobId)?.accountBinding.credentialRef === previousCredentialRef);
  const storeSafe = await usePublishingStore.getState().rebindAccountCredential(account, previousCredentialRef, activeUsesPreviousCredential ? activeJobId : null);
  if (!isCurrentOwnerContext(context)) return false;
  sharedQueue?.rebindAccountCredential(account, previousCredentialRef, activeUsesPreviousCredential ? activeJobId : null);
  const liveQueueSafe = !hasNonterminalCredentialReference(previousCredentialRef);
  if (activeUsesPreviousCredential) { pendingCredentialCleanups.set(previousCredentialRef, { ...context, account, previousCredentialRef }); return false; }
  return storeSafe && liveQueueSafe;
}
async function ensureQueue() { const ownerId = getValidatedOwnerId(); if (!ownerId) throw new Error('A validated user is required for publishing.'); if (sharedQueue && queueOwnerId === ownerId) return sharedQueue; sharedQueue = null; queueOwnerId = ownerId; await usePublishingStore.persist.rehydrate(); if (getValidatedOwnerId() !== ownerId) throw new Error('Publishing owner changed during recovery.'); const persisted = usePublishingStore.getState().queue; const acknowledge = window.electronAPI?.youtube.acknowledgeReceipt; if (acknowledge) { for (const job of persisted.jobs) { if (job.state === 'published' && job.receipt && job.target.platform === 'youtube') { try { await acknowledge({ ...youtubePublishRequest(job), remotePublishId: job.receipt.remotePublishId }); } catch { /* Cleanup is best-effort only after the receipt has survived hydration. */ } } } } sharedQueue = service().createQueue(undefined, (job) => { if (getValidatedOwnerId() !== ownerId) return; usePublishingStore.getState().updateJob(job); schedulePendingCredentialCleanup(); }); sharedQueue.hydrate(persisted); usePublishingStore.getState().setQueue(sharedQueue.snapshot()); restoreDeferredCredentialCleanups(); await flushPendingCredentialCleanups(); return sharedQueue; }
export async function initializePublishingQueue() { const queue = await ensureQueue(); await queue.start(); return queue; }
export function resetPublishingRuntimeForOwnerTransition() { sharedQueue = null; queueOwnerId = null; pendingCredentialCleanups.clear(); credentialCleanupFlush = null; credentialCleanupContext = null; }
