import type { PublishJob, PublishReceipt } from '@/core/publishing';
import type { PublishedContentBinding } from './types';

export function bindPublishedContent(job: PublishJob, receipt: PublishReceipt): PublishedContentBinding {
  if (job.id !== receipt.jobId) throw new Error('Analytics binding rejected: receipt does not belong to the publish job.');
  if (!receipt.verification.valid) throw new Error('Analytics binding rejected: receipt has not been verified.');
  if (receipt.verification.remoteState && receipt.verification.remoteState !== 'published') throw new Error('Analytics binding rejected: remote publication is not published.');
  if (job.target.platform !== receipt.platform || job.accountBinding.accountRef !== receipt.accountRef) throw new Error('Analytics binding rejected: publication platform or account does not match the receipt.');
  if (job.artifact.artifactFingerprint !== receipt.artifactFingerprint) throw new Error('Analytics binding rejected: artifact fingerprint does not match the receipt.');
  if (!receipt.remotePublishId) throw new Error('Analytics binding rejected: remote publication identity is required.');
  return { projectId: job.projectId, variantId: job.variantId, artifactFingerprint: job.artifact.artifactFingerprint, publishJobId: job.id, publishReceiptId: `${receipt.jobId}:${receipt.remotePublishId}`, platform: receipt.platform, accountId: job.accountBinding.id, accountRef: receipt.accountRef, channelRef: job.target.channelRef, remotePublicationId: receipt.remotePublishId, publishedAt: receipt.publishedAt };
}
