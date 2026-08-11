import { getPublishCapability } from './capabilities';
import { composeYouTubeDescription } from './metadata';
import type { PublishAdapter, PublishAdapterContext, PublishAdapterRegistry, PublishJob, PublishPlatform } from './types';

export interface YouTubePublishRequest {
  jobId: string;
  idempotencyKey: string;
  platform: 'youtube';
  approvalFingerprint: string;
  approvedAt: string;
  target: { accountId: string; channelRef: string };
  account: { platform: 'youtube'; accountId: string; accountRef: string; channelRef: string; credentialRef: string };
  artifact: { artifactPath: string; artifactFingerprint: string; contentDigest: string; sizeBytes: number };
  metadata: PublishJob['metadata'];
  outboundDescription: string;
  remotePublishId?: string;
  recovery: { jobState: PublishJob['state']; remoteState: string | null; failureCode: string | null };
}
export interface YouTubePublishingClient {
  publish(request: YouTubePublishRequest): Promise<{ ok: true; result: { remotePublishId: string; remoteUrl?: string | null; state: 'processing' | 'published' | 'failed' | 'unknown'; retryAfterUtc?: string | null } } | { ok: false; error: { code: string; message: string; retryable: boolean; status: number; retryAfterUtc: string | null } }>;
  reconcilePublish(request: YouTubePublishRequest): Promise<{ ok: true; result: { found: boolean; remotePublishId?: string; remoteUrl?: string | null; state?: 'processing' | 'published' | 'failed' | 'unknown'; retryAfterUtc?: string | null; restartRequired?: boolean; approvalMismatch?: boolean } } | { ok: false; error: { code: string; message: string; retryable: boolean; status: number; retryAfterUtc: string | null } }>;
  cancelPublish(jobId: string): Promise<{ cancelled: boolean }>;
  acknowledgeReceipt(request: YouTubePublishRequest & { remotePublishId: string }): Promise<{ acknowledged: boolean }>;
}
function request(job: PublishJob): YouTubePublishRequest {
  if (job.target.platform !== 'youtube' || job.accountBinding.platform !== 'youtube' || !job.accountBinding.credentialRef || !job.accountBinding.channelRef || !job.artifact.contentDigest || !job.approvalFingerprint || !job.approvedAt) throw Object.assign(new Error('YouTube publish binding is incomplete.'), { code: 'youtube-binding-invalid', status: 400, retryable: false });
  return { jobId: job.id, idempotencyKey: job.idempotencyKey, platform: 'youtube', approvalFingerprint: job.approvalFingerprint, approvedAt: job.approvedAt, target: { accountId: job.target.accountId, channelRef: job.target.channelRef ?? '' }, account: { platform: 'youtube', accountId: job.accountBinding.id, accountRef: job.accountBinding.accountRef, channelRef: job.accountBinding.channelRef, credentialRef: job.accountBinding.credentialRef }, artifact: { artifactPath: job.artifact.artifactPath, artifactFingerprint: job.artifact.artifactFingerprint, contentDigest: job.artifact.contentDigest, sizeBytes: job.artifact.sizeBytes }, metadata: job.metadata, outboundDescription: composeYouTubeDescription(job.metadata), remotePublishId: job.remotePublishId ?? undefined, recovery: { jobState: job.state, remoteState: job.progress.remoteState, failureCode: job.failure?.code ?? null } };
}
function failure(error: { code: string; message: string; retryable: boolean; status: number; retryAfterUtc: string | null }): Error { return Object.assign(new Error(error.message), error); }
export function createYouTubePublishAdapter(client?: YouTubePublishingClient): PublishAdapter {
  return {
    platform: 'youtube', trustedArtifactRevalidation: true,
    capability: () => getPublishCapability('youtube'),
    async publish(context) { if (!client) throw Object.assign(new Error('YouTube publishing requires the Electron trusted execution boundary.'), { code: 'youtube-desktop-required', status: 503, retryable: false }); const result = await client.publish(request(context.job)); if (!result.ok) throw failure(result.error); return result.result; },
    async reconcile(context) { if (!client) return { found: false, state: 'unknown' }; const result = await client.reconcilePublish(request(context.job)); if (!result.ok) throw failure(result.error); return result.result; },
    async cancel(context) { return client ? (await client.cancelPublish(context.job.id)).cancelled : false; },
  };
}
function unavailable(platform: Exclude<PublishPlatform, 'youtube'>): PublishAdapter { return { platform, capability: () => getPublishCapability(platform), async publish() { throw new Error(`Publishing adapter ${platform} is not implemented; no remote upload was attempted.`); }, async reconcile() { return { found: false, state: 'unknown' }; } }; }
export function createPublishAdapterRegistry(youtubeClient?: YouTubePublishingClient): PublishAdapterRegistry { const adapters: PublishAdapter[] = [createYouTubePublishAdapter(youtubeClient), unavailable('tiktok'), unavailable('instagram')]; return { get(platform) { const adapter = adapters.find((item) => item.platform === platform); if (!adapter) throw new Error(`Unsupported publishing platform: ${platform}`); return adapter; }, list() { return adapters; } }; }
export function youtubePublishRequest(job: PublishJob): YouTubePublishRequest { return request(job); }
