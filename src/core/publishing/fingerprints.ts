import { stableId } from '@/core/editing/utils';
import type { ExportArtifact } from '@/core/export-intelligence';
import type { PublishJob, PublishMetadata, PublishSchedule, PublishTarget } from './types';
function canonical(value: unknown): string {
  if (value === undefined) return '';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
}
export function artifactFingerprint(artifact: ExportArtifact): string { return stableId('publish-artifact', `${artifact.path}:${artifact.sizeBytes}:${artifact.durationMs}:${artifact.verified}:${artifact.contentDigest ?? ''}:${JSON.stringify(artifact.diagnostics)}`); }
export function metadataFingerprint(metadata: PublishMetadata): string { return stableId('publish-metadata', JSON.stringify(metadata)); }
export function idempotencyKey(input: { artifactFingerprint: string; target: PublishTarget; intent: string }): string { return stableId('publish-idempotency', `${input.artifactFingerprint}:${input.target.platform}:${input.target.accountId}:${input.target.channelRef ?? ''}:${input.intent}`); }
export function approvalFingerprint(job: Pick<PublishJob, 'id'|'projectId'|'variantId'|'artifact'|'target'|'accountBinding'|'metadata'|'schedule'|'idempotencyKey'>): string {
  return stableId('publish-approval', canonical({ id: job.id, projectId: job.projectId, variantId: job.variantId, artifact: { ...job.artifact, diagnostics: undefined, verifiedExportReference: undefined, artifactPath: job.artifact.artifactPath, artifactFingerprint: job.artifact.artifactFingerprint, contentDigest: job.artifact.contentDigest ?? null, verified: job.artifact.verified, sourceManifestFingerprint: job.artifact.sourceManifestFingerprint }, target: job.target, account: { id: job.accountBinding.id, platform: job.accountBinding.platform, accountRef: job.accountBinding.accountRef, channelRef: job.accountBinding.channelRef }, metadata: job.metadata, schedule: { mode: job.schedule.mode, scheduledAtUtc: job.schedule.scheduledAtUtc, timezone: job.schedule.timezone }, idempotencyKey: job.idempotencyKey }));
}
export function scheduleFingerprint(schedule: PublishSchedule): string { return stableId('publish-schedule', JSON.stringify(schedule)); }
