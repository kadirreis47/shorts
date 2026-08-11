import type { PublishAccount, PublishJob, PublishTarget } from './types';
export function isCredentialRebindablePublishJob(job: PublishJob): boolean {
  return job.state === 'failed' && job.failure?.kind === 'authentication';
}
export function isTerminalPublishJob(job: PublishJob): boolean {
  return job.state === 'published' || job.state === 'cancelled' || (job.state === 'failed' && !job.failure?.retryable && !isCredentialRebindablePublishJob(job));
}
export function canRebindPublishJobCredential(job: PublishJob, account: PublishAccount, previousCredentialRef: string): boolean {
  return !isTerminalPublishJob(job)
    && job.accountBinding.id === account.id
    && job.accountBinding.platform === account.platform
    && job.accountBinding.accountRef === account.accountRef
    && job.accountBinding.channelRef === account.channelRef
    && job.accountBinding.credentialRef === previousCredentialRef;
}
export function rebindPublishJobCredential(job: PublishJob, account: PublishAccount, previousCredentialRef: string): PublishJob {
  return canRebindPublishJobCredential(job, account, previousCredentialRef)
    ? { ...job, accountBinding: { ...job.accountBinding, credentialRef: account.credentialRef, authenticated: account.authenticated }, updatedAt: new Date().toISOString() }
    : job;
}
export function validatePublishAccountBinding(target: PublishTarget, account: PublishAccount): string[] {
  const issues: string[] = [];
  if (account.id !== target.accountId) issues.push('Publishing account does not match the target account.');
  if (account.platform !== target.platform) issues.push('Publishing account platform does not match the target platform.');
  if (account.channelRef !== target.channelRef) issues.push('Publishing account channel does not match the target channel.');
  return issues;
}
export function validateExecutablePublishBinding(target: PublishTarget, account: PublishAccount): string[] {
  const issues = validatePublishAccountBinding(target, account);
  if (!account.authenticated) issues.push('Publishing account authentication is required.');
  if (!account.credentialRef) issues.push('Publishing account credential is unavailable.');
  return issues;
}
