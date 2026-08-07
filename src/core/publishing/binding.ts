import type { PublishAccount, PublishTarget } from './types';
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
